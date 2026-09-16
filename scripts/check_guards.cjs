const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 800 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    const result = await page.evaluate(() => {
      const i = Building3D.instance,
        guards = i.model.pickables.filter((m) => m.userData.kind === "guard");
      const V = i.camera.position.constructor;
      const checks = guards.map((m) => {
        const floor = i.data.floors.find((f) => f.id === m.userData.floor);
        const guard = floor.source.geometry.find(
          (g) => g.id === m.userData.guardId,
        );
        const panel = guard.panels[m.userData.panel];
        const stair = floor.stairs.find((s) => s.id === guard.stairId);
        const a = new V(),
          b = new V(),
          c = new V(),
          p = m.geometry.attributes.position;
        let volume = 0;
        for (let n = 0; n < p.count; n += 3) {
          a.fromBufferAttribute(p, n);
          b.fromBufferAttribute(p, n + 1);
          c.fromBufferAttribute(p, n + 2);
          volume += a.dot(b.cross(c)) / 6;
        }
        const area =
          Math.abs(
            panel.points.reduce((sum, a, n) => {
              const b = panel.points[(n + 1) % panel.points.length];
              return sum + a[0] * b[1] - a[1] * b[0];
            }, 0),
          ) / 2;
        const depth =
          i.data.spec.inferredGuardHeight +
          (stair ? stair.rise + i.data.spec.inferredStairThickness : 0);
        m.geometry.computeBoundingBox();
        const box = m.geometry.boundingBox;
        return {
          id: guard.id,
          base: m.userData.baseElevation,
          bottom: box.min.y * 1000,
          volume,
          expectedVolume: (area * depth) / 1e9,
          opaque: !m.material.transparent,
          top: box.max.y * 1000,
          expectedTop:
            Math.max(panel.start, panel.end) * (stair?.rise ?? 0) +
            i.data.spec.inferredGuardHeight,
          sourceVertices: panel.points.every(([x, z]) =>
            Array.from({ length: p.count }, (_, n) => n).some(
              (n) =>
                Math.abs(p.getX(n) * 1000 - x) < 0.005 &&
                Math.abs(p.getZ(n) * 1000 - z) < 0.005,
            ),
          ),
        };
      });
      const clone = structuredClone(DRAWINGS),
        ground = clone.find((d) => d.id === "ground");
      const nodes = (n) => [n, ...(n.children || []).flatMap(nodes)];
      const group = nodes(ground.vector).find(
        (n) => n.attributes?.["data-guard"] === "stair-centre-guard",
      );
      const panel = group.children.find(
        (n) => n.attributes?.["data-guard-outline"] === "true",
      );
      const before = DrawingModel.resolve(ground).geometry.find(
        (g) => g.id === "stair-centre-guard",
      ).panels[0].points[0][0];
      panel.attributes.points = panel.attributes.points
        .split(" ")
        .map((pair) => {
          const [x, z] = pair.split(",").map(Number);
          return `${x + 50},${z}`;
        })
        .join(" ");
      const after = Building3D.parseBuilding(clone)
        .floors.find((f) => f.id === "ground")
        .source.geometry.find((g) => g.id === "stair-centre-guard").panels[0]
        .points[0][0];
      return {
        checks,
        landingGuard: i.data.floors
          .find((f) => f.id === "first")
          .source.geometry.find((g) => g.id === "stair-landing-guard"),
        upperStair: i.data.floors
          .find((f) => f.id === "first")
          .source.geometry.find((g) => g.id === "stair"),
        editDelta: after - before,
        voidRails: i.model.floorGroups
          .get("first")
          .details.children.filter(
            (m) => !m.userData.kind && m.geometry?.type === "CylinderGeometry",
          ).length,
      };
    });
    assert.ok(result.checks.length > 100);
    for (const c of result.checks) {
      assert.ok(c.opaque && c.sourceVertices, JSON.stringify(c));
      assert.ok(
        c.volume > 0 &&
          (c.base != null || Math.abs(c.volume - c.expectedVolume) < 2e-6),
        JSON.stringify(c),
      );
      assert.ok(Math.abs(c.top - c.expectedTop) < 0.01, JSON.stringify(c));
      if (c.base != null)
        assert.ok(
          Math.abs(c.bottom - c.base) < 0.01,
          "Wall reaches its specified base",
        );
    }
    const groundWalls = result.checks.filter((c) => c.base === 0);
    assert.equal(
      groundWalls.length,
      145,
      "Curved panels and lower-flight side wall stop at ground level",
    );
    assert.ok(
      groundWalls.every((c) => c.id === "stair-outer-guard"),
      "Original outer wall footprints are retained",
    );
    assert.ok(
      !result.checks.some((c) => c.base != null && c.base < 0),
      "No stair guard extends into the cellar",
    );
    assert(
      await page.evaluate(
        () =>
          !Building3D.instance.model.pickables.some(
            (m) => m.userData.name === "Curved stair wall basement jamb",
          ),
      ),
      "Basement extension jambs are removed",
    );
    assert.equal(result.editDelta, 50);
    assert.equal(result.voidRails, 0);
    const pc = require("polygon-clipping");
    const landing = result.landingGuard;
    assert.equal(
      landing.panels.length,
      2,
      "Landing guard closes both missing edges",
    );
    const stair = result.upperStair;
    const points = landing.panels.flatMap((p) => p.points);
    assert.equal(
      Math.min(...points.map((p) => p[0])),
      stair.x + 1290,
      "Upper flight retains its full 1290 mm entrance",
    );
    assert.equal(
      Math.min(...points.map((p) => p[1])),
      stair.y - 90,
      "Guard sits on the slab side of the opening",
    );
    for (const panel of landing.panels)
      assert.equal(
        pc.intersection([panel.points], [stair.topLanding]).length,
        0,
        "Upper landing remains unobstructed",
      );
    for (const floor of ["first", "all", "ground"]) {
      await page.locator("#quick-floor").selectOption(floor);
      const state = await page.evaluate(() => {
        const i = Building3D.instance,
          g = i.model.pickables.filter(
            (m) => m.userData.guardId === "stair-centre-guard",
          );
        return { count: g.length, parent: g[0].parent.parent.name };
      });
      assert.equal(state.count, 3);
      assert.equal(state.parent, floor === "first" ? "first" : "ground");
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "audit/guards/fixed-checks.json",
      JSON.stringify(result, null, 2),
    );
    console.log(
      `PASS ${result.checks.length} opaque guard panels: shared SVG vertices, outward signed volumes, tread-derived elevations, source-edit propagation, isolated-floor ownership; no duplicate void rails.`,
    );
  } finally {
    await browser.close();
  }
})();
