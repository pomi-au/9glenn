import assert from "node:assert/strict";
import { PerspectiveCamera, Scene } from "three";
import { renderQuality } from "../model/render-quality.js";

let now = 0;
globalThis.performance = { now: () => now };
const status = { textContent: "" };
globalThis.document = {
  querySelector: () => status,
  querySelectorAll: () => [],
  body: { classList: { toggle() {} } },
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function engine() {
  const calls = [];
  return {
    calls,
    samples: 1,
    maxSamples: 128,
    complete: false,
    renderSample() {
      calls.push("sample");
    },
    present() {
      calls.push("present");
    },
    setScene() {
      calls.push("scene");
    },
    updateCamera() {
      calls.push("camera");
    },
    setCamera() {
      calls.push("camera");
    },
    setSize() {
      calls.push("size");
    },
    dispose() {
      calls.push("dispose");
    },
    measureSamples: async () => ({}),
  };
}
const domElement = new EventTarget();
domElement.width = 400;
domElement.height = 300;
let creations = [];
let rasterFrames = 0;
const quality = renderQuality({
  renderer: { domElement },
  scene: new Scene(),
  selection: {
    render() {
      rasterFrames++;
    },
  },
  invalidate() {},
  onModeChange() {},
  createPhoto() {
    const pending = deferred();
    creations.push(pending);
    return pending.promise;
  },
});
const camera = new PerspectiveCamera();
const render = () => quality.render(camera, false, "stable");
quality.setMode("photo");
render();
now = 300;
render();
assert.equal(quality.preparing, true);
quality.sceneChanged();
camera.position.x = 2;
const preparingFrames = rasterFrames;
render();
assert.equal(
  rasterFrames,
  preparingFrames + 1,
  "camera changes remain visible during Photo preparation",
);
quality.render(camera, true, "stable");
assert.equal(
  rasterFrames,
  preparingFrames + 2,
  "moving vegetation remains visible during Photo preparation",
);
const first = engine();
creations[0].resolve(first);
await flush();
now = 600;
render();
assert.ok(
  first.calls.includes("scene"),
  "changes made while photo initializes must rebuild the snapshot",
);

const measurement = deferred();
first.measureSamples = () => measurement.promise;
now = 1400;
render();
const error = new Event("webgpu-error");
error.detail = "Test GPU error";
const originalError = console.error;
console.error = () => {};
domElement.dispatchEvent(error);
console.error = originalError;
assert.equal(quality.mode, "explore");
assert.equal(quality.photo, null);
assert.ok(
  first.calls.includes("dispose"),
  "failed GPU engines must be released before retry",
);

quality.setMode("photo");
now = 1700;
render();
const second = engine();
creations[1].resolve(second);
await flush();
measurement.reject(new Error("Late readback from discarded GPU engine"));
await flush();
assert.equal(
  quality.mode,
  "photo",
  "an old readback error must not fail a replacement engine",
);
assert.equal(quality.photo, second);
now = 2000;
render();
const beforeExport = rasterFrames;
camera.position.z = 8;
quality.present(camera);
assert.equal(
  rasterFrames,
  beforeExport + 1,
  "export immediately after a camera change must not present the previous camera's photo",
);

quality.dispose();
assert.ok(second.calls.includes("dispose"));
const cancelled = renderQuality({
  renderer: { domElement },
  scene: new Scene(),
  selection: { render() {} },
  invalidate() {},
  onModeChange() {},
  createPhoto() {
    const pending = deferred();
    creations.push(pending);
    return pending.promise;
  },
});
cancelled.setMode("photo");
cancelled.render(camera, false, "stable");
now = 2300;
cancelled.render(camera, false, "stable");
cancelled.setMode("explore");
const stale = engine();
creations[2].resolve(stale);
await flush();
assert.equal(cancelled.photo, null);
assert.ok(
  stale.calls.includes("dispose"),
  "initialization cancelled by an Explore switch must release its result",
);
cancelled.dispose();
console.log(
  "Render-quality checks passed: initialization races, failure/retry, stale readbacks, current-camera export, cleanup.",
);
