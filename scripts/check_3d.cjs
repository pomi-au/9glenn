const assert = require("node:assert/strict");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    });
    async function withControls(action) {
      if (!await page.locator('#workspace-controls').evaluate(el => el.matches(':popover-open')))
        await page.locator('#controls-toggle').click();
      await action();
      if (await page.locator('#workspace-controls').evaluate(el => el.matches(':popover-open')))
        await page.locator('#controls-toggle').click();
    }
    const errors = [];
    const remoteRequests = [];
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) remoteRequests.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "file://" + path.join(__dirname, "../9-glenn-viewer.html") + "#3d",
    );
    await page.waitForFunction(() => window.Building3D?.instance, null, {
      timeout: 30000,
    });
    assert.equal(
      await page.evaluate(() => Building3D.instance.renderer.backend.isWebGPUBackend),
      true,
      "3D overview uses the WebGPU backend",
    );
    const shared = await page.evaluate(() => {
      const clone = structuredClone(window.DRAWINGS);
      const ground = clone.find((d) => d.id === "ground");
      function nodes(root) {
        return [root, ...(root.children || []).flatMap(nodes)];
      }
      const wall = nodes(ground.vector).find(
        (n) => n.attributes?.["data-wall"] === "study-west",
      );
      const oldX = +wall.attributes.x;
      wall.attributes.x = String(oldX + 120);
      const windowGroup = nodes(ground.vector).find(
        (n) => n.attributes?.["data-window"] === "gallery",
      );
      for (const node of windowGroup.children)
        if (node.tag === "rect")
          node.attributes.width = String(+node.attributes.width + 200);
      const svg = DrawingModel.documentFor(ground);
      const building = Building3D.parseBuilding(clone);
      const floor = building.floors.find((f) => f.id === "ground");
      const cut = floor.cuts.find((c) => c.id === "gallery");
      const frame = floor.source.geometry.find((g) => g.id === "gallery");
      const wallWithWindow = floor.walls.find((w) =>
        w.cuts.some((c) => c.id === "gallery"),
      );
      return {
        wallSVG: +svg
          .querySelector('[data-wall="study-west"]')
          .getAttribute("x"),
        wall3D: floor.walls.find((w) => w.id === "study-west").bounds.minX,
        expectedX: oldX + 120,
        windowSVG: +svg
          .querySelector('[data-window="gallery"] rect.window')
          .getAttribute("width"),
        window3D: frame.length,
        aperture: cut.bounds.maxX - cut.bounds.minX,
        holeClear: !Building3D.wallContains(
          wallWithWindow,
          frame.x + frame.length / 2,
          frame.y,
          (cut.sill + cut.head) / 2,
        ),
        sillSolid: Building3D.wallContains(
          wallWithWindow,
          frame.x + frame.length / 2,
          frame.y,
          cut.sill / 2,
        ),
        storedShapeDuplicates: ground.entities
          .filter((e) => ["wall", "window", "door"].includes(e.type))
          .some((e) => "x" in e || "width" in e || "length" in e),
        levels: building.floors.map((f) => [f.id, f.base, f.height]),
      };
    });
    assert.equal(shared.wallSVG, shared.expectedX);
    assert.equal(shared.wall3D, shared.expectedX);
    assert.equal(shared.windowSVG, 1410);
    assert.equal(shared.window3D, 1410);
    assert.equal(shared.aperture, 1410);
    assert(shared.holeClear);
    assert(shared.sillSolid);
    assert(!shared.storedShapeDuplicates);
    assert.deepEqual(shared.levels, [
      ["ground", 0, 3086],
      ["first", 3258, 2783],
      ["cellar", -2572, 2400],
    ]);
    console.log(
      "PASS one-source wall/window edits, actual opening cut, solid sill and section levels",
    );
    const doorChecks = await page.evaluate(() => {
      const floors = Building3D.instance.data.floors;
      const first = floors.find((f) => f.id === "first");
      const ground = floors.find((f) => f.id === "ground");
      const wall = (floor, id) => floor.walls.find((w) => w.id === id);
      const contains = (floor, id, x, y) =>
        Building3D.wallContains(wall(floor, id), x, y, 1000);
      const clone = structuredClone(window.DRAWINGS);
      function nodes(root) {
        return [root, ...(root.children || []).flatMap(nodes)];
      }
      const drawing = clone.find((d) => d.id === "ground");
      const doorNode = nodes(drawing.vector).find(
        (n) => n.attributes?.["data-door"] === "study",
      );
      doorNode.attributes.transform =
        "translate(9500 7900) rotate(0) scale(1 -1)";
      const svg = DrawingModel.documentFor(drawing);
      const changed = Building3D.parseBuilding(clone).floors.find(
        (f) => f.id === "ground",
      );
      const cut = changed.cuts.find((c) => c.id === "study");
      return {
        counts: floors.map((f) => f.cuts.filter((c) => c.door).length),
        showers: first.cuts.filter((c) => c.door?.kind === "shower").length,
        wcEastClear: !contains(first, "wc-ensuite", 16715, 2070),
        wcSouthSolid: contains(first, "ensuite-south", 16130, 2475),
        bed4NorthClear: !contains(first, "bed4-entry-north", 5320, 8625),
        bed4WestSolid: contains(first, "bed5-bed4", 4865, 9000),
        wirSouthClear: !contains(first, "wir4-base", 6720, 8625),
        wirWestSolid: contains(first, "wir4-west", 6315, 8220),
        laundryLobbyClear: !contains(ground, "laundry-lobby-jamb", 16815, 3965),
        stairDoorClear: !contains(ground, "under-stair-north", 16630, 7915),
        stairJambSolid: contains(ground, "under-stair-north", 16140, 7915),
        diningGlazing: ground.cuts.find((c) => c.id === "dining-glazing")
          ?.window.length,
        svgTransform: svg
          .querySelector('[data-door="study"]')
          .getAttribute("transform"),
        door3D: [
          cut.door.x,
          cut.door.y,
          cut.door.angle,
          cut.door.swing,
          cut.door.width,
        ],
        openingBounds: [
          cut.bounds.minX,
          cut.bounds.maxX,
          cut.bounds.minZ,
          cut.bounds.maxZ,
        ],
      };
    });
    assert.deepEqual(doorChecks.counts, [22, 21, 0]);
    assert.equal(doorChecks.showers, 3);
    for (const key of [
      "wcEastClear",
      "wcSouthSolid",
      "bed4NorthClear",
      "bed4WestSolid",
      "wirSouthClear",
      "wirWestSolid",
      "laundryLobbyClear",
      "stairDoorClear",
      "stairJambSolid",
    ])
      assert(doorChecks[key], key);
    assert.equal(doorChecks.diningGlazing, 2770);
    assert.equal(
      doorChecks.svgTransform,
      "translate(9500 7900) rotate(0) scale(1 -1)",
    );
    assert.deepEqual(doorChecks.door3D, [9500, 7900, 0, -1, 820]);
    assert.deepEqual(doorChecks.openingBounds, [9500, 10320, 7847, 7953]);
    console.log(
      "PASS 43 shared doors, 3 showers, corrected 3D apertures/jambs and live SVG/3D door edit propagation",
    );
    console.log(
      await page.evaluate(() => ({
        floors: Building3D.instance.data.floors.map((f) => ({
          id: f.id,
          walls: f.walls.length,
          cuts: f.cuts.length,
          offset: f.offset,
          base: f.base,
        })),
        meshes: Building3D.instance.model.pickables.length,
      })),
    );
    await page.screenshot({ path: "tmp/3d-building.png" });
    const initial = await page.evaluate(() =>
      Building3D.instance.camera.position.toArray(),
    );
    const initialOrientation = await page.evaluate(() =>
      Building3D.instance.camera.quaternion.toArray(),
    );
    const initialModel = await page.evaluate(() =>
      Building3D.instance.pivot.quaternion.toArray(),
    );
    const canvas = page.locator("#model-canvas canvas");
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 90,
      box.y + box.height / 2 + 40,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.deepEqual(
      await page.evaluate(() => Building3D.instance.camera.position.toArray()),
      initial,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        Building3D.instance.camera.quaternion.toArray(),
      ),
      initialOrientation,
    );
    assert.notDeepEqual(
      await page.evaluate(() => Building3D.instance.pivot.quaternion.toArray()),
      initialModel,
    );
    await page.screenshot({ path: "tmp/3d-model-rotation.png" });
    await withControls(() => page.locator("#model-cut").check());
    const planeErrors = await page.evaluate(() => {
      const i = Building3D.instance;
      i.render();
      return [...i.model.floorGroups.values()].map((e) => {
        const point = e.group.position.clone().set(1, 1.2, 1);
        e.group.localToWorld(point);
        return Math.abs(
          e.clipGroup.clippingPlanes[0].distanceToPoint(point),
        );
      });
    });
    assert(
      planeErrors.every((error) => error < 1e-8),
      "Cut planes must follow tilted floors",
    );
    await withControls(() => page.locator("#model-cut").uncheck());
    const beforePan = await page.evaluate(() =>
      Building3D.instance.camera.position.toArray(),
    );
    const beforePanRotation = await page.evaluate(() =>
      Building3D.instance.pivot.quaternion.toArray(),
    );
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(
      box.x + box.width / 2 + 140,
      box.y + box.height / 2 + 70,
      { steps: 4 },
    );
    await page.mouse.up({ button: "right" });
    assert.notDeepEqual(
      await page.evaluate(() => Building3D.instance.camera.position.toArray()),
      beforePan,
    );
    assert.deepEqual(
      await page.evaluate(() => Building3D.instance.pivot.quaternion.toArray()),
      beforePanRotation,
    );
    const zoom = await page.evaluate(() => Building3D.instance.camera.zoom);
    await page.mouse.wheel(0, -150);
    await page.waitForFunction(
      (z) => Building3D.instance.camera.zoom !== z,
      zoom,
    );
    await page.locator('[data-camera="front"]').click();
    assert.equal(
      await page.locator('[data-camera="front"]').getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#model-reset").click();
    assert.deepEqual(
      await page.evaluate(() => Building3D.instance.pivot.quaternion.toArray()),
      [0, 0, 0, 1],
    );
    const rotationLimits = async () =>
      page.evaluate(() => {
        const i = Building3D.instance;
        const up = i.camera.position
          .clone()
          .set(0, 1, 0)
          .applyQuaternion(i.pivot.quaternion);
        const view = i.camera.position
          .clone()
          .set(0, 0, 1)
          .applyQuaternion(i.camera.quaternion);
        const right = i.camera.position
          .clone()
          .set(1, 0, 0)
          .applyQuaternion(i.camera.quaternion);
        return {
          elevation:
            (Math.asin(Math.min(1, Math.max(-1, up.dot(view)))) * 180) /
            Math.PI,
          roll: up.dot(right),
          camera: i.camera.position.toArray(),
        };
      });
    async function dragBetween(x1, y1, x2, y2) {
      await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, {
        steps: 12,
      });
      await page.mouse.up();
    }
    const fixedCamera = (await rotationLimits()).camera;
    await dragBetween(0.25, 0.15, 0.75, 0.85);
    const upperLimit = await rotationLimits();
    assert(upperLimit.elevation > 89.99 && upperLimit.elevation <= 90);
    assert(Math.abs(upperLimit.roll) < 1e-8);
    assert.deepEqual(upperLimit.camera, fixedCamera);
    await dragBetween(0.75, 0.85, 0.25, 0.15);
    const lowerLimit = await rotationLimits();
    assert(Math.abs(lowerLimit.elevation - 2.7) < 1e-6);
    assert(Math.abs(lowerLimit.roll) < 1e-8);
    assert.deepEqual(lowerLimit.camera, fixedCamera);
    await dragBetween(0.25, 0.5, 0.75, 0.5);
    await dragBetween(0.25, 0.5, 0.75, 0.5);
    const turned = await rotationLimits();
    assert(Math.abs(turned.elevation - 2.7) < 1e-6);
    assert(Math.abs(turned.roll) < 1e-8);
    const background = await page.evaluate(() => {
      const s = Building3D.instance.scene;
      const { data, width, height } = s.background.image;
      const lastRow = (height - 1) * width * 4;
      return {
        stageMeshes: s.children.filter(
          (o) => o.isMesh || o.type === "GridHelper",
        ).length,
        top: [...data.slice(0, 4)],
        bottom: [...data.slice(lastRow, lastRow + 4)],
        illuminatesScene: s.environment === s.background,
      };
    });
    assert.equal(background.stageMeshes, 0);
    assert.notDeepEqual(background.top, background.bottom);
    assert(background.illuminatesScene, "daylight background also illuminates the model");
    await page.locator("#model-reset").click();
    console.log(
      "PASS reference tilt limits, unrestricted horizontal turn, no roll/flip, fixed camera, no ground/grid, gradient background",
    );
    await withControls(() => page.locator("#model-dimensions").check());
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".dimension-label-3d:not([hidden])")
          .length === 2,
    );
    assert.equal(
      await page.locator(".dimension-label-3d:not([hidden])").count(),
      2,
    );
    await withControls(() => page.locator("#model-dimensions").uncheck());
    const download = page.waitForEvent("download");
    await page.locator("#model-download").click();
    assert.equal((await download).suggestedFilename(), "9-glenn-explore-all.png");

    for (const floor of ["ground", "first", "cellar"]) {
      await withControls(() => page.locator(`[data-floor="${floor}"]`).click());
      await withControls(() => page.locator("#model-cut").check());
      await withControls(() => page.locator("#model-labels").check());
      await page.locator('[data-camera="top"]').click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".room-label-3d:not([hidden])").length > 0,
      );
      assert.equal(
        await page.evaluate(
          () =>
            [...Building3D.instance.model.floorGroups.values()].filter(
              (e) => e.group.visible,
            ).length,
        ),
        1,
      );
      if (floor === "ground") {
        const pick = await page.evaluate(() => {
          const i = Building3D.instance,
            a = i.model.labelAnchors.find((a) => a.name === "STUDY");
          const p = a.group.localToWorld(a.point.clone()).project(i.camera);
          const r = i.renderer.domElement.getBoundingClientRect();
          return {
            x: r.left + (p.x / 2 + 0.5) * r.width,
            y: r.top + (-p.y / 2 + 0.5) * r.height,
          };
        });
        await page.mouse.click(pick.x, pick.y);
        assert.match(
          await page.locator("#model-selected-name").textContent(),
          /STUDY/,
        );
      }
      await page.screenshot({ path: `tmp/3d-${floor}.png` });
    }
    await withControls(() => page.locator('[data-floor="all"]').click());
    await withControls(() => page.locator("#model-cut").uncheck());
    await withControls(() => page.locator("#model-labels").uncheck());
    await withControls(() => page.locator("#explode").fill("4"));
    await page.locator("#explode").dispatchEvent("input");
    await page.screenshot({ path: "tmp/3d-exploded.png" });
    assert.equal(
      await page.evaluate(
        () =>
          Building3D.instance.model.floorGroups.get("first").group.position.y,
      ),
      11.258,
    );
    await withControls(() => page.locator("#model-roof").uncheck());
    assert.equal(
      await page.evaluate(() => Building3D.instance.model.roof.visible),
      false,
    );
    await withControls(() => page.locator("#model-roof").check());
    await page.locator("#mode-2d").click();
    await page.waitForSelector("#stage svg", { state: "visible" });
    assert.equal(await page.locator(".nav-item").count(), 8);
    await page.locator("#mode-3d").click();
    await page.waitForSelector("#model-canvas canvas", { state: "visible" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "tmp/3d-mobile.png" });
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, []);
    console.log(
      "PASS offline 3D, fixed-camera model rotation, transformed cut planes, pan/zoom, camera presets, floor isolation, cutaway, labels, dimensions, exploded levels, roof, PNG export, 2D return and mobile layout",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
