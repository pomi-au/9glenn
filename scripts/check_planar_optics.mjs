import assert from "node:assert/strict";
import {
  BoxGeometry,
  ClippingGroup,
  DirectionalLight,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector3,
  Vector4,
  WebGPUCoordinateSystem,
} from "three/webgpu";
import {
  createPlanarOptics,
  getPhysicalMaterial,
} from "../model/planar-optics.js";

const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `${message}: ${actual} != ${expected}`,
  );
const vectorClose = (actual, expected, message) =>
  assert.ok(actual.distanceTo(expected) < 1e-7, message);

function fixture() {
  const scene = new Scene(),
    root = new Group();
  scene.add(root);
  const captures = [],
    targets = new Set();
  const originalTarget = { name: "main target" },
    originalMRT = { name: "main MRT" };
  let target = originalTarget,
    mrt = originalMRT;
  const renderer = {
    backend: { isWebGPUBackend: true },
    coordinateSystem: WebGPUCoordinateSystem,
    autoClear: false,
    fail: false,
    duringRender: null,
    getRenderTarget: () => target,
    setRenderTarget: (value) => {
      target = value;
    },
    getMRT: () => mrt,
    setMRT: (value) => {
      mrt = value;
    },
    getDrawingBufferSize: (size) => size.set(1200, 800),
    render(renderScene, camera) {
      // Match the real renderer's initial coordinate-system normalization.
      // A mismatch here would erase the helper's oblique projection.
      if (camera.coordinateSystem !== this.coordinateSystem) {
        camera.coordinateSystem = this.coordinateSystem;
        camera.updateProjectionMatrix();
      }
      assert.equal(renderScene, scene);
      targets.add(target);
      captures.push({ camera: camera.clone(), target });
      this.duringRender?.();
      if (this.fail) throw new Error("intentional capture failure");
    },
  };
  const optics = createPlanarOptics(renderer, scene, root);
  function pane(x = 0, z = 0) {
    const physical = new MeshPhysicalMaterial({
      transmission: 1,
      thickness: 0.006,
    });
    const mesh = new Mesh(new BoxGeometry(2, 2, 0.006), physical);
    mesh.position.set(x, 0, z);
    root.add(mesh);
    return { mesh, physical, surface: optics.add(mesh) };
  }
  return {
    scene,
    root,
    renderer,
    optics,
    captures,
    targets,
    pane,
    originalTarget,
    originalMRT,
  };
}

function cameraOf(type, eye = new Vector3(3, 2, 5)) {
  const camera =
    type === "perspective"
      ? new PerspectiveCamera(55, 1.5, 0.1, 100)
      : new OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
  camera.position.copy(eye);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function ndcZ(point, camera) {
  const clip = new Vector4(...point.toArray(), 1)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);
  return clip.z / clip.w;
}

// Both camera types must preserve the oblique near plane even on their first
// render, before Three has initialized their WebGPU projection convention.
for (const type of ["orthographic", "perspective"]) {
  for (const angle of [0, 0.45, -0.7]) {
    const f = fixture(),
      { mesh, surface } = f.pane();
    f.root.rotation.y = angle;
    const camera = cameraOf(type);
    f.optics.update(camera);
    assert.equal(f.captures.length, 1);
    assert.equal(camera.coordinateSystem, WebGPUCoordinateSystem);
    const mirror = f.captures[0].camera;
    const plane = surface.localPlane.clone().applyMatrix4(mesh.matrixWorld);
    const eye = camera.getWorldPosition(new Vector3());
    if (plane.distanceToPoint(eye) < 0) plane.negate();
    vectorClose(
      mirror.position,
      eye
        .clone()
        .addScaledVector(plane.normal, -2 * plane.distanceToPoint(eye)),
      `${type}: reflected eye`,
    );
    vectorClose(
      mirror.getWorldDirection(new Vector3()),
      camera.getWorldDirection(new Vector3()).reflect(plane.normal),
      `${type}: reflected direction`,
    );
    const onPlane = plane.coplanarPoint(new Vector3());
    close(
      ndcZ(onPlane, mirror),
      0,
      `${type}: surface lies at WebGPU near plane`,
    );
    assert.ok(
      ndcZ(onPlane.clone().addScaledVector(plane.normal, 0.5), mirror) > 0,
      `${type}: real-camera side survives clipping`,
    );
    assert.ok(
      ndcZ(onPlane.clone().addScaledVector(plane.normal, -0.5), mirror) < 0,
      `${type}: geometry behind surface is clipped`,
    );
    const product = new Matrix4().multiplyMatrices(
      mirror.projectionMatrix,
      mirror.projectionMatrixInverse,
    );
    product.elements.forEach((value, i) =>
      close(value, i % 5 === 0 ? 1 : 0, "projection inverse"),
    );
    assert.equal(surface.available.value, 1);
    f.optics.dispose();
  }
}

