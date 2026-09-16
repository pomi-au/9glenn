import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createPointerInteraction,
  pointerStroke,
} from "../model/pointer-interaction.js";

const sample = (x, y, z, time) => ({ point: new THREE.Vector3(x, y, z), time });
assert.equal(
  pointerStroke(null, sample(1, 0, 0, 100)),
  null,
  "first sample has no force",
);
for (const current of [
  sample(0, 0, 0, 100),
  sample(1, 0, 0, 0),
  sample(1, 0, 0, -10),
  sample(1, 0, 0, 201),
  sample(Infinity, 0, 0, 100),
  sample(1, 0, 0, NaN),
])
  assert.equal(
    pointerStroke(sample(0, 0, 0, 0), current),
    null,
    "stationary, stale and invalid samples have no force",
  );
const slow = pointerStroke(sample(0, 0, 0, 0), sample(0.2, 0, 0, 100));
const fast = pointerStroke(sample(0, 0, 0, 0), sample(0.2, 0, 0, 50));
assert.equal(slow.velocity.x, 2);
assert.equal(fast.velocity.x, 4);
assert.equal(
  pointerStroke(sample(0.2, 0, 0, 0), sample(0, 0, 0, 100)).velocity.x,
  -2,
);
const bounded = pointerStroke(sample(0, 0, 0, 0), sample(100, 20, -10, 1));
assert(
  Math.abs(bounded.velocity.length() - 8) < 1e-10,
  "force speed is bounded even for a large jump",
);
assert(
  bounded.velocity.dot(new THREE.Vector3(100, 20, -10)) > 0,
  "clamping preserves direction",
);

class Element {
  listeners = new Map();
  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }
  removeEventListener(name, callback) {
    if (this.listeners.get(name) === callback) this.listeners.delete(name);
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    };
  }
  emit(name, fields = {}) {
    this.listeners.get(name)?.({
      target: this,
      clientX: 50,
      clientY: 50,
      timeStamp: 1,
      buttons: 0,
      pointerType: "mouse",
      ...fields,
    });
  }
}
const element = new Element();
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
camera.position.set(0, 10, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
const ground = new THREE.Group();
let controller = { id: "lawn", kind: "grass", group: ground };
let signature = "camera-1",
  enabled = true,
  hasHit = true,
  invalidations = 0;
const hitPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const impulses = [];
const pointer = createPointerInteraction({
  element,
  getCamera: () => camera,
  getSignature: () => signature,
  isEnabled: () => enabled,
  resolveHit(raycaster) {
    const point = raycaster.ray.intersectPlane(hitPlane, new THREE.Vector3());
    return hasHit && point
      ? { controller, point, normal: hitPlane.normal, instanceId: 7 }
      : null;
  },
  onImpulse(stroke) {
    impulses.push(stroke);
    return 1;
  },
  invalidate() {
    invalidations++;
  },
});
const move = (x, time, fields = {}) =>
  element.emit("pointermove", { clientX: x, timeStamp: time, ...fields });
move(50, 1);
assert.equal(
  pointer.diagnostics.raycasts,
  0,
  "pointer events queue work rather than raycasting synchronously",
);
assert.equal(pointer.process(), 0, "entry primes the first sample");
move(52, 101);
assert.equal(pointer.process(), 1);
assert.equal(
  impulses.at(-1).instanceId,
  7,
  "the visible leaf instance is passed to the physical response",
);
assert(Math.abs(impulses.at(-1).velocity.x - 2) < 1e-10);
const casts = pointer.diagnostics.raycasts;
move(53, 120);
move(54, 140);
move(56, 180);
assert.equal(pointer.process(), 1);
assert.equal(
  pointer.diagnostics.raycasts,
  casts + 1,
  "queued pointer moves require one raycast per frame",
);
assert.equal(
  pointer.process(),
  0,
  "no queued sample means no repeated impulse",
);
move(56, 190);
assert.equal(pointer.process(), 0, "stationary hover is a no-op");

for (const name of [
  "pointerleave",
  "pointercancel",
  "pointerdown",
  "lostpointercapture",
]) {
  element.emit(name);
  move(40, 200);
  assert.equal(pointer.process(), 0, `${name} prevents a first-entry spike`);
}
for (const fields of [
  { buttons: 1 },
  { buttons: 2 },
  { pointerType: "touch" },
  { pointerType: "pen" },
  { target: {} },
]) {
  move(40, 210, fields);
  assert.equal(
    pointer.diagnostics.pending,
    false,
    "drag, touch, pen and overlay events are rejected",
  );
  assert.equal(pointer.process(), 0);
  move(42, 250);
  assert.equal(
    pointer.process(),
    0,
    "rejected input clears previous surface velocity",
  );
}
move(44, 300);
assert.equal(pointer.process(), 1);
signature = "camera-2";
move(46, 350);
assert.equal(
  pointer.process(),
  0,
  "camera changes clear velocity even on the same surface",
);
controller = { id: "pool", kind: "water", group: ground };
move(48, 400);
assert.equal(pointer.process(), 0, "changing surface clears velocity");
hasHit = false;
move(49, 420);
assert.equal(
  pointer.process(),
  0,
  "an occluded or absent target cannot receive force",
);
hasHit = true;
move(50, 450);
assert.equal(
  pointer.process(),
  0,
  "returning from an occluder primes a new sample",
);
move(101, 480);
assert.equal(pointer.process(), 0, "outside-canvas motion is rejected");
move(50, 500);
assert.equal(pointer.process(), 0);
move(52, 800);
assert.equal(
  pointer.process(),
  0,
  "a long sampling pause injects no catch-up impulse",
);
move(54, 850);
assert.equal(
  pointer.process(),
  1,
  "normal movement resumes after the stale sample",
);
move(56, 900);
enabled = false;
assert.equal(
  pointer.process(),
  0,
  "deactivation rejects an already queued sample",
);
enabled = true;
move(58, 950);
assert.equal(
  pointer.process(),
  0,
  "reactivation starts without inherited velocity",
);

controller = { id: "tree", kind: "foliage", group: ground };
move(50, 1000);
pointer.process();
hitPlane.constant = -2;
move(50, 1050);
assert.equal(
  pointer.process(),
  0,
  "leaf-card depth changes do not create false surface motion",
);
move(52, 1100);
assert.equal(pointer.process(), 1);
assert(
  Math.abs(impulses.at(-1).velocity.y) < 1e-10,
  "foliage velocity stays in the shared view plane",
);
assert(invalidations > 0);
pointer.dispose();
assert.equal(element.listeners.size, 0, "dispose removes all event listeners");
assert.equal(pointer.diagnostics.pending, false);
console.log(
  "PASS pointer speed/direction/bounds, event coalescing, first-entry/stationary/stale reset, drag/touch/UI rejection, camera/target/occlusion resets, foliage depth stability and disposal",
);
