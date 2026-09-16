import assert from "node:assert/strict";
import {
  advanceDoor,
  toggleDoor,
  pairedDoorId,
  setDoorOpen,
} from "../model/door-motion.js";
const swing = (70 * Math.PI) / 180;
for (const direction of [-1, 1]) {
  const door = {
    open: false,
    closedAngle: 0.7,
    swing: direction,
    leaf: { rotation: { y: 0.7 } },
  };
  assert.equal(toggleDoor(door, 0), true);
  assert.equal(door.leaf.rotation.y, 0.7, "No jump on click");
  assert(advanceDoor(door, 225));
  assert(
    Math.abs(door.leaf.rotation.y - (0.7 - (direction * swing) / 2)) < 1e-10,
    "Halfway eased position",
  );
  const midway = door.leaf.rotation.y;
  assert.equal(toggleDoor(door, 225), false);
  assert.equal(door.leaf.rotation.y, midway, "No jump on reversal");
  assert(advanceDoor(door, 300));
  assert(Math.abs(door.leaf.rotation.y - 0.7) < Math.abs(midway - 0.7));
  assert.equal(advanceDoor(door, 450), false);
  assert.equal(door.leaf.rotation.y, 0.7, "Exact closed endpoint");
  toggleDoor(door, 500);
  advanceDoor(door, 950);
  assert(
    Math.abs(door.leaf.rotation.y - (0.7 - direction * swing)) < 1e-10,
    "Exact open endpoint",
  );
  assert.equal(advanceDoor(door, 5000), false, "Idle motion stops");
  toggleDoor(door, 6000);
  toggleDoor(door, 6000);
  assert.equal(
    door.animation,
    null,
    "Two instant clicks remain at the original endpoint",
  );
}
console.log(
  "PASS eased swing, both hinge directions, smooth reversal, exact endpoints and idle completion.",
);
const pair = [
  { id: "entry-a", x: 0, y: 0, width: 820, angle: 0 },
  { id: "entry-b", x: 1640, y: 0, width: 820, angle: 180 },
];
assert.equal(pairedDoorId(pair[0], pair), "entry-b");
assert.equal(pairedDoorId(pair[1], pair), "entry-a");
assert.equal(pairedDoorId(pair[0], [pair[0], { ...pair[1], x: 1800 }]), null);
const leaves = [-1, 1].map((swing) => ({
  open: false,
  closedAngle: 0,
  swing,
  leaf: { rotation: { y: 0 } },
}));
for (const leaf of leaves) setDoorOpen(leaf, true, 0);
for (const leaf of leaves) advanceDoor(leaf, 225);
const midway = leaves.map((leaf) => leaf.leaf.rotation.y);
for (const leaf of leaves) setDoorOpen(leaf, false, 225);
assert.deepEqual(
  leaves.map((leaf) => leaf.leaf.rotation.y),
  midway,
);
for (const leaf of leaves) advanceDoor(leaf, 450);
assert(leaves.every((leaf) => !leaf.open && leaf.leaf.rotation.y === 0));
console.log(
  "PASS double-door recognition and synchronized reversal without jumps",
);
