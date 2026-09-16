const assert = require("node:assert/strict");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "file://" + path.resolve("audit/comparison.html") + "#first",
    );
    const pair = page.locator("#first figure>svg");
    const view = async (locator) =>
      locator.evaluate((s) =>
        s.getAttribute("viewBox").split(/\s+/).map(Number),
      );
    const initial = await view(pair.first());
    const other = await view(page.locator("#ground figure>svg").first());
    const same = async () =>
      assert.deepEqual(await view(pair.first()), await view(pair.last()));
    for (const pane of [pair.first(), pair.last()]) {
      await pane.scrollIntoViewIfNeeded();
      const b = await pane.boundingBox();
      await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.4);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(80);
      await same();
      await page.mouse.down();
      await page.mouse.move(
        b.x + b.width * 0.6 + 55,
        b.y + b.height * 0.4 + 30,
        { steps: 4 },
      );
      await page.mouse.up();
      await same();
    }
    assert.ok((await view(pair.first()))[2] < initial[2]);
    assert.deepEqual(
      await view(page.locator("#ground figure>svg").first()),
      other,
    );
    await page.locator("#first [data-fit]").click();
    assert.deepEqual(await view(pair.first()), initial);
    await page.locator('#first [data-zoom="in"]').click();
    await same();
    assert.ok((await view(pair.first()))[2] < initial[2]);
    await page.setViewportSize({ width: 600, height: 900 });
    await pair.last().scrollIntoViewIfNeeded();
    await pair.last().focus();
    await page.keyboard.press("ArrowRight");
    await same();
    await page.keyboard.press("Home");
    await same();
    assert.deepEqual(await view(pair.last()), initial);
    await page.screenshot({ path: "tmp/comparison-mobile.png" });
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto("file://" + path.resolve("index.html") + "#first");
    await page.locator("#reference-button").click();
    await page.waitForTimeout(150);
    const svg = page.locator("#stage>svg"),
      pdf = page.locator("#source-viewport");
    async function aligned() {
      const cameras = await page.evaluate(() =>
        ["#stage>svg", "#source-viewport"].map((selector) => {
          const s = document.querySelector(selector),
            v = s.viewBox.baseVal;
          return [v.x + v.width / 2, v.y + v.height / 2, s.getScreenCTM().a];
        }),
      );
      for (let i = 0; i < 3; i++)
        assert.ok(
          Math.abs(cameras[0][i] - cameras[1][i]) < 0.01,
          JSON.stringify(cameras),
        );
    }
    await aligned();
    for (const pane of [svg, pdf]) {
      const b = await pane.boundingBox();
      const before = await view(svg);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.wheel(0, -180);
      await page.waitForTimeout(80);
      await aligned();
      assert.ok((await view(svg))[2] < before[2]);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 35, {
        steps: 4,
      });
      await page.mouse.up();
      await aligned();
    }
    await page.screenshot({ path: "tmp/comparison-linked.png" });
    await page.locator("#source-page").selectOption("5");
    await page.waitForTimeout(120);
    await aligned();
    assert.match(
      await page.locator("#view-title").textContent(),
      /Elevation 1/,
    );
    await page.locator("#source-page").selectOption("1");
    assert.equal(await pdf.isVisible(), false);
    assert.equal(await page.locator("#source-image").isVisible(), true);
    await page.locator("#source-page").selectOption("2");
    await page.waitForTimeout(100);
    await aligned();
    await page.setViewportSize({ width: 600, height: 900 });
    await page.waitForTimeout(150);
    await aligned();
    // Two touch points exercise pinch and subsequent one-finger panning.
    await pdf.evaluate((s) => {
      const b = s.getBoundingClientRect();
      s.setPointerCapture = () => {};
      const send = (type, id, x, y) =>
        s.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            button: 0,
            clientX: b.x + x,
            clientY: b.y + y,
            bubbles: true,
          }),
        );
      send("pointerdown", 1, 80, 50);
      send("pointerdown", 2, 160, 50);
      send("pointermove", 2, 220, 70);
      send("pointerup", 2, 220, 70);
      send("pointermove", 1, 100, 60);
      send("pointercancel", 1, 100, 60);
    });
    await aligned();
    assert.deepEqual(errors, []);
    console.log(
      "PASS linked pan/zoom in both panes, per-drawing audit state, fit/buttons/keyboard, matching world centre and scale, source switching, mobile resize and touch pinch.",
    );
  } finally {
    await browser.close();
  }
})();
