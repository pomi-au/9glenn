import assert from "node:assert/strict";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { createFoliageMotion } from "../model/foliage-motion.js";
import { createWaterMotion } from "../model/water-motion.js";

function foliage(form = "tree") {
  const group = new Group();
  const mesh = new InstancedMesh(
    new BoxGeometry(2, 2, 2),
    new MeshStandardMaterial(),
    3,
  );
  for (let i = 0; i < 3; i++)
    mesh.setMatrixAt(
      i,
      new Matrix4().makeScale(0.45, 0.7, 0.45).setPosition(i * 0.3, 2, 0),
    );
  group.add(mesh);
  const rest = mesh.instanceMatrix.array.slice();
  return {
    controller: createFoliageMotion(mesh, { plant: { id: "test", form } }),
    rest,
  };
}
function advance(controller, seconds, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) controller.update(dt);
}
const point = new Vector3(0, 2, 0);
function brush(controller, speed) {
  controller.impulse({
    point,
    velocity: new Vector3(speed, 0, 0),
    radius: 1,
    dt: 1 / 60,
  });
  controller.update(1 / 60);
}
const slow = foliage(),
  fast = foliage(),
  opposite = foliage();
const edgeHit = foliage();
assert.equal(
  edgeHit.controller.impulse({
    point: new Vector3(0.45, 2.7, 0.45),
    velocity: new Vector3(0, 5, 0),
    radius: 0.65,
    dt: 1 / 60,
    instanceId: 0,
  }),
  true,
  "a visible card edge drives its raycast-selected cluster even beyond the centre falloff radius",
);
edgeHit.controller.update(1 / 60);
assert.notDeepEqual(
  edgeHit.controller.mesh.instanceMatrix.array.slice(0, 16),
  edgeHit.rest.slice(0, 16),
);
assert.equal(
  slow.controller.update(1000),
  false,
  "still foliage must remain still",
);
assert.equal(
  slow.controller.impulse({ point, velocity: new Vector3(), dt: 1 / 60 }),
  false,
);
brush(slow.controller, 1);
brush(fast.controller, 5);
brush(opposite.controller, -5);
assert.ok(
  fast.controller.diagnostics.maxAngle >
    slow.controller.diagnostics.maxAngle * 3,
  "faster strokes transfer more momentum",
);
const plus = new Matrix4(),
  minus = new Matrix4();
fast.controller.mesh.getMatrixAt(0, plus);
opposite.controller.mesh.getMatrixAt(0, minus);
assert.ok(
  plus.elements[12] > 0 && minus.elements[12] < 0,
  "opposite strokes bend crowns in opposite directions",
);
for (const form of ["tree", "column"]) {
  const upward = foliage(form),
    downward = foliage(form);
  for (const [entry, speed] of [
    [upward, 5],
    [downward, -5],
  ]) {
    assert.equal(
      entry.controller.impulse({
        point,
        velocity: new Vector3(0, speed, 0),
        radius: 1,
        dt: 1 / 60,
      }),
      true,
      "a front-view vertical stroke transfers leaf momentum",
    );
    entry.controller.update(1 / 60);
    assert.ok(entry.controller.diagnostics.maxAngle > 0);
    assert.notDeepEqual(entry.controller.mesh.instanceMatrix.array, entry.rest);
  }
  upward.controller.mesh.getMatrixAt(0, plus);
  downward.controller.mesh.getMatrixAt(0, minus);
  assert.ok(
    plus.elements[2] * minus.elements[2] < 0,
    "up/down strokes reverse leaf torsion about upright attachments",
  );
  advance(upward.controller, 10);
  assert.deepEqual(
    upward.controller.mesh.instanceMatrix.array,
    upward.rest,
    "vertical flutter settles at exact rest",
  );
}
const hiddenMatrix = fast.controller.mesh.instanceMatrix.array.slice();
const ordinaryTree = foliage();
for (let frame = 0; frame < 8; frame++) {
  ordinaryTree.controller.impulse({
    point: new Vector3((frame * 2) / 60, 2, 0),
    velocity: new Vector3(2, 0, 0),
    radius: 0.65,
    dt: 1 / 60,
    instanceId: 0,
  });
  ordinaryTree.controller.update(1 / 60);
}
const treeRestMatrix = new Matrix4().fromArray(ordinaryTree.rest, 0),
  treeMovedMatrix = new Matrix4();
