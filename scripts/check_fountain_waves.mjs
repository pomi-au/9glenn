import assert from "node:assert/strict";
import { Group, MeshPhysicalMaterial, Raycaster, Vector3 } from "three";
import { createWaterMotion } from "../model/water-motion.js";

function water() {
  return createWaterMotion({
    group: new Group(),
    footprint: [
      [-3, -2],
      [3, -2],
      [3, 2],
      [-3, 2],
    ],
    top: 0,
    bottom: -1.2,
    material: new MeshPhysicalMaterial(),
  });
}
function volume(mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let sum = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    sum += a.dot(b.cross(c)) / 6;
  }
  return sum;
}
const source = { x: 0, z: 0 },
  motion = water();
const original = motion.mesh.geometry.attributes.position.array.slice();
const originalNormals = motion.mesh.geometry.attributes.normal.array.slice();
const originalVolume = volume(motion.mesh);
assert.equal(motion.sampleHeight(0, 0), 0);
assert.equal(motion.sampleHeight(3, 1), 0, "The fixed boundary is queryable");
assert.equal(motion.sampleHeight(3.01, 0), null);
assert.equal(motion.sampleHeight(NaN, 0), null);
for (const options of [
  {},
  { point: { x: NaN, z: 0 } },
  { point: { x: 0, y: Infinity, z: 0 } },
  { point: { x: 4, z: 0 } },
  { point: source, velocity: { x: 0, y: 3, z: 0 } },
  { point: source, velocity: { x: Infinity, y: -3, z: 0 } },
  { point: source, dt: NaN },
  { point: source, dt: Infinity },
  { point: source, strength: NaN },
  { point: source, strength: -1 },
  { point: source, radius: 0 },
  { point: source, radius: Infinity },
])
  assert.equal(
    motion.impact(options),
    false,
    "Invalid or non-impacting input is rejected",
  );
assert.deepEqual(motion.mesh.geometry.attributes.position.array, original);
assert.equal(motion.diagnostics.active, false);
let centerPeak = 0,
  farPeak = 0;
for (let frame = 0; frame < 90; frame++) {
  if (frame < 12) {
    assert(motion.impact({ point: source, dt: 1 / 60 }) > 0);
    assert(
      Math.abs(motion.diagnostics.lastImpactNet) < 1e-12,
      "Localized source adds no net displaced volume",
    );
  }
  motion.update(1 / 60);
  centerPeak = Math.max(centerPeak, Math.abs(motion.sampleHeight(0, 0)));
  farPeak = Math.max(farPeak, Math.abs(motion.sampleHeight(1, 0)));
  if (frame === 0)
    assert(
      Math.abs(motion.sampleHeight(1, 0)) < 1e-7,
      "The distant pool is not pushed globally",
    );
}
assert(
  centerPeak > 0.001 && centerPeak < 0.015,
  "A normal small stream creates a restrained visible depression",
);
assert(
  farPeak > 0.0001,
  "The solver propagates ripples beyond the impact footprint",
);
assert.notDeepEqual(
  motion.mesh.geometry.attributes.normal.array,
  originalNormals,
  "Real surface normals move with the waves",
);
assert(
  Math.abs(volume(motion.mesh) - originalVolume) < 1e-6,
  "The closed water volume is conserved",
);
motion.mesh.updateMatrixWorld(true);
for (const [x, z] of [
  [0.03, 0.02],
  [0.16, 0.05],
  [0.95, 0.4],
  [-2.8, 1.7],
]) {
  const ray = new Raycaster(new Vector3(x, 2, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(motion.mesh)[0];
  assert(hit);
  assert(
    Math.abs(motion.sampleHeight(x, z) - hit.point.y) < 1e-7,
    "Jet contact follows the actual rendered triangle surface",
  );
}
for (let frame = 0; frame < 1200; frame++) motion.update(1 / 60);
assert.equal(motion.diagnostics.active, false);
assert.deepEqual(
  motion.mesh.geometry.attributes.position.array,
  original,
  "Stopping the stream returns exactly to still water",
);
for (let frame = 0; frame < 600; frame++) {
  motion.impact({
    point: source,
    strength: 0.6 + 0.15 * Math.sin(frame * 0.7),
    dt: 1 / 60,
  });
  motion.update(1 / 60);
  assert(motion.diagnostics.maxHeight <= 0.0600001);
  assert(Number.isFinite(motion.diagnostics.energy));
}
assert(
  motion.diagnostics.maxHeight > 0.001 && motion.diagnostics.maxHeight < 0.015,
  "A continuous fountain stays bounded without flooding the wave field",
);
assert(Math.abs(volume(motion.mesh) - originalVolume) < 1e-6);
for (let frame = 0; frame < 120; frame++) {
  motion.impact({
    point: { x: 2.9, z: 0 },
    velocity: { x: 0, y: -1e9, z: 0 },
    strength: 1e9,
    radius: 100,
    dt: 100,
  });
  motion.update(1 / 60);
  assert(motion.diagnostics.maxHeight <= 0.0600001);
  assert(Number.isFinite(motion.diagnostics.energy));
  assert(Math.abs(motion.diagnostics.lastImpactNet) < 1e-12);
}
const position = motion.mesh.geometry.attributes.position;
const surfaceCount = motion.diagnostics.surfaceVertices;
for (let i = 0; i < position.count; i++) {
  assert.equal(position.getX(i), original[i * 3]);
  assert.equal(position.getZ(i), original[i * 3 + 2]);
  if (
    i >= surfaceCount ||
    Math.abs(position.getX(i)) === 3 ||
    Math.abs(position.getZ(i)) === 2
  )
    assert.equal(
      position.getY(i),
      original[i * 3 + 1],
      "Bottom and pool boundary stay fixed",
    );
}
const beforeHidden = position.array.slice();
motion.group.visible = false;
assert.equal(motion.impact({ point: source }), false);
assert.equal(motion.update(1 / 60), false);
assert.deepEqual(position.array, beforeHidden);
motion.group.visible = true;
motion.reset();
assert(
  motion.impulse({ point: source, velocity: new Vector3(2, 0, 0), dt: 1 / 60 }),
  "Pointer wakes remain available alongside fountain impacts",
);
assert(motion.update(1 / 60));
console.log(
  `PASS fountain waves: ${(centerPeak * 1000).toFixed(1)}mm contact ripple, ${(farPeak * 1000).toFixed(1)}mm propagation at1m, volume conservation, exact settling, continuous-source stability, fixed footprint and exact mesh-height queries`,
);
