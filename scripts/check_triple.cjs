const assert = require("node:assert/strict");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const b = await chromium.launch({
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [],
      network = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (/^https?:/.test(r.url())) network.push(r.url());
    });
    await p.goto("file://" + path.resolve("9-glenn-viewer.html") + "#first");
    await p.locator("#mode-compare").click();
    await p.waitForFunction(() => window.TripleView?.instance?.drawing);
    assert.equal(
      await p.evaluate(() => TripleView.instance.renderer?.backend.isWebGPUBackend),
      true,
      "drawing and roof comparisons use the WebGPU backend",
    );
    assert.equal(await p.locator("#triple-drawing").inputValue(), "first");
    async function aligned() {
      // Pane resizing is applied on the next ResizeObserver/render cycle.
      await p.waitForFunction(() => {
        const view = TripleView.instance.view;
        const roots = [...document.querySelectorAll("#triple-view .triple-surface>svg")];
        return roots.length === 3 && roots.every((svg) =>
          svg.getAttribute("viewBox").split(/\s+/).map(Number).every((n, index) =>
            Math.abs(n - view[index]) < 0.01));
      });
      const result = await p.evaluate(() => {
        const i = TripleView.instance,
          v = i.view;
        const boxes = [
          ...document.querySelectorAll("#triple-view .triple-surface>svg"),
        ].map((s) => s.getAttribute("viewBox").split(/\s+/).map(Number));
        const centre = i.basis
          .point(v[0] + v[2] / 2, v[1] + v[3] / 2)
          .project(i.camera);
        const corner = i.basis.point(v[0], v[1]).project(i.camera);
        return { v, boxes, centre: centre.toArray(), corner: corner.toArray() };
      });
      for (const v of result.boxes)
        for (let n = 0; n < 4; n++)
          assert.ok(Math.abs(v[n] - result.v[n]) < 0.01);
      assert.ok(
        Math.abs(result.centre[0]) < 1e-6 && Math.abs(result.centre[1]) < 1e-6,
      );
      assert.ok(
        Math.abs(result.corner[0] + 1) < 1e-6 &&
          Math.abs(result.corner[1] - 1) < 1e-6,
        JSON.stringify(result),
      );
    }
    for (const id of [
      "ground",
      "first",
      "cellar",
      "elevation-1",
      "elevation-2",
      "elevation-3",
      "elevation-4",
      "section",
    ]) {
      await p.locator("#triple-drawing").selectOption(id);
      await p.waitForFunction(
        (id) => TripleView.instance.drawing.id === id,
        id,
      );
      await aligned();
      const clipState = await p.evaluate(() => {
        const instance = TripleView.instance;
        return {
          group: instance.clipping.isClippingGroup,
          includesModel: instance.model.root.parent === instance.clipping,
          planes: instance.clipping.clippingPlanes.map((plane) => [
            ...plane.normal.toArray(), plane.constant,
          ]),
          expected: instance.basis.clip
            ? [[...instance.basis.clip.normal.toArray(), instance.basis.clip.constant]]
            : [],
        };
      });
      assert(clipState.group && clipState.includesModel, "WebGPU clipping contains comparison model");
      assert.deepEqual(clipState.planes, clipState.expected, "section clipping follows the selected projection");
      assert.equal(await p.locator("#triple-error").isVisible(), false);
    }
    for (const id of ["roof-ground", "roof-first"]) {
      await p.locator("#triple-drawing").selectOption(id);
      await p.waitForFunction(
        (id) =>
          TripleView.instance.roofMode &&
          document.querySelector("#triple-drawing").value === id,
        id,
      );
      assert.equal(
        await p.locator("#triple-roof-component").inputValue(),
        id === "roof-first" ? "upper" : "garage-hip",
      );
      for (const component of [
        "upper",
        "lower",
        "main-hip",
        "central-hip",
        "arch-gable",
        "garage-hip",
        "portico-deck",
        "bay-lean-to",
        "all",
      ]) {
        await p.locator("#triple-roof-component").selectOption(component);
        await aligned();
        const evidence = await p.evaluate((component) => {
          const i = TripleView.instance;
          const offset = i.basis.floor.offset;
          const expected = i.data.spec.roofAssembly.faces
            .filter(
              (f) =>
                f.kind === "surface" &&
                (component === "all" ||
                  (["upper", "lower"].includes(component)
                    ? f.level === component
                    : f.component === component)),
            )
            .flatMap((f) =>
              f.rings.flatMap((r) =>
                r.map(([x, , z]) => [x - offset[0], z - offset[1]]),
              ),
            );
          const groups = ["#triple-vector", "#triple-source"].map((selector) =>
            [
              ...document.querySelectorAll(
                `${selector} [data-roof-comparison="model"] line`,
              ),
            ].map((line) =>
              ["x1", "y1", "x2", "y2"].map((key) => +line.getAttribute(key)),
            ),
          );
          const exact = groups.flat().every(([x1, y1, x2, y2]) =>
            [
              [x1, y1],
              [x2, y2],
            ].every(([x, y]) =>
              expected.some(([a, b]) => Math.hypot(x - a, y - b) < 0.01),
            ),
          );
          const shown = [i.model.roof, i.model.garageRoof]
            .filter((r) => r.visible)
            .flatMap((r) => r.children.filter((o) => o.visible));
          return {
            groups,
            exact,
            shown: shown.length,
            isolated: [...i.model.floorGroups.values()].every(
              (f) => !f.group.visible,
            ),
            components: shown.every(
              (o) =>
                component === "all" ||
                (["upper", "lower"].includes(component)
                  ? o.userData.level === component
                  : o.userData.component === component),
            ),
            annotations: document.querySelectorAll(
              '#triple-vector [data-roof-comparison="annotations"]>*',
            ).length,
          };
        }, component);
        assert.ok(
          evidence.exact &&
            evidence.isolated &&
            evidence.components &&
            evidence.shown > 0,
        );
        assert.deepEqual(evidence.groups[0], evidence.groups[1]);
        assert.ok(evidence.groups[0].length > 0);
        assert.equal(
          evidence.annotations,
          0,
          "No legacy orange roof annotations",
        );
        if (id === "roof-first" && ["upper", "all"].includes(component))
          await p.screenshot({
            path: `audit/garage-review/roof-${component}-check.png`,
          });
      }
      await p.locator("#triple-roof-component").selectOption("garage-hip");
      await p.locator("#triple-roof-overlay").uncheck();
      assert.equal(
        await p
          .locator('#triple-source [data-roof-comparison="model"]')
          .isVisible(),
        false,
      );
      await p.locator("#triple-roof-overlay").check();
      for (const selector of [
        "#triple-input",
        "#triple-vector>svg",
        "#triple-source>svg",
      ]) {
        const box = await p.locator(selector).boundingBox();
        const start = await p.evaluate(() => TripleView.instance.view);
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.wheel(0, -120);
        await p.waitForTimeout(60);
        assert.ok(
          (await p.evaluate(() => TripleView.instance.view))[2] < start[2],
        );
        await p.mouse.down();
        await p.mouse.move(
          box.x + box.width / 2 + 25,
          box.y + box.height / 2 + 15,
        );
        await p.mouse.up();
        await aligned();
      }
      await p.locator("#triple-fit").click();
      await p.screenshot({ path: `audit/garage-review/${id}-comparison.png` });
      await p.locator("#triple-angled").click();
      assert.equal(
        await p.locator("#triple-angled").getAttribute("aria-pressed"),
        "true",
      );
      await p.screenshot({ path: `audit/garage-review/${id}-angled.png` });
      await p.locator("#triple-aligned").click();
      if (id === "roof-first") {
        await p.setViewportSize({ width: 600, height: 900 });
        await aligned();
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await p.setViewportSize({ width: 1600, height: 1000 });
      }
      await p.reload();
      await p.waitForFunction(() => TripleView.instance?.roofMode);
      await aligned();
      assert.equal(await p.locator("#triple-drawing").inputValue(), id);
    }
    await p.locator("#mode-2d").click();
    await p.locator("#stage").waitFor({ state: "visible" });
    assert.equal(new URL(p.url()).hash, "#first");
    await p.locator("#mode-compare").click();
    await p.waitForFunction(() => !TripleView.instance.roofMode);
    assert.equal(await p.locator("#triple-roof-tools").isVisible(), false);
    await p.locator("#triple-drawing").selectOption("first");
    await p.waitForTimeout(100);
    for (const selector of [
      "#triple-input",
      "#triple-vector>svg",
      "#triple-source>svg",
    ]) {
      const box = await p.locator(selector).boundingBox();
      const start = await p.evaluate(() => TripleView.instance.view);
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.wheel(0, -150);
      await p.waitForTimeout(70);
      await aligned();
      assert.ok(
        (await p.evaluate(() => TripleView.instance.view))[2] < start[2],
      );
      await p.mouse.down();
      await p.mouse.move(
        box.x + box.width / 2 + 35,
        box.y + box.height / 2 + 20,
        { steps: 3 },
      );
      await p.mouse.up();
      await aligned();
    }
    await p.locator("#triple-fit").click();
    const outlineState = () =>
      p.evaluate(() => {
        const nodes = [];
        TripleView.instance.model.root.traverse((o) => {
          if (o.name === "comparison-outline") nodes.push(o);
        });
        return {
          count: nodes.length,
          visible: nodes.filter((o) => o.visible).length,
        };
      });
    const outlined = await outlineState();
    assert.ok(outlined.count > 900);
    assert.equal(outlined.visible, outlined.count);
    await p.locator("#triple-outlines").uncheck();
    assert.equal((await outlineState()).visible, 0);
    await aligned();
    await p.locator("#triple-outlines").check();
    assert.equal((await outlineState()).visible, outlined.count);
    await p.screenshot({ path: "tmp/triple-aligned.png" });
    await p.locator("#triple-angled").click();
    await p.screenshot({ path: "tmp/triple-angled.png" });
    const angled = await p.evaluate(() => {
      const i = TripleView.instance,
        v = i.view;
      return i.basis
        .point(v[0] + v[2] / 2, v[1] + v[3] / 2)
        .project(i.camera)
        .toArray();
    });
    assert.ok(Math.abs(angled[0]) < 1e-6 && Math.abs(angled[1]) < 1e-6);
    await p.locator("#triple-aligned").click();
    await aligned();
    await p.locator("#mode-2d").click();
    await p.locator("#stage").waitFor({ state: "visible" });
    await p.locator("#mode-3d").click();
    await p.waitForFunction(() => window.Building3D?.instance);
    assert.equal(await p.locator("#model-canvas").isVisible(), true);
    await p.locator("#mode-compare").click();
    await p.waitForTimeout(80);
    await aligned();
    await p.setViewportSize({ width: 600, height: 900 });
    await p.waitForTimeout(100);
    await aligned();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({ path: "tmp/triple-mobile.png", fullPage: true });
    await p.reload();
    await p.waitForFunction(() => window.TripleView?.instance?.drawing);
    await aligned();
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    const unsupported = await b.newPage();
    await unsupported.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { value: undefined });
    });
    await unsupported.goto("file://" + path.resolve("9-glenn-viewer.html") + "#compare/ground");
    await unsupported.waitForFunction(() => window.TripleView?.instance?.drawing);
    assert.equal(await unsupported.locator("#triple-model canvas").count(), 0,
      "missing WebGPU never creates a fallback canvas");
    assert(await unsupported.locator("#triple-error").isVisible());
    assert.equal(await unsupported.locator("#triple-vector > svg").count(), 1);
    assert.equal(await unsupported.locator("#triple-source > svg").count(), 1);
    await unsupported.locator("#triple-drawing").selectOption("first");
    await unsupported.waitForFunction(() => TripleView.instance.drawing.id === "first");
    await unsupported.close();
    console.log(
      "PASS WebGPU backend and section clipping; eight drawing projections and both roof modes; exact roof-edge projection, component isolation, PDF overlay, three-way pan/zoom, angled views, fit, mode switching, mobile resize, deep-link reload, offline loading and linked drawings without a GPU.",
    );
  } finally {
    await b.close();
  }
})();
