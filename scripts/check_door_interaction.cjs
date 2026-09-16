const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const angle =
    process.env.BROWSER_ANGLE ||
    (process.platform === "darwin" ? "metal" : "swiftshader");
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--enable-webgl",
      `--use-angle=${angle}`,
      ...(angle === "swiftshader" ? ["--enable-unsafe-swiftshader"] : []),
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "file://" + path.join(__dirname, "../9-glenn-viewer.html") + "#3d",
    );
    await page.waitForFunction(() => Building3D?.instance);
    const defaults = await page.evaluate(() =>
      [...Building3D.instance.model.doors].map(([key, d]) => ({
        key,
        open: d.open,
        pairedKey: d.pairedKey,
        closed: d.leaf.rotation.y === d.closedAngle,
      })),
    );
    assert.equal(defaults.length, 43);
    assert(defaults.every((d) => !d.open && d.closed));
    assert.equal(
      defaults.filter((d) => d.pairedKey).length,
      16,
      "Eight double-door pairs",
    );
    async function aim(key, cut = false) {
      return page.evaluate(
        ({ key, cut }) => {
          const i = Building3D.instance,
            d = i.model.doors.get(key);
          i.settings.floor = key.split(":")[0];
          i.settings.cut = cut;
          i.settings.roof = false;
          i.settings.labels = false;
          i.update();
          i.pivot.rotation.set(0, 0, 0);
          i.pivot.updateMatrixWorld(true);
          const mesh = d.leaf.children[0],
            target = mesh.localToWorld(
              i.camera.position.clone().set(0, cut ? -0.35 : 0, 0),
            );
          const normal = i.camera.position
            .clone()
            .set(0, 0, 1)
            .transformDirection(d.leaf.matrixWorld);
          i.camera.position
            .copy(target)
            .addScaledVector(
              normal,
              key === "ground:cupboard-b" ? -0.06 : 0.06,
            );
          i.camera.lookAt(target);
          i.camera.zoom = 12;
          i.camera.near = 0.01;
          i.camera.updateProjectionMatrix();
          i.render();
          const b = i.renderer.domElement.getBoundingClientRect();
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        },
        { key, cut },
      );
    }
    for (const { key, pairedKey } of defaults) {
      let p = await aim(key);
      await page.mouse.click(p.x, p.y);
      assert.equal(
        await page.evaluate(
          (key) => Building3D.instance.model.doors.get(key).open,
          key,
        ),
        true,
        key + " opens by click",
      );
      if (pairedKey)
        assert(
          await page.evaluate(
            (key) => Building3D.instance.model.doors.get(key).open,
            pairedKey,
          ),
          key + " opens its matching leaf",
        );
      await page.waitForFunction(
        (key) => !Building3D.instance.model.doors.get(key).animation,
        key,
      );
      p = await aim(key);
      await page.mouse.click(p.x, p.y);
      assert.equal(
        await page.evaluate(
          (key) => Building3D.instance.model.doors.get(key).open,
          key,
        ),
        false,
        key + " closes by click",
      );
      if (pairedKey)
        assert.equal(
          await page.evaluate(
            (key) => Building3D.instance.model.doors.get(key).open,
            pairedKey,
          ),
          false,
          key + " closes its matching leaf",
        );
      await page.waitForFunction(
        (key) => !Building3D.instance.model.doors.get(key).animation,
        key,
      );
    }
    for (const key of [
      "first:bath1-shower",
      "first:bath2-shower",
      "first:ensuite-shower",
    ]) {
      for (const open of [true, false]) {
        const p = await aim(key, true);
        await page.mouse.click(p.x, p.y);
        assert.equal(
          await page.evaluate(
            (key) => Building3D.instance.model.doors.get(key).open,
            key,
          ),
          open,
          key + " toggles in cutaway",
        );
        assert.equal(
          await page.locator("#model-selected-name").textContent(),
          key.split(":")[1].replaceAll("-", " ") + " door",
        );
        await page.waitForFunction(
          (key) => !Building3D.instance.model.doors.get(key).animation,
          key,
        );
      }
    }
    let p = await aim("ground:laundry-rear");
    await page.mouse.click(p.x, p.y, { button: "right" });
    assert.equal(
      await page.evaluate(
        () => Building3D.instance.model.doors.get("ground:laundry-rear").open,
      ),
      false,
      "Right click does not toggle",
    );
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y + 15, { steps: 4 });
    await page.mouse.up();
    assert.equal(
      await page.evaluate(
        () => Building3D.instance.model.doors.get("ground:laundry-rear").open,
      ),
      false,
      "Drag does not toggle",
    );
    p = await aim("ground:laundry-rear");
    await page.mouse.click(p.x, p.y);
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.settings.cut = true;
      i.update();
      i.settings.cut = false;
      i.settings.floor = "first";
      i.update();
      i.settings.floor = "ground";
      i.update();
    });
    assert.equal(
      await page.evaluate(
        () => Building3D.instance.model.doors.get("ground:laundry-rear").open,
      ),
      true,
      "Floor and cutaway controls preserve state",
    );
    await page.reload();
    await page.waitForFunction(() => Building3D?.instance);
    assert(
      await page.evaluate(() =>
        [...Building3D.instance.model.doors.values()].every((d) => !d.open),
      ),
      "Reload starts closed",
    );
    await page.selectOption("#quick-floor", "ground");
    await page.click('[data-camera="rear"]');
    await page.screenshot({
      path: path.join(__dirname, "../audit/door-interaction/closed.png"),
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(__dirname, "../audit/door-interaction/checks.json"),
      JSON.stringify(
        {
          doors: 43,
          clicks: 86,
          cutawayShowerClicks: 6,
          allShowersToggleInCutaway: true,
          allInitiallyClosed: true,
          allToggleByClick: true,
          doubleDoorPairs: 8,
          eitherLeafMovesBoth: true,
          rightClickIgnored: true,
          dragIgnored: true,
          stateSurvivesViewChanges: true,
          reloadCloses: true,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS 86 clicks across all 43 doors, plus 6 shower clicks in cutaway; drag/right-click ignored, state survives view changes, reload closes all.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
