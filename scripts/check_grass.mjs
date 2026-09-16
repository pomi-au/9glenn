import assert from "node:assert/strict";
import * as THREE from "three";
import { createGrass } from "../model/grass-mesh.js";

const outer = [
  [0, 0],
  [4000, 0],
  [4000, 4000],
  [0, 4000],
];
const hole = [
  [1500, 1500],
  [2500, 1500],
  [2500, 2500],
  [1500, 2500],
];
const polygons = [[outer, hole]];
const grade = (x, z) => -0.1 - x / 10000 - z / 20000;
const options = { polygons, grade, maxClumps: 800 };
const grass = createGrass(options);
const initial = grass.mesh.instanceMatrix.array.slice();
const diagnostics = grass.diagnostics();
assert(diagnostics.clumps > 400 && diagnostics.clumps <= 800);
assert.equal(diagnostics.blades, diagnostics.clumps * 64);
assert.equal(grass.targets.length, 0, "Lawn proxy receives pointer hits");
assert.equal(
  grass.update(1 / 60),
  false,
  "Resting grass does not keep a render loop busy",
);

const matrix = new THREE.Matrix4();
const point = new THREE.Vector3();
function onLawn(x, z, epsilon = 0) {
  return (
    x >= -epsilon &&
    x <= 4 + epsilon &&
    z >= -epsilon &&
    z <= 4 + epsilon &&
    !(
      x > 1.5 + epsilon &&
      x < 2.5 - epsilon &&
      z > 1.5 + epsilon &&
      z < 2.5 - epsilon
    )
  );
}
function verifyRoots() {
  for (let i = 0; i < grass.mesh.count; i++) {
    grass.mesh.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    assert(
      onLawn(point.x, point.z),
      "All clump roots are inside the clipped polygon, outside its hole",
    );
    assert(
      Math.abs(point.y - grade(point.x * 1000, point.z * 1000) - 0.001) < 1e-6,
      "Roots follow the actual site grade",
    );
    for (const component of [12, 13, 14])
      assert.equal(
        grass.mesh.instanceMatrix.array[i * 16 + component],
        initial[i * 16 + component],
        "Spring bending cannot move a root",
      );
  }
}
verifyRoots();
const target = new THREE.Vector3(...diagnostics.sampleRoots[2]);
assert.equal(
  grass.impulse({ point: target, velocity: { x: 0, z: 0 } }),
  0,
  "Stationary pointer supplies no energy",
);
assert.equal(
  grass.impulse({ point: target, velocity: { x: Infinity, z: 0 } }),
  0,
);
assert.equal(
  grass.impulse({ point: target, velocity: { x: 2, z: 0 }, dt: -1 }),
  0,
);
assert.equal(
  grass.impulse({ point: { x: -100, z: -100 }, velocity: { x: 2, z: 0 } }),
  0,
  "Remote strokes do not activate grass",
);

function response(velocity, dt = 1 / 60) {
  const controller = createGrass(options);
  controller.impulse({ point: target, velocity, radius: 0.7 });
  controller.update(dt);
  return controller;
}
const slow = response({ x: 1, z: 0 });
const fast = response({ x: 4, z: 0 });
const opposite = response({ x: -4, z: 0 });
assert(
  fast.diagnostics().maxBend > slow.diagnostics().maxBend * 3.9,
  "Faster strokes produce stronger bends",
);
const targetIndex = Math.floor((grass.mesh.count - 1) * 0.5);
const ordinaryStroke = createGrass(options);
for (let frame = 0; frame < 12; frame++) {
  ordinaryStroke.impulse({
    point: target.clone().add(new THREE.Vector3(((frame - 6) * 2) / 60, 0, 0)),
    velocity: { x: 2, z: 0 },
    radius: 0.55,
    dt: 1 / 60,
  });
  ordinaryStroke.update(1 / 60);
}
ordinaryStroke.mesh.getMatrixAt(targetIndex, matrix);
const originalTargetMatrix = new THREE.Matrix4().fromArray(
  initial,
  targetIndex * 16,
);
const ordinaryRest = new THREE.Vector3(),
  ordinaryBent = new THREE.Vector3();
let ordinaryTipMotion = 0;
const bladePoints = grass.mesh.geometry.attributes.position;
for (let vertex = 0; vertex < bladePoints.count; vertex++) {
  ordinaryRest
    .fromBufferAttribute(bladePoints, vertex)
    .applyMatrix4(originalTargetMatrix);
  ordinaryBent.fromBufferAttribute(bladePoints, vertex).applyMatrix4(matrix);
  ordinaryTipMotion = Math.max(
    ordinaryTipMotion,
    ordinaryBent.distanceTo(ordinaryRest),
  );
}
assert.ok(
  ordinaryTipMotion >= 0.05,
  "an ordinary 2m/s brush must visibly move grass tips by at least 5cm",
);
for (let frame = 0; frame < 30; frame++) ordinaryStroke.update(1 / 60);
assert.ok(
  ordinaryStroke.diagnostics().moving,
  "grass keeps a noticeable spring recovery after the pointer stops",
);
let minTipHeight = Infinity,
  maxTipHeight = 0;