ordinaryTree.controller.mesh.getMatrixAt(0, treeMovedMatrix);
const restVertex = new Vector3(),
  movedVertex = new Vector3();
let ordinaryLeafMotion = 0;
for (
  let vertex = 0;
  vertex < ordinaryTree.controller.mesh.geometry.attributes.position.count;
  vertex++
) {
  restVertex
    .fromBufferAttribute(
      ordinaryTree.controller.mesh.geometry.attributes.position,
      vertex,
    )
    .applyMatrix4(treeRestMatrix);
  movedVertex
    .fromBufferAttribute(
      ordinaryTree.controller.mesh.geometry.attributes.position,
      vertex,
    )
    .applyMatrix4(treeMovedMatrix);
  ordinaryLeafMotion = Math.max(
    ordinaryLeafMotion,
    restVertex.distanceTo(movedVertex),
  );
}
assert.ok(
  ordinaryLeafMotion >= 0.08 && ordinaryLeafMotion <= 0.380001,
  "ordinary 2m/s strokes visibly sway tree leaves by at least 8cm inside their bound",
);
advance(ordinaryTree.controller, 0.5);
assert.ok(
  ordinaryTree.controller.diagnostics.active,
  "tree leaves recover with sustained spring motion",
);
fast.controller.group.visible = false;
assert.equal(
  fast.controller.update(600),
  false,
  "hidden plants must not keep animation active",
);
assert.deepEqual(fast.controller.mesh.instanceMatrix.array, hiddenMatrix);
fast.controller.group.visible = true;
advance(fast.controller, 10);
assert.equal(fast.controller.diagnostics.active, false);
assert.deepEqual(
  fast.controller.mesh.instanceMatrix.array,
  fast.rest,
  "settled foliage returns to exact resting matrices",
);

const constrained = foliage("column");
const restMatrix = new Matrix4(),
  movedMatrix = new Matrix4();
const before = new Vector3(),
  after = new Vector3();
const positions = constrained.controller.mesh.geometry.attributes.position;
for (let frame = 0; frame < 120; frame++) {
  constrained.controller.impulse({
    point,
    velocity: new Vector3(
      frame % 3 === 0 ? 1000 : 0,
      frame % 3 === 1 ? 1000 : 0,
      frame % 3 === 2 ? 1000 : 0,
    ),
    radius: 1,
    dt: 1 / 60,
  });
  constrained.controller.update(1 / 60);
  for (let instance = 0; instance < 3; instance++) {
    restMatrix.fromArray(constrained.rest, instance * 16);
    constrained.controller.mesh.getMatrixAt(instance, movedMatrix);
    for (let vertex = 0; vertex < positions.count; vertex++) {
      before.fromBufferAttribute(positions, vertex).applyMatrix4(restMatrix);
      after.fromBufferAttribute(positions, vertex).applyMatrix4(movedMatrix);
      assert.ok(
        before.distanceTo(after) <= 0.002501,
        "planter/roof foliage stays inside its 2.5mm motion allowance",
      );
    }
    before.set(0, -0.8, 0).applyMatrix4(restMatrix);
    after.set(0, -0.8, 0).applyMatrix4(movedMatrix);
    assert.ok(
      before.distanceTo(after) < 1e-6,
      "leaf stem attachments remain fixed",
    );
  }
}
const longStep = foliage(),
  boundedStep = foliage();
brush(longStep.controller, 3);
brush(boundedStep.controller, 3);
longStep.controller.update(60);
boundedStep.controller.update(1 / 15);
assert.deepEqual(
  longStep.controller.mesh.instanceMatrix.array,
  boundedStep.controller.mesh.instanceMatrix.array,
  "long pause dt must be bounded",
);

