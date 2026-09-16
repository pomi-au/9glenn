import assert from "node:assert/strict";
import {
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  PerspectiveCamera,
  Scene,
} from "three";
import { createWaterMotion } from "../model/water-motion.js";
import {
  ballisticPoint,
  flightTime,
  createFountainFlow,
  FOUNTAIN_GRAVITY,
} from "../model/fountain-flow.js";
import { getPhysicalMaterial } from "../model/planar-optics.js";
import { createPhotoScene } from "../model/photo-scene.js";

const group = new Scene();
const water = createWaterMotion({
  group,
  footprint: [
    [-2, -2],
    [2, -2],
    [2, 2],
    [-2, 2],
  ],
  top: -0.16,
  bottom: -1.362,
  material: new MeshPhysicalMaterial(),
});
const nozzle = new Vector3(0, 0.457, -0.388),
  velocity = new Vector3(0, -0.06, -1.8);
const duration = flightTime(nozzle.y, velocity.y, -0.16);
const hit = ballisticPoint(nozzle, velocity, duration);
assert(Math.abs(hit.y + 0.16) < 1e-12);
assert(Math.abs(hit.z - (nozzle.z + velocity.z * duration)) < 1e-12);
const add = (geometry, material, part) => {
  const mesh = new Mesh(geometry, material);
  mesh.userData.part = part;
  group.add(mesh);
  return mesh;
};
const flow = createFountainFlow({
  add,
  origin: new Vector3(),
  nozzle,
  velocity,
  water,
  waterLevel: -0.16,
});
for (let i = 0; i < 10; i++) {
  flow.update(1 / 120);
  water.update(1 / 120);
}
assert.equal(
  flow.diagnostics.impacts,
  0,
  "No force before first water reaches the pool",
);
assert(
  group.children
    .filter((m) => m.userData.part === "fountain impact splash")
    .every((m) => !m.visible),
);
for (let i = 0; i < 180; i++) {
  flow.update(1 / 120);
  water.update(1 / 120);
}
assert(flow.diagnostics.impacts > 0);
assert(
  water.diagnostics.maxHeight > 0.001,
  "Stream produces actual surface displacement",
);
assert(
  Math.abs(
    flow.diagnostics.incomingVelocity[1] -
      (velocity.y - FOUNTAIN_GRAVITY * flow.diagnostics.flightTime),
  ) < 1e-10,
);
const position = flow.stream.geometry.attributes.position;
assert([...position.array].every(Number.isFinite));
assert(
  [...flow.stream.geometry.attributes.normal.array].every(Number.isFinite),
);
assert.equal(getPhysicalMaterial(flow.stream).transmission, 1);
assert.equal(getPhysicalMaterial(flow.stream).ior, 1.333);
assert(
  flow.stream.material.isNodeMaterial,
  "Live stream avoids screen-refraction target recursion",
);
const edges = new Map(),
  index = flow.stream.geometry.index.array;
for (let i = 0; i < index.length; i += 3)
  for (const [a, b] of [
    [index[i], index[i + 1]],
    [index[i + 1], index[i + 2]],
    [index[i + 2], index[i]],
  ]) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
assert(
  [...edges.values()].every((n) => n === 2),
  "Stream is a closed refraction volume",
);
const snapshot = createPhotoScene(group, new PerspectiveCamera());
const jet = snapshot.scene.children.find(
  (m) => m.userData.part === "fountain water jet",
);
assert.equal(jet.material.transmission, 1);
assert.equal(jet.material.isNodeMaterial, undefined);
assert.deepEqual(jet.geometry.attributes.position.array, position.array);
snapshot.dispose();
console.log(
  "PASS fountain flow: gravity trajectory/arrival, real impacts, finite closed stream and physical Photo snapshot",
);