// Closed glass draws only its near exterior face from either side.
{
  const f = fixture(),
    { mesh, physical } = f.pane();
  assert.equal(getPhysicalMaterial(mesh), physical);
  assert.equal(mesh.material.side, FrontSide);
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.forceSinglePass, true);
  mesh.updateMatrixWorld(true);
  for (const sign of [-1, 1]) {
    const hits = new Raycaster(
      new Vector3(0.17, 0.23, sign * 5),
      new Vector3(0, 0, -sign),
    ).intersectObject(mesh);
    assert.equal(
      hits.length,
      1,
      "closed pane has one visible exterior intersection",
    );
    close(hits[0].point.z, sign * 0.003, "visible pane face depth");
  }
  f.optics.dispose();
}

// Shared planes share captures; camera/root movement never creates an
// unbounded collection of reflection targets. Hidden ancestry is respected.
{
  const f = fixture(),
    a = f.pane(-1),
    b = f.pane(1);
  const camera = cameraOf("orthographic");
  f.optics.update(camera);
  assert.equal(f.optics.diagnostics.passes, 1);
  assert.equal(a.surface.reflection.value, b.surface.reflection.value);
  const firstProjection = a.surface.reflectedProjection.value.clone();
  for (let i = 0; i < 60; i++) {
    f.root.rotation.y = Math.sin(i / 10) * 0.4;
    camera.position.x = 3 + Math.sin(i / 8);
    camera.zoom = 1 + 0.1 * Math.sin(i / 11);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    f.optics.update(camera);
  }
  assert.ok(!firstProjection.equals(a.surface.reflectedProjection.value));
  assert.ok(f.optics.diagnostics.cachedPlanes <= 2);
  for (const target of f.targets) {
    assert.ok(target.width >= 64 && target.height >= 64);
    assert.ok(Math.max(target.width, target.height) <= 1024);
  }
  f.root.visible = false;
  f.optics.update(camera);
  assert.equal(f.optics.diagnostics.passes, 0);
  assert.equal(a.surface.available.value, 0);
  assert.equal(b.surface.available.value, 0);
  assert.equal(f.root.visible, false);
  assert.equal(a.mesh.visible, true);
  f.optics.dispose();
}

