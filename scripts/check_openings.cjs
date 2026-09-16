/* Regression controls from the PDF opening audit, including the laundry wall. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "file://" + path.join(__dirname, "../index.html") + "#3d",
    );
    await page.waitForFunction(() => window.Building3D?.instance);
    const result = await page.evaluate(() => {
      const data = Building3D.instance.data;
      const ground = data.floors.find((f) => f.id === "ground");
      const first = data.floors.find((f) => f.id === "first");
      const garageWall = ground.walls.find((w) => w.id === "garage-rear");
      const garageWindow = ground.cuts.find((c) => c.id === "garage-rear");
      const garageFront = ground.walls.find((w) => w.id === "garage-front");
      const galleryPassages = ["dining-south", "living-north"].map((id) => {
        const wall = ground.walls.find((w) => w.id === id);
        const depths = [
          wall.bounds.minZ + 1,
          (wall.bounds.minZ + wall.bounds.maxZ) / 2,
          wall.bounds.maxZ - 1,
        ];
        return {
          id,
          thickness: wall.bounds.maxZ - wall.bounds.minZ,
          clear: [10431, 12055, 13679].every((x) =>
            depths.every((z) =>
              [100, 1200, 2142].every(
                (y) => !Building3D.wallContains(wall, x, z, y),
              ),
            ),
          ),
          jambs: [10429, 13681].every((x) =>
            depths.every((z) => Building3D.wallContains(wall, x, z, 1200)),
          ),
          lintel: depths.every((z) =>
            Building3D.wallContains(wall, 12055, z, 2200),
          ),
        };
      });
      const wall = ground.walls.find((w) => w.id === "rear-main");
      const laundry = ground.cuts.find((c) => c.id === "laundry");
      const solid = (x, height, target = wall) =>
        Building3D.wallContains(target, x, 715, height);
      const bath = first.cuts.find((c) => c.id === "bath2-west");
      const upper = first.cuts.find((c) => c.id === "void-feature");
      const assemblies = ["dining-glazing", "meals-east", "games-door"].map(
        (id) => {
          const cut = ground.cuts.find((c) => c.id === id);
          return {
            id,
            paneCount: cut.parts.length,
            awningHeights: cut.parts
              .filter((p) => p.paneKind === "awning")
              .map((p) => p.head - p.sill),
          };
        },
      );
      const clone = structuredClone(window.DRAWINGS);
      const rear = clone.find((d) => d.id === "elevation-3");
      const pane = rear.entities.find(
        (e) => e.assembly === "laundry" && e.kind === "awning",
      );
      function nodes(n) {
        return [n, ...(n.children || []).flatMap(nodes)];
      }
      const rect = nodes(rear.vector).find(
        (n) => n.attributes?.["data-elevation-window"] === pane.id,
      );
      rect.attributes.height = String(+rect.attributes.height - 100);
      const changed = Building3D.parseBuilding(clone).floors.find(
        (f) => f.id === "ground",
      );
      const changedPane = changed.cuts
        .find((c) => c.id === "laundry")
        .parts.find((p) => p.paneKind === "awning");
      const changedWall = changed.walls.find((w) => w.id === "rear-main");
      return {
        entryNorthClear: [14471, 15000, 15949].every((x) =>
          [10321, 10365, 10409].every((z) =>
            [100, 1200, 2500, 3000].every((y) =>
              ground.walls.every(
                (wall) => !Building3D.wallContains(wall, x, z, y),
              ),
            ),
          ),
        ),
        entryStairWallRetained: [16050, 17000, 17600].every((x) =>
          Building3D.wallContains(
            ground.walls.find((wall) => wall.id === "entry-north"),
            x,
            10365,
            1200,
          ),
        ),
        galleryPassages,
        garageRearSolid: [500, 1500, 2800].every((x) =>
          [-300, 200, 1500, 2100].every((y) =>
            Building3D.wallContains(garageWall, x, 6525, y),
          ),
        ),
        garageRearWindowClear: !Building3D.wallContains(
          garageWall,
          4200,
          6525,
          900,
        ),
        garageFrontEntryClear: !Building3D.wallContains(
          garageFront,
          1500,
          13195,
          800,
        ),
        garageWindow: { sill: garageWindow.sill, head: garageWindow.head },
        laundry: laundry.parts.map((p) => ({
          width: p.length,
          sill: p.sill,
          head: p.head,
          kind: p.paneKind,
        })),
        laundrySillSolid: [14600, 14800, 15000].every((x) => solid(x, 1100)),
        laundryWindowClear: [14600, 14800, 15000].every((x) => !solid(x, 1600)),
        laundryDoorClear: !solid(15500, 500),
        laundryJambsSolid: [14450, 16020, 16300, 16600].every(
          (x) => solid(x, 500) && solid(x, 1700),
        ),
        laundryLintelSolid: [14600, 15500].every((x) => solid(x, 2300)),
        bath: {
          start: bath.window.y,
          width: bath.window.length,
          source: bath.heightSource,
        },
        upperCentreMullion: upper.archProfile.centreMullion,
        assemblies,
        editedElevationHeight: +DrawingModel.documentFor(rear)
          .querySelector(`[data-elevation-window="${pane.id}"]`)
          .getAttribute("height"),
        edited3DHeight: changedPane.head - changedPane.sill,
        editedSillSolid: Building3D.wallContains(changedWall, 14800, 715, 1250),
        originalSillClear: !solid(14800, 1250),
        duplicateElevationCoordinates: clone
          .flatMap((d) => d.entities)
          .filter((e) => e.type === "elevation-window")
          .some((e) => ["x", "y", "width", "height"].some((k) => k in e)),
        leafCount: data.floors.reduce(
          (n, f) => n + f.cuts.filter((c) => c.door).length,
          0,
        ),
      };
    });
    for (const key of [
      "entryNorthClear",
      "entryStairWallRetained",
      "garageRearSolid",
      "garageRearWindowClear",
      "garageFrontEntryClear",
      "laundrySillSolid",
      "laundryWindowClear",
      "laundryDoorClear",
      "laundryJambsSolid",
      "laundryLintelSolid",
      "editedSillSolid",
      "originalSillClear",
    ])
      assert(result[key], key);
    for (const passage of result.galleryPassages) {
      assert.equal(passage.thickness, 190, `${passage.id}: PDF wall thickness`);
      assert.ok(
        passage.clear,
        `${passage.id}: 3,250 mm passage clear through entire wall`,
      );
      assert.ok(passage.jambs, `${passage.id}: jambs retained`);
      assert.ok(passage.lintel, `${passage.id}: lintel retained above 25c`);
    }
    assert.ok(Math.abs(result.garageWindow.sill - (3 * 3086) / 36) < 0.01);
    assert.ok(Math.abs(result.garageWindow.head - (17 * 3086) / 36) < 0.01);
    assert.deepEqual(result.laundry, [
      { width: 820, sill: 0, head: 2143, kind: "single-door" },
      { width: 630, sill: 1200, head: 2143, kind: "awning" },
    ]);
    assert.deepEqual(result.bath, {
      start: 5800,
      width: 1210,
      source: "elevation-2",
    });
    assert.equal(result.upperCentreMullion, false);
    for (const assembly of result.assemblies) {
      assert.equal(assembly.paneCount, 5);
      assert.deepEqual(assembly.awningHeights, [1372, 1372]);
    }
    assert.equal(result.editedElevationHeight, 843);
    assert.equal(result.edited3DHeight, 843);
    assert.equal(result.duplicateElevationCoordinates, false);
    assert.equal(result.leafCount, 43);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(__dirname, "../audit/opening-fixes/checks.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(
      "PASS laundry sill, jambs and lintel; shared elevation edits change SVG and 3D; six side panels, Bath 2, upper arch and 43 leaves.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
