const assert = require("node:assert/strict");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    const result = await page.evaluate(() => {
      const i = Building3D.instance,
        f = i.data.floors.find((f) => f.id === "first");
      const door = f.source.geometry.find(
        (g) => g.type === "door" && g.id === "linen",
      );
      const north = f.walls.find((w) => w.id === "linen-north");
      const west = f.walls.find((w) => w.id === "bed4-east");
      const leaf = i.model.pickables.find(
        (m) =>
          m.userData.kind === "door" &&
          m.userData.floor === "first" &&
          m.userData.name === "linen door",
      );
      const now = performance.now();
      i.model.toggleDoor('first:linen', now);
      i.model.updateDoors(now + 1000);
      return {
        width: door.width,
        hinge: [door.x, door.y],
        angle: door.angle,
        swing: door.swing,
        doorwayClear: !i.wallContains(north, 9210, 7975, 1000),
        lintelSolid: i.wallContains(north, 9210, 7975, 2500),
        farJambSolid: i.wallContains(north, 9800, 7975, 1000),
        wirPartitionSolid: i.wallContains(west, 8805, 8380, 1000),
        leafHinge: leaf.parent.position.toArray(),
        leafRotation: leaf.parent.rotation.y,
      };
    });
    assert.deepEqual(result.hinge, [8850, 7975]);
    assert.equal(result.width, 720);
    assert.equal(result.angle, 0);
    assert.equal(result.swing, 1);
    for (const key of [
      "doorwayClear",
      "lintelSolid",
      "farJambSolid",
      "wirPartitionSolid",
    ])
      assert.equal(result[key], true, key);
    assert.ok(
      Math.abs(result.leafHinge[0] - 8.85) < 1e-6 &&
        Math.abs(result.leafHinge[2] - 7.975) < 1e-6,
    );
    assert.ok(Math.abs(result.leafRotation + (70 * Math.PI) / 180) < 1e-6);
    console.log(
      "PASS linen: 720 mm north doorway into cupboard, left hinge, inward leaf; clear aperture, solid lintel/jamb and intact WIR partition.",
    );
  } finally {
    await browser.close();
  }
})();