function poolRing() {
  const rear = Array.from({ length: 33 }, (_, i) => [
    29.63 - 1.3 * Math.cos((i * Math.PI) / 32),
    6.6 - 1.3 * Math.sin((i * Math.PI) / 32),
  ]);
  const front = rear.map(([x, z]) => [x, 18.9 - z]).reverse();
  return [
    [27.63, 6.6],
    ...rear,
    [31.63, 6.6],
    [31.63, 12.3],
    ...front,
    [27.63, 12.3],
  ];
}
function water(
  footprint = [
    [0, 0],
    [2, 0],
    [2, 4],
    [0, 4],
  ],
) {
  return createWaterMotion({
    group: new Group(),
    footprint,
    top: -0.16,
    bottom: -1.36,
    material: new MeshStandardMaterial(),
    metadata: { poolId: "test" },
  });
}
function volume(geometry) {
  const p = geometry.attributes.position,
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let value = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    a.fromBufferAttribute(p, geometry.index.getX(i));
    b.fromBufferAttribute(p, geometry.index.getX(i + 1));
    c.fromBufferAttribute(p, geometry.index.getX(i + 2));
    value += a.dot(b.cross(c)) / 6;
  }
  return value;
}
const pool = water(poolRing()),
  g = pool.mesh.geometry,
  rest = g.attributes.position.array.slice();
const edgeCounts = new Map();
for (let i = 0; i < g.index.count; i += 3)
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ]) {
    const x = g.index.getX(i + a),
      y = g.index.getX(i + b),
      key = x < y ? `${x},${y}` : `${y},${x}`;
    edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
  }
assert.ok(
  [...edgeCounts.values()].every((count) => count === 2),
  "clipped surface, sidewalls and floor must form a watertight manifold",
);
const surfaceVertexCount = pool.diagnostics.surfaceVertices;
const triangleKeys = new Set();
const triangleA = new Vector3(),
  triangleB = new Vector3(),
  triangleC = new Vector3();
for (let i = 0; i < g.index.count; i += 3) {
  const triangle = [g.index.getX(i), g.index.getX(i + 1), g.index.getX(i + 2)];
  const key = triangle
    .slice()
    .sort((a, b) => a - b)
    .join(",");
  assert.ok(
    !triangleKeys.has(key),
    "water must not contain duplicate coplanar triangles",
  );
  triangleKeys.add(key);
  triangleA.fromBufferAttribute(g.attributes.position, triangle[0]);
  triangleB.fromBufferAttribute(g.attributes.position, triangle[1]);
  triangleC.fromBufferAttribute(g.attributes.position, triangle[2]);
  const facingY = triangleB.sub(triangleA).cross(triangleC.sub(triangleA)).y;
  if (triangle.every((index) => index < surfaceVertexCount))
    assert.ok(
      facingY > 0,
      "single-sided live water must retain its upward-facing surface",
    );
  if (triangle.every((index) => index >= surfaceVertexCount))
    assert.ok(
      facingY < 0,
      "closed water bottom must face downward so it is culled above the tiled floor",
    );
}
g.computeBoundingBox();
assert.ok(Math.abs(g.boundingBox.max.x - g.boundingBox.min.x - 4) < 1e-5);
assert.ok(Math.abs(g.boundingBox.max.z - g.boundingBox.min.z - 8.3) < 1e-5);
assert.ok(Math.abs(g.boundingBox.min.y + 1.36) < 1e-6);
assert.ok(Math.abs(g.boundingBox.max.y + 0.16) < 1e-6);
assert.equal(pool.update(1), false, "no idle waves without a stroke");
const initialVolume = volume(g);
const boundaryIds = new Set();
for (let i = 0; i < g.index.count; i += 3) {
  const triangle = [g.index.getX(i), g.index.getX(i + 1), g.index.getX(i + 2)];
  if (
    triangle.some((index) => index < pool.diagnostics.surfaceVertices) &&
    triangle.some((index) => index >= pool.diagnostics.surfaceVertices)
  ) {
    triangle
      .filter((index) => index < pool.diagnostics.surfaceVertices)
      .forEach((index) => boundaryIds.add(index));
  }
}
pool.impulse({
  point: new Vector3(29.63, -0.16, 9),
  velocity: new Vector3(5, 0, 0),
  radius: 0.4,
  dt: 1 / 60,
});
advance(pool, 0.3);
assert.ok(
  pool.diagnostics.maxHeight > 0.0001,
  "a stroke must make actual surface waves",
);
assert.ok(
  Math.abs(volume(g) - initialVolume) < 1e-4,
  "waves conserve the mean water level and closed volume",
);
for (const index of boundaryIds)
  assert.equal(
    g.attributes.position.getY(index),
    rest[index * 3 + 1],
    "waterline boundary vertices stay fixed against the basin",
  );