// Preserve application render state and clipping through failures, and keep
// shadow reuse local to one batch. The helper must also reject recursive work.
{
  const f = fixture(),
    a = f.pane(),
    b = f.pane(0, -1),
    hidden = f.pane();
  hidden.mesh.visible = false;
  const clipping = new ClippingGroup();
  const clip = new Plane(new Vector3(1, 0, 0), 0.4);
  clipping.clippingPlanes = [clip];
  clipping.clipShadows = true;
  f.root.add(clipping);
  clipping.add(a.mesh);
  const light = new DirectionalLight();
  light.castShadow = true;
  f.scene.add(light);
  const camera = cameraOf("orthographic");
  const shadowStates = [];
  f.renderer.duringRender = () => {
    assert.equal(a.mesh.visible, false);
    assert.equal(b.mesh.visible, false);
    assert.equal(hidden.mesh.visible, false);
    assert.equal(f.renderer.getMRT(), null);
    assert.equal(f.renderer.autoClear, true);
    shadowStates.push(light.shadow.autoUpdate);
    const count = f.captures.length;
    f.optics.update(camera);
    assert.equal(f.captures.length, count, "recursive update does no work");
  };
  f.renderer.fail = true;
  assert.throws(() => f.optics.update(camera), /intentional capture failure/);
  assert.equal(f.renderer.getRenderTarget(), f.originalTarget);
  assert.equal(f.renderer.getMRT(), f.originalMRT);
  assert.equal(f.renderer.autoClear, false);
  assert.equal(light.shadow.autoUpdate, true);
  assert.equal(a.mesh.visible, true);
  assert.equal(hidden.mesh.visible, false);
  assert.equal(f.optics.diagnostics.rendering, false);
  f.renderer.fail = false;
  shadowStates.length = 0;
  f.optics.update(camera);
  assert.deepEqual(shadowStates, [true, false]);
  assert.equal(light.shadow.autoUpdate, true);
  assert.equal(clipping.enabled, true);
  assert.equal(clipping.clipShadows, true);
  assert.equal(clipping.clippingPlanes[0], clip);
  close(clip.constant, 0.4, "existing clipping plane unchanged");
  let materialDisposals = 0,
    targetDisposals = 0;
  for (const item of [a, b, hidden])
    item.mesh.material.addEventListener("dispose", () => materialDisposals++);
  for (const target of f.targets)
    target.addEventListener("dispose", () => targetDisposals++);
  const targetCount = f.targets.size,
    passes = f.captures.length;
  f.optics.dispose();
  f.optics.dispose();
  f.optics.update(camera);
  assert.equal(materialDisposals, 3);
  assert.equal(targetDisposals, targetCount);
  assert.equal(f.optics.diagnostics.cachedPlanes, 0);
  assert.equal(f.captures.length, passes);
  assert.equal(a.mesh.material, a.physical);
  assert.equal(getPhysicalMaterial(a.mesh), a.physical);
}

// A whole house can expose many distinct planes simultaneously. Capture work
// stays bounded per frame, prioritizes the dominant surface, and still drains
// small-pane work. A cached image and its matching projection stay paired.
{
  const f = fixture(),
    panes = [];
  for (let i = 0; i < 23; i++) {
    const pane = f.pane(((i % 5) - 2) * 1.5, -1 + i * 0.08);
    pane.mesh.position.y = (Math.floor(i / 5) - 2) * 1.2;
    pane.mesh.scale.setScalar(i === 22 ? 0.8 : 0.15);
    panes.push(pane);
  }
  const camera = cameraOf("orthographic", new Vector3(0, 0, 9));
  const snapshots = () =>
    panes.map(({ surface }) => ({
      available: surface.available.value,
      texture: surface.reflection.value,
      projection: surface.reflectedProjection.value.clone(),
    }));
  function frame() {
    const before = snapshots(),
      start = f.captures.length;
    f.optics.update(camera);
    const captures = f.captures.slice(start);
    assert.ok(
      captures.length <= 3,
      `capture budget exceeded: ${captures.length}`,
    );
    assert.equal(f.optics.diagnostics.passes, captures.length);
    const refreshedTextures = new Set(
      captures.map(({ target }) => target.texture),
    );
    panes.forEach(({ surface }, i) => {
      if (
        !before[i].available ||
        refreshedTextures.has(surface.reflection.value)
      )
        return;
      assert.equal(
        surface.available.value,
        1,
        "cached panes remain visible while queued",
      );
      assert.equal(
        surface.reflection.value,
        before[i].texture,
        "queued panes retain their texture",
      );
      assert.ok(
        surface.reflectedProjection.value.equals(before[i].projection),
        "queued panes retain the projection matching their cached image",
      );
    });
    assert.ok(
      f.optics.diagnostics.cachedPlanes <= panes.length,
      "camera changes cannot grow the cache",
    );
    return captures;
  }
  const firstBatch = frame();
  assert.ok(firstBatch.length > 0);
  assert.equal(
    panes[22].surface.available.value,
    1,
    "largest visible plane is captured in the first batch",
  );
  for (
    let i = 0;
    i < 7 && panes.some(({ surface }) => !surface.available.value);
    i++
  )
    frame();
  assert.ok(
    panes.every(({ surface }) => surface.available.value === 1),
    "all 23 visible planes receive a reflection within 8 frames, including small panes",
  );
  assert.equal(f.optics.needsUpdate, false, "idle capture work finishes");
  assert.equal(f.optics.diagnostics.pending, 0);
  assert.equal(
    frame().length,
    0,
    "a settled camera does not recapture a static scene",
  );
  const original = snapshots();
  camera.position.x = 0.7;
  camera.lookAt(0, 0, 0);
  for (let i = 0; i < 23; i++) frame();
  assert.ok(
    panes.every(
      ({ surface }, i) =>
        !surface.reflectedProjection.value.equals(original[i].projection),
    ),
    "all visible cached planes eventually refresh after camera movement",
  );
  // Continuing movement must not starve small panes behind repeated large
  // surface refreshes, nor allocate a target for every camera pose.
  const previous = snapshots();
  for (let i = 0; i < 60; i++) {
    camera.position.x = 0.7 + 0.2 * Math.sin(i / 7);
    camera.lookAt(0, 0, 0);
    frame();
  }
  assert.ok(
    panes.every(
      ({ surface }, i) =>
        !surface.reflectedProjection.value.equals(previous[i].projection),
    ),
    "small panes cannot starve while the camera moves continuously",
  );
  const refreshed = new Set();
  for (let i = 0; i < 16; i++) {
    f.optics.invalidate();
    for (const { target } of frame()) refreshed.add(target.texture);
  }
  assert.ok(
    panes.every(({ surface }) => refreshed.has(surface.reflection.value)),
    "repeated scene invalidation cannot starve small panes",
  );
  f.optics.dispose();
}

