import * as THREE from "three/webgpu";
import { normalView, positionView, vec4 } from "three/tsl";
import { createWebGPURenderer } from "../model/webgpu-renderer.js";

// Independent views of the actual model meshes. No SVG geometry is used here.
const config = {
  front: {
    drawing: "elevation-1",
    bounds: [-350, -3000, 27600, 10000],
    direction: [0, 0, 1],
    u: (p) => p.x * 1000,
  },
  rear: {
    drawing: "elevation-3",
    bounds: [-350, -3000, 27600, 10000],
    direction: [0, 0, -1],
    u: (p) => 26630 - p.x * 1000,
  },
  left: {
    drawing: "elevation-2",
    bounds: [-900, -3000, 16800, 10000],
    direction: [-1, 0, 0],
    u: (p) => p.z * 1000 - 600,
  },
  right: {
    drawing: "elevation-4",
    bounds: [-2500, -3000, 16800, 10000],
    direction: [1, 0, 0],
    u: (p) => 13790 - p.z * 1000,
  },
};
const mmPerPixel = 10;
function bytes64(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
function bottomUpPixels(readback, width, height) {
  // Native WebGPU rows are top-down and padded to 256-byte boundaries. Keep
  // the existing packed, bottom-up .f32 format consumed by the edge analysis.
  const rowLength = width * 4;
  const rowStride = Math.ceil(rowLength / 64) * 64;
  const pixels = new Float32Array(rowLength * height);
  for (let y = 0; y < height; y++) {
    const offset = (height - 1 - y) * rowStride;
    pixels.set(readback.subarray(offset, offset + rowLength), y * rowLength);
  }
  return pixels;
}
async function renderView(instance, view) {
  const cfg = config[view],
    [u0, v0, w, h] = cfg.bounds;
  const width = w / mmPerPixel,
    height = h / mmPerPixel;
  const renderer = await createWebGPURenderer({
    antialias: false,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  const target = new THREE.RenderTarget(width, height, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    samples: 0,
  });
  const scene = new THREE.Scene();
  const root = instance.model.root.clone(true);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.traverse((o) => {
    if (o.isLine || o.isSprite || o.name === "cellar" || o.name === "landscaping") o.visible = false;
  });
  scene.add(root);
  scene.updateMatrixWorld(true);
  const centreU = u0 + w / 2,
    centreY = (6041 - (v0 + h / 2)) / 1000;
  const centre = new THREE.Vector3();
  if (view === "front") centre.set(centreU / 1000, centreY, 8);
  if (view === "rear") centre.set((26630 - centreU) / 1000, centreY, 8);
  if (view === "left") centre.set(16, centreY, (centreU + 600) / 1000);
  if (view === "right") centre.set(16, centreY, (13790 - centreU) / 1000);
  const direction = new THREE.Vector3(...cfg.direction);
  const camera = new THREE.OrthographicCamera(
    -w / 2000,
    w / 2000,
    h / 2000,
    -h / 2000,
    0.1,
    150,
  );
  camera.position.copy(centre).addScaledVector(direction, 60);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  // Output camera-space normal X/Y, linear depth and occupancy. A later edge
  // pass detects physical creases without drawing artificial triangulation seams.
  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    // normalView includes instancing, normalization and the back-face sign.
    fragmentNode: vec4(normalView.xy, positionView.z.negate(), 1),
  });
  scene.overrideMaterial = material;
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  const readback = await renderer.readRenderTargetPixelsAsync(
    target, 0, 0, width, height,
  );
  const pixels = bottomUpPixels(readback, width, height);
  // A second plain white/black render is useful for checking the edge extraction.
  scene.overrideMaterial = null;
  scene.background = new THREE.Color(0xffffff);
  const white = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const black = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
  });
  root.traverse((o) => {
    if (o.isMesh) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      o.material =
        m === instance.model.materials.glass ||
        m === instance.model.materials.frame
          ? black
          : white;
    }
  });
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  const flat = renderer.domElement.toDataURL("image/png");
  // Visibility is tested against the physical closed-door model, independently
  // of how the elevation drawing labels and groups its opening rectangles.
  const meshes = [];
  root.traverseVisible((o) => {
    if (o.isMesh) meshes.push(o);
  });
  const ray = new THREE.Raycaster(),
    actual = [];
  for (const floor of instance.data.floors.filter((f) => f.id !== "cellar"))
    for (const cut of floor.cuts.filter((c) => c.window)) {
      const b = cut.bounds,
        horizontal = cut.window.axis === "h";
      if (["front", "rear"].includes(view) !== horizontal) continue;
      const pos = new THREE.Vector3(
        ((b.minX + b.maxX) / 2 + floor.offset[0]) / 1000,
        (floor.base + (cut.sill + cut.head) / 2) / 1000,
        ((b.minZ + b.maxZ) / 2 + floor.offset[1]) / 1000,
      );
      const from = pos.clone().addScaledVector(direction, 70);
      ray.set(from, direction.clone().negate());
      const hits = ray.intersectObjects(meshes, false),
        first = hits[0];
      const name = cut.window.id.replaceAll("-", " ") + " window";
      if (!first) continue;
      const assemblyDoor =
        cut.window.assembly &&
        first.object.userData.kind === "door" &&
        Math.abs(first.distance - 70) < 0.5;
      if (first.object.userData.name !== name && !assemblyDoor) continue;
      const u = horizontal
        ? view === "front"
          ? b.minX + floor.offset[0]
          : 26630 - b.maxX - floor.offset[0]
        : view === "left"
          ? b.minZ + floor.offset[1] - 600
          : 13790 - b.maxZ - floor.offset[1];
      actual.push({
        id: cut.window.id,
        floor: floor.id,
        x: u,
        y: 6041 - floor.base - cut.head,
        width: cut.window.length,
        height: cut.head - cut.sill,
        source: cut.heightSource,
      });
    }
  const drawing = window.DrawingModel.resolve(
    window.DRAWINGS.find((d) => d.id === cfg.drawing),
  );
  const expected = drawing.geometry.filter(
    (g) => g.type === "elevation-window",
  );
  const result = {
    view,
    drawing: cfg.drawing,
    bounds: cfg.bounds,
    width,
    height,
    mmPerPixel,
    buffer: bytes64(new Uint8Array(pixels.buffer)),
    flat,
    actual,
    expected,
  };
  target.dispose();
  material.dispose();
  white.dispose();
  black.dispose();
  renderer.dispose();
  return result;
}
window.ElevationAudit = { renderView, config, bottomUpPixels };