for (let clump = 0; clump < grass.mesh.count; clump++) {
  const verticalScale = initial[clump * 16 + 5];
  for (let blade = 0; blade < 64; blade++) {
    const height = bladePoints.getY(blade * 8 + 6) * verticalScale;
    minTipHeight = Math.min(minTipHeight, height);
    maxTipHeight = Math.max(maxTipHeight, height);
  }
}
assert.ok(
  minTipHeight >= 0.18 &&
    minTipHeight < 0.205 &&
    maxTipHeight > 0.3 &&
    maxTipHeight <= 0.32,
  "the actual blade tips span the requested varied 18–32cm height range",
);
console.log(
  `Ordinary grass stroke: ${(ordinaryTipMotion * 100).toFixed(1)}cm tip movement; actual heights ${(minTipHeight * 100).toFixed(1)}–${(maxTipHeight * 100).toFixed(1)}cm.`,
);
function bentAxis(controller) {
  controller.mesh.getMatrixAt(targetIndex, matrix);
  return new THREE.Vector3(0, 1, 0).transformDirection(matrix);
}
const positive = bentAxis(fast),
  negative = bentAxis(opposite);
assert(positive.x > 0 && negative.x < 0, "Grass follows stroke direction");
assert(
  Math.abs(positive.x + negative.x) < 1e-6 && Math.abs(positive.z) < 1e-6,
  "Opposite strokes are symmetric, with no invented sideways force",
);
const diagonal = response({ x: 2, z: -2 });
const diagonalAxis = bentAxis(diagonal);
assert(diagonalAxis.x > 0 && diagonalAxis.z < 0);
assert.deepEqual(
  response({ x: 3, z: 1 }, 1000).mesh.instanceMatrix.array,
  response({ x: 3, z: 1 }, 0.05).mesh.instanceMatrix.array,
  "A long inactive interval is bounded to a short stable step",
);

for (let frame = 0; frame < 90; frame++) {
  grass.impulse({
    point: target,
    velocity: { x: 500, z: -500 },
    radius: 1.5,
    dt: 1,
  });
  grass.update(1 / 30);
}
assert(
  grass.diagnostics().maxBend <= 1.150001,
  "Repeated extreme input cannot exceed the bend limit",
);
verifyRoots();
const positions = grass.mesh.geometry.attributes.position;
const restMatrix = new THREE.Matrix4();
const restRoot = new THREE.Vector3();
for (let i = 0; i < grass.mesh.count; i++) {
  grass.mesh.getMatrixAt(i, matrix);
  restMatrix.fromArray(initial, i * 16);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
    assert(
      onLawn(point.x, point.z, 1e-7),
      "Even bent blade tips stay out of paths and holes",
    );
    if (positions.getY(vertex) === 0) {
      restRoot.fromBufferAttribute(positions, vertex).applyMatrix4(restMatrix);
      assert(
        point.distanceTo(restRoot) < 1e-7,
        "Every distributed blade root stays fixed while its tip bends",
      );
      assert(
        Math.abs(point.y - grade(point.x * 1000, point.z * 1000) - 0.001) <
          1e-6,
        "Distributed roots also follow the graded soil",
      );
    }
  }
}
const energyAfterStroke = grass.diagnostics().energy;
for (let frame = 0; frame < 60; frame++) grass.update(1 / 60);
assert(
  grass.diagnostics().energy < energyAfterStroke * 0.12,
  "Spring energy dissipates after a stroke",
);
for (let frame = 0; frame < 420; frame++) grass.update(1 / 60);
assert.equal(
  grass.diagnostics().moving,
  false,
  "Grass settles exactly and stops requesting animation",
);
assert.equal(grass.diagnostics().energy, 0);
assert.deepEqual(
  grass.mesh.instanceMatrix.array,
  initial,
  "Settled grass exactly restores its original transforms",
);
grass.impulse({ point: target, velocity: { x: 2, z: 0 } });
grass.update(1 / 60);
grass.reset();
assert.deepEqual(
  grass.mesh.instanceMatrix.array,
  initial,
  "Reset restores every affected clump",
);

const empty = createGrass({ polygons: [], maxClumps: 0 });
assert.equal(empty.mesh.count, 0);
assert.equal(empty.update(1 / 60), false);
assert.deepEqual(empty.diagnostics().sampleRoots, []);
const capped = createGrass({
  polygons: [
    [
      [
        [0, 0],
        [50000, 0],
        [50000, 50000],
        [0, 50000],
      ],
    ],
  ],
  density: 200,
});
assert(
  capped.diagnostics().clumps <= 12000 && capped.diagnostics().blades <= 768000,
  "Whole-lawn geometry has a fixed upper bound",
);
console.log(
  `PASS ${diagnostics.clumps} clipped graded grass clumps: anchored roots and bent tips, directional speed response, bounded impulses/timesteps, dissipating energy, exact rest/reset, and 768,000-blade cap`,
);
