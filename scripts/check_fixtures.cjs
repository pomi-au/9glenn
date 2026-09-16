const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");
process.chdir(path.resolve(__dirname, ".."));
const clip = require("polygon-clipping");
const assert = require("node:assert/strict");
const area = (polys) =>
  polys.reduce(
    (total, poly) =>
      total +
      poly.reduce(
        (sum, ring, i) =>
          sum +
          (i ? -1 : 1) *
            Math.abs(
              ring.reduce((a, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return a + p[0] * q[1] - q[0] * p[1];
              }, 0) / 2,
            ),
        0,
      ),
    0,
  );
(async () => {
  const b = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d");
    await p.waitForFunction(() => window.Building3D?.instance);
    const data = await p.evaluate(() => {
      const i = Building3D.instance;
      return {
        profiles: i.data.spec.fixtureProfiles,
        floors: i.data.floors.map((f) => ({
          id: f.id,
          walls: f.walls,
          fixtures: f.source.geometry.filter((g) => g.type === "fixture"),
          doors: f.source.geometry
            .filter((g) => g.type === "door")
            .map((d) => ({
              ...d,
              slabs: i.model.doors
                .get(f.id + ":" + d.id)
                .leaf.children.map((m) => {
                  m.geometry.computeBoundingBox();
                  const b = m.geometry.boundingBox;
                  return {
                    minX: (b.min.x + m.position.x) * 1000,
                    maxX: (b.max.x + m.position.x) * 1000,
                    minZ: (b.min.z + m.position.z) * 1000,
                    maxZ: (b.max.z + m.position.z) * 1000,
                    bottom: (b.min.y + m.position.y) * 1000,
                    top: (b.max.y + m.position.y) * 1000,
                  };
                }),
            })),
        })),
        meshCounts: i.model.pickables.reduce((a, m) => {
          if (m.userData.fixtureId)
            a[m.userData.fixtureId] = (a[m.userData.fixtureId] || 0) + 1;
          return a;
        }, {}),
        closed: [...i.model.doors.values()].every(
          (d) => !d.open && d.leaf.rotation.y === d.closedAngle,
        ),
      };
    });
    assert(data.closed);
    const ground = data.floors.find((f) => f.id === "ground");
    const wall = (id) => ground.walls.find((w) => w.id === id);
    const cupboard = wall("laundry-upper-cupboard");
    const upperCut = cupboard.cuts.find((c) => c.id === "cupboard-a");
    const lowerCut = cupboard.cuts.find((c) => c.id === "cupboard-b");
    assert.equal(upperCut.bounds.maxZ, lowerCut.bounds.minZ,
      "Paired cupboard openings meet without a centre wall");
    for (const id of ["cupboard-a", "cupboard-b"]) {
      const cut = cupboard.cuts.find((c) => c.id === id);
      assert.ok(
        cut.bounds.minX < cupboard.bounds.minX &&
          cut.bounds.maxX > cupboard.bounds.maxX,
        id + " cuts the whole wall thickness",
      );
      assert.equal(cut.bounds.maxZ - cut.bounds.minZ, 620);
      for (const band of cupboard.bands.filter(
        (b) => b.bottom < cut.head && b.top > cut.sill,
      ))
        assert.ok(
          area(clip.intersection(band.polygons, [cut.ring])) < 0.01,
          id + " has no solid strip behind the opening",
        );
    }
    const linen = wall("linen-east"),
      base = wall("linen-base");
    assert.equal(
      base.bounds.maxX,
      linen.bounds.maxX,
      "Linen base fills the full corner thickness",
    );
    assert.equal(
      base.bounds.minZ,
      linen.bounds.maxZ,
      "Linen walls share a full edge",
    );
    assert.equal(
      wall("pantry-east").bounds.maxZ,
      wall("pantry-south").bounds.maxZ,
      "Pantry east wall ends flush without a passage stub",
    );
    assert.equal(
      wall("store-south").bounds.maxX,
      wall("fridge-return").bounds.maxX,
      "Wall below FZ/FR ends flush with the right return",
    );
    const bench = ground.fixtures.find((f) => f.id === "laundry-rounded-bench");
    assert.equal(bench.profile, "counter");
    assert.ok(bench.points.length > 12, "Bench retains its rounded return");
    assert.equal(
      data.meshCounts[bench.id],
      2,
      "Bench top and enclosed base both render",
    );
    for (const w of ground.walls)
      assert.ok(
        area(clip.intersection([bench.points], w.polygon)) < 0.01,
        "Bench clears wall " + w.id,
      );
    assert.equal(
      data.floors
        .flatMap((f) => f.fixtures)
        .filter((f) => f.profile === "shower-glass").length,
      6,
    );
    assert.equal(
      data.floors
        .flatMap((f) => f.fixtures)
        .filter((f) => f.profile === "shower-tray").length,
      3,
    );
    const shared = await p.evaluate(() => {
      const drawing = structuredClone(DRAWINGS.find((d) => d.id === "first"));
      const nodes = (n) => [n, ...(n.children || []).flatMap(nodes)];
      const group = nodes(drawing.vector).find(
        (n) => n.attributes?.["data-fixture"] === "wir3-top",
      );
      const outline = group.children.find(
        (n) => "data-fixture-outline" in n.attributes,
      );
      const pts = outline.attributes.points
        .split(" ")
        .map((s) => s.split(",").map(Number));
      pts[0][0] += 37;
      outline.attributes.points = pts.map((p) => p.join(",")).join(" ");
      const resolved = DrawingModel.resolve(drawing).geometry.find(
        (g) => g.id === "wir3-top",
      );
      const parsed = Building3D.parseBuilding(
        DRAWINGS.map((d) => (d.id === "first" ? drawing : d)),
      )
        .floors.find((f) => f.id === "first")
        .source.geometry.find((g) => g.id === "wir3-top");
      return {
        expected: pts[0][0],
        svg: +DrawingModel.documentFor(drawing)
          .querySelector('[data-fixture="wir3-top"] polygon')
          .getAttribute("points")
          .split(",")[0],
        resolved: resolved.points[0][0],
        model: parsed.points[0][0],
        duplicate: drawing.entities
          .filter((e) => e.type === "fixture")
          .some((e) => "points" in e || "x" in e),
      };
    });
    assert.equal(shared.svg, shared.expected);
    assert.equal(shared.resolved, shared.expected);
    assert.equal(shared.model, shared.expected);
    assert(!shared.duplicate);
    const glassMotion = await p.evaluate(() => {
      const i = Building3D.instance;
      const screens = i.model.pickables.filter(
        (m) => m.userData.kind === "shower-screen",
      );
      const positions = () => {
        i.model.root.updateMatrixWorld(true);
        return screens.map((m) => m.matrixWorld.toArray());
      };
      const before = positions(),
        now = performance.now();
      const keys = [
        "first:bath1-shower",
        "first:bath2-shower",
        "first:ensuite-shower",
      ];
      for (const key of keys) i.model.toggleDoor(key, now);
      i.model.updateDoors(now + 1000);
      const open = keys.every((key) => {
        const d = i.model.doors.get(key);
        return d.open && Math.abs(d.leaf.rotation.y - d.closedAngle) > 1;
      });
      const after = positions();
      for (const key of keys) i.model.toggleDoor(key, now + 1000);
      i.model.updateDoors(now + 2000);
      return {
        before,
        after,
        open,
        closed: keys.every((key) => !i.model.doors.get(key).open),
      };
    });
    assert.deepEqual(glassMotion.before, glassMotion.after);
    assert(glassMotion.open && glassMotion.closed);
    for (const [id, x, y] of [
      ["wir3-top", 5700, 5050],
      ["wir2-top", 12500, 4950],
      ["wir1-top", 15200, 4000],
      ["wir4-top", 7350, 8200],
      ["linen-top", 9350, 8500],
    ]) {
      const fixture = data.floors
        .flatMap((f) => f.fixtures)
        .find((g) => g.id === id);
      assert.equal(
        area(
          clip.intersection(
            [[fixture.points]],
            [
              [
                [x - 10, y - 10],
                [x + 10, y - 10],
                [x + 10, y + 10],
                [x - 10, y + 10],
              ],
            ],
          ),
        ),
        0,
        id + " centre stays clear",
      );
      assert.equal(
        data.profiles[fixture.profile].height,
        30,
        id + " retains its 30 mm top above the enclosed base",
      );
    }
    const collisions = [];
    for (const f of data.floors)
      for (const d of f.doors) {
        let hits = {};
        for (let angle = 0; angle <= 70; angle += 1) {
          const a = ((d.angle + angle * d.swing) * Math.PI) / 180;
          const point = (u, v) => [
            d.x + u * Math.cos(a) - v * Math.sin(a),
            d.y + u * Math.sin(a) + v * Math.cos(a),
          ];
          for (const slab of d.slabs) {
            const door = [
              point(slab.minX, slab.minZ),
              point(slab.maxX, slab.minZ),
              point(slab.maxX, slab.maxZ),
              point(slab.minX, slab.maxZ),
            ];
            const add = (id, poly) => {
              const overlap = clip.intersection([door], poly),
                overlapArea = area(overlap);
              if (overlapArea > 1) {
                hits[id] ??= { maxArea: 0, angles: [], farthestFromHinge: 0 };
                hits[id].angles.push(angle);
                hits[id].maxArea = Math.max(
                  hits[id].maxArea,
                  Math.round(overlapArea),
                );
                hits[id].farthestFromHinge = Math.max(
                  hits[id].farthestFromHinge,
                  ...overlap
                    .flat(2)
                    .map((p) => Math.hypot(p[0] - d.x, p[1] - d.y)),
                );
              }
            };
            for (const g of f.fixtures) {
              const profile = data.profiles[g.profile];
              if (
                (profile.enclosedBase ? 0 : profile.bottom) >=
                  slab.top - 0.01 ||
                profile.bottom + profile.height <= slab.bottom + 0.01
              )
                continue;
              if (g.profile === "shower-glass") {
                const [s, e] = g.points,
                  len = Math.hypot(e[0] - s[0], e[1] - s[1]),
                  ux = (e[0] - s[0]) / len,
                  uz = (e[1] - s[1]) / len,
                  t = profile.thickness / 2,
                  gap = profile.jointGap;
                const pt = (u, v) => [
                  s[0] + ux * u - uz * v,
                  s[1] + uz * u + ux * v,
                ];
                add(g.id, [
                  [
                    pt(gap, -t),
                    pt(len - gap, -t),
                    pt(len - gap, t),
                    pt(gap, t),
                  ],
                ]);
              } else {
                const baseOverlaps =
                  profile.enclosedBase && profile.bottom > slab.bottom + 0.01;
                add(g.id, [[g.points, ...(baseOverlaps ? [] : g.holes)]]);
              }
            }
            for (const w of f.walls) {
              for (const band of w.bands)
                if (
                  band.bottom < slab.top - 0.01 &&
                  band.top > slab.bottom + 0.01
                )
                  add("wall:" + w.id, band.polygons);
            }
          }
        }
        if (Object.keys(hits).length)
          collisions.push({ floor: f.id, door: d.id, hits });
      }
    fs.mkdirSync("audit/fixture-fixes", { recursive: true });
    fs.writeFileSync(
      "audit/fixture-fixes/contacts.json",
      JSON.stringify(collisions, null, 2),
    );
    fs.writeFileSync(
      "audit/fixture-fixes/model-data.json",
      JSON.stringify(data, null, 2),
    );
    console.log(
      JSON.stringify(
        collisions.map((d) => ({
          ...d,
          hits: Object.fromEntries(
            Object.entries(d.hits).map(([k, v]) => [
              k,
              { ...v, farthestFromHinge: Math.round(v.farthestFromHinge) },
            ]),
          ),
        })),
        null,
        2,
      ),
    );
    for (const key of [
      "first:bed3-wir",
      "first:bed2-wir",
      "first:master-wir",
      "first:wir4",
      "first:ensuite-shower",
      "first:bath1-shower",
      "first:bath2-shower",
      "first:linen",
    ]) {
      await p.evaluate((key) => {
        const i = Building3D.instance,
          d = i.model.doors.get(key);
        i.settings.floor = "first";
        i.settings.roof = false;
        i.settings.cut = true;
        i.settings.labels = false;
        i.update();
        i.pivot.rotation.set(0, 0, 0);
        i.pivot.updateMatrixWorld(true);
        const target = d.leaf.getWorldPosition(i.camera.position.clone());
        target.y += 0.4;
        i.camera.position
          .copy(target)
          .add(i.camera.position.clone().set(3, 5, 4));
        i.camera.lookAt(target);
        i.camera.zoom = 10;
        i.camera.updateProjectionMatrix();
        i.render();
      }, key);
      await p.locator("#model-canvas").screenshot({
        path: "audit/fixture-fixes/" + key.split(":")[1] + ".png",
      });
    }
    assert.deepEqual(
      collisions,
      [],
      "Door slabs intersect fixture or wall solids",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS shared fixture edits, clear room centres, 6 stationary fixed panels, 3 trays and 43 closed doors; rendered slabs clear all modelled walls/fixtures at 1-degree steps through 70 degrees.",
    );
  } finally {
    await b.close();
  }
})();