// Comparison views need independent camera images. Returning to an unchanged
// camera must restore its cached image/projection rather than reuse the other
// view's reflection or force another capture.
{
  const f = fixture(),
    panes = [f.pane(-1, 0), f.pane(1, -0.5)];
  const cameras = [
    cameraOf("orthographic"),
    cameraOf("perspective", new Vector3(-3, 1, 6)),
  ];
  f.optics.update(cameras[0]);
  const first = panes.map(({ surface }) => ({
    texture: surface.reflection.value,
    projection: surface.reflectedProjection.value.clone(),
  }));
  f.optics.update(cameras[1]);
  panes.forEach(({ surface }, i) => {
    assert.notEqual(
      surface.reflection.value,
      first[i].texture,
      "cameras own separate reflection images",
    );
  });
  f.optics.update(cameras[0]);
  assert.equal(
    f.optics.diagnostics.passes,
    0,
    "returning to a settled camera reuses its cache",
  );
  panes.forEach(({ surface }, i) => {
    assert.equal(surface.reflection.value, first[i].texture);
    assert.ok(surface.reflectedProjection.value.equals(first[i].projection));
  });
  f.optics.dispose();
}

// Waves keep their preexpanded conservative bounds, while reflection uses the
// physical mean water level rather than the highest possible wave crest.
{
  const f = fixture();
  const water = new Mesh(new BoxGeometry(4, 1, 5), new MeshPhysicalMaterial());
  water.userData.part = "water";
  water.userData.restWaterLevel = 0.5;
  water.geometry.computeBoundingBox();
  water.geometry.boundingBox.max.y = 0.83;
  water.geometry.boundingBox.min.y = -0.72;
  const bounds = water.geometry.boundingBox.clone();
  f.root.add(water);
  const surface = f.optics.add(water);
  assert.ok(water.geometry.boundingBox.equals(bounds));
  close(
    surface.localPlane.distanceToPoint(new Vector3(0, 0.5, 0)),
    0,
    "mean water plane",
  );
  vectorClose(surface.localPlane.normal, new Vector3(0, 1, 0), "water normal");
  f.optics.dispose();
}

console.log(
  "PASS planar optics: WebGPU clipping, closed panes, 23-plane scheduling/fairness, per-camera caches, render-state recovery, disposal and mean water plane",
);