const pausedSurface = g.attributes.position.array.slice();
pool.group.visible = false;
assert.equal(pool.update(1000), false);
assert.deepEqual(
  g.attributes.position.array,
  pausedSurface,
  "hidden waves pause without accumulating elapsed time",
);
pool.group.visible = true;
for (let i = pool.diagnostics.surfaceVertices * 3; i < rest.length; i++)
  assert.equal(
    g.attributes.position.array[i],
    rest[i],
    "water floor and footprint remain fixed",
  );
const initialEnergy = pool.diagnostics.energy;
advance(pool, 2);
assert.ok(
  pool.diagnostics.energy < initialEnergy,
  "unforced waves dissipate energy",
);
advance(pool, 15);
assert.equal(pool.diagnostics.active, false);
assert.deepEqual(
  g.attributes.position.array,
  rest,
  "settled water restores its exact still surface",
);
const waterSlow = water(),
  waterFast = water(),
  waterOpposite = water();
const ordinaryWater = water();
let ordinaryCrest = 0;
for (let frame = 0; frame < 12; frame++) {
  ordinaryWater.impulse({
    point: new Vector3(0.8 + (frame * 2) / 60, -0.16, 2),
    velocity: new Vector3(2, 0, 0),
    radius: 0.32,
    dt: 1 / 60,
  });
  ordinaryWater.update(1 / 60);
  ordinaryCrest = Math.max(ordinaryCrest, ordinaryWater.diagnostics.maxHeight);
}
assert.ok(
  ordinaryCrest >= 0.015 && ordinaryCrest <= 0.0600001,
  "ordinary 2m/s strokes create a clearly shaped 1.5–6cm wake",
);
console.log(
  `Ordinary strokes: ${(ordinaryLeafMotion * 100).toFixed(1)}cm tree-leaf movement, ${(ordinaryCrest * 100).toFixed(1)}cm water crest.`,
);
for (const [controller, speed] of [
  [waterSlow, 1],
  [waterFast, 5],
  [waterOpposite, -5],
]) {
  controller.impulse({
    point: new Vector3(1, -0.16, 2),
    velocity: new Vector3(speed, 0, 0),
    radius: 0.4,
    dt: 1 / 60,
  });
  controller.update(1 / 60);
}
assert.ok(
  waterFast.diagnostics.energy > waterSlow.diagnostics.energy * 10,
  "mouse speed controls wake energy",
);
assert.notDeepEqual(
  waterFast.mesh.geometry.attributes.position.array,
  waterOpposite.mesh.geometry.attributes.position.array,
  "opposite strokes reverse the directional wake",
);
for (let i = 0; i < 100; i++) {
  waterFast.impulse({
    point: new Vector3(1, -0.16, 2),
    velocity: new Vector3(1000, 0, 0),
    radius: 0.5,
    dt: 100,
  });
  waterFast.update(100);
  assert.ok(waterFast.diagnostics.maxHeight <= 0.0600001);
}
assert.ok(
  [...waterFast.mesh.geometry.attributes.position.array].every(Number.isFinite),
);
console.log(
  "Environment physics passed: anchored foliage, speed/direction, constrained clearance, timestep bounds, exact settling, watertight pool, volume and bounded ripples.",
);
