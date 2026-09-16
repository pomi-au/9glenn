import assert from "node:assert/strict";
import {
  BoxGeometry,
  ClippingGroup,
  DirectionalLight,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Plane,
  Scene,
  Vector3,
} from "three/webgpu";
import { clipPhotoGeometry, createPhotoScene } from "../model/photo-scene.js";
import { createPlanarOptics } from "../model/planar-optics.js";

const cube = new BoxGeometry(2, 2, 2);
const transform = new Matrix4().makeTranslation(0, 3, 0);
const clipped = clipPhotoGeometry(cube, transform, [
  new Plane(new Vector3(0, -1, 0), 3),
]);
assert.ok(clipped.attributes.position.count > 0);
for (let i = 0; i < clipped.attributes.position.count; i++) {
  assert.ok(
    clipped.attributes.position.getY(i) <= 1e-6,
    "world plane must clip in local coordinates",
  );
  assert.ok(
    Number.isFinite(clipped.attributes.uv.getX(i)),
    "cut edges preserve interpolated texture coordinates",
  );
}
assert.equal(
  clipped.groups.length,
  5,
  "fully removed face must not leave a material group",
);
assert.equal(
  cube.attributes.position.count,
  24,
  "clipping must preserve source geometry",
);

const scene = new Scene();
const environment = new DataTexture(
  new Float32Array([0.3, 0.6, 0.9, 1]),
  1,
  1,
  RGBAFormat,
  FloatType,
);
scene.environment = environment;
const material = new MeshStandardMaterial();
const hidden = new Group();
hidden.visible = false;
hidden.add(new Mesh(cube, material));
scene.add(hidden);
const instances = new InstancedMesh(cube, material, 2);
instances.setMatrixAt(1, new Matrix4().makeTranslation(3, 0, 0));
scene.add(instances);
const group = new ClippingGroup();
group.clippingPlanes = [new Plane(new Vector3(0, -1, 0), 0)];
group.add(new Mesh(cube, material));
scene.add(group);
const snapshot = createPhotoScene(scene, new PerspectiveCamera());
assert.equal(snapshot.scene.environment.type, HalfFloatType);
assert.equal(snapshot.scene.environment.minFilter, LinearFilter);
assert.equal(snapshot.scene.environment.magFilter, LinearFilter);
assert.equal(
  environment.type,
  FloatType,
  "GPU sampler preparation preserves the live environment",
);
assert.ok(environment.image.data instanceof Float32Array);
assert.equal(
  snapshot.scene.children.length,
  2,
  "hidden ancestors stay hidden in photo snapshots",
);
assert.equal(
  snapshot.scene.children[0].isInstancedMesh,
  true,
  "unclipped instances stay instanced",
);
assert.equal(snapshot.scene.children[0].count, 2);
assert.notEqual(
  snapshot.scene.children[0].geometry,
  instances.geometry,
  "BVH preparation must not mutate geometry used by live WebGPU render objects",
);
assert.notEqual(
  snapshot.scene.children[1].geometry,
  cube,
  "cutaway owns a separate baked geometry",
);
for (
  let i = 0;
  i < snapshot.scene.children[1].geometry.attributes.position.count;
  i++
) {
  assert.ok(
    snapshot.scene.children[1].geometry.attributes.position.getY(i) <= 1e-6,
  );
}
snapshot.dispose();
const sun = new DirectionalLight(0xffffff, 2.5);
sun.userData.photoSun = true;
sun.position.set(0, 10, 0);
scene.add(sun, sun.target);
const daylight = createPhotoScene(scene, new PerspectiveCamera());
const emitter = daylight.scene.children.find(
  (object) => object.isRectAreaLight,
);
assert.ok(emitter, "photo daylight uses a finite emitter for soft shadows");
assert.equal(
  emitter.intensity,
  62.5,
  "sun emitter preserves irradiance at its target",
);
daylight.dispose();
// Live planar capture materials must never leak into physical Photo snapshots,
// including the separate path that bakes a cutaway into new geometry.
const opticalScene = new Scene();
const glassMaterial = new MeshPhysicalMaterial({
  transmission: 1,
  ior: 1.52,
  thickness: 0.006,
});
const glass = new Mesh(new BoxGeometry(2, 2, 0.006), glassMaterial);
glass.userData.opticalSurface = "glass";
glass.userData.paneAxis = "z";
opticalScene.add(glass);
const cutGlass = new Mesh(glass.geometry, glassMaterial);
cutGlass.userData = { ...glass.userData };
const glassCutaway = new ClippingGroup();
glassCutaway.clippingPlanes = [new Plane(new Vector3(0, -1, 0), 0)];
glassCutaway.add(cutGlass);
opticalScene.add(glassCutaway);
const optics = createPlanarOptics(
  { backend: { isWebGPUBackend: true } },
  opticalScene,
);
assert.notEqual(glass.material, glassMaterial);
const physicalSnapshot = createPhotoScene(
  opticalScene,
  new PerspectiveCamera(),
);
assert.equal(physicalSnapshot.scene.children.length, 2);
for (const pane of physicalSnapshot.scene.children) {
  assert.equal(pane.material, glassMaterial);
  assert.equal(pane.material.transmission, 1);
  assert.equal(pane.material.thickness, 0.006);
  assert.equal(pane.material.isNodeMaterial, undefined);
}
physicalSnapshot.dispose();
optics.dispose();
assert.equal(glass.material, glassMaterial);
assert.equal(cutGlass.material, glassMaterial);
glass.geometry.dispose();
glassMaterial.dispose();
clipped.dispose();
console.log(
  "Photo scene checks passed: clipping, UVs, material groups, source preservation, hidden parents, instances.",
);
