const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pc = require("polygon-clipping");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
function area(multi) {
  return multi.reduce(
    (total, polygon) =>
      total +
      polygon.reduce((sum, ring, i) => {
        const a =
          Math.abs(
            ring.reduce((a, p, j) => {
              const q = ring[(j + 1) % ring.length];
              return a + p[0] * q[1] - q[0] * p[1];
            }, 0),
          ) / 2;
        return sum + (i ? -a : a);
      }, 0),
    0,
  );
}
function inside(point, ring) {
  let value = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      value = !value;
  }
  return value;
}
function inMulti(point, multi) {
  return multi.some(
    (p) => inside(point, p[0]) && !p.slice(1).some((r) => inside(point, r)),
  );
}
function shift(points, offset) {
  return points.map((p) => [p[0] + offset[0], p[1] + offset[1]]);
}
function near(a, b, message) {
  assert.ok(Math.abs(a - b) < 0.02, `${message}: ${a} versus ${b}`);
}
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
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    const evidence = await page.evaluate(() => {
      const i = Building3D.instance;
      return {
        spec: i.data.spec,
        floors: i.data.floors.map((f) => ({
          id: f.id,
          base: f.base,
          offset: f.offset,
          stairs: f.stairs,
          slab: f.slab,
          lowerSlabs: f.lowerSlabs,
          holes: f.holes,
          stairFloorPatch: f.stairFloorPatch,
          walls: f.walls,
        })),
        meshes: i.model.pickables
          .filter(
            (m) => m.userData.kind === "stair" || m.userData.kind === "slab",
          )
          .map((m) => {
            m.geometry.computeBoundingBox();
            return {
              info: m.userData,
              min: m.geometry.boundingBox.min.toArray(),
              max: m.geometry.boundingBox.max.toArray(),
              position: m.position.toArray(),
            };
          }),
      };
    });
    const [g, f, c] = evidence.floors;
    assert.ok(
      area(g.stairFloorPatch) > 1,
      "The exterior gap beside the stair is filled",
    );
    near(
      area(pc.difference(g.stairFloorPatch, g.slab)),
      0,
      "The entire patch is part of the ground slab, not a separate overlapping cap",
    );
    const stairBoundary = g.stairs.find((s) => s.id === "stair").opening;
    near(
      area(pc.intersection(g.stairFloorPatch, [stairBoundary])),
      0,
      "Floor patch stays outside the stair enclosure",
    );
    assert.ok(
      g.stairs?.length === 2,
      "Main and garage stairs must be resolved",
    );
    const main = g.stairs.find((s) => s.id === "stair"),
      garage = g.stairs.find((s) => s.id === "garage-stair"),
      cellar = c.stairs[0];
    assert.deepEqual(
      main.treads.map((t) => t.level),
      Array.from({ length: 19 }, (_, i) => i + 1),
    );
    assert.deepEqual(
      cellar.treads.map((t) => t.level),
      Array.from({ length: 15 }, (_, i) => 15 - i),
    );
    assert.deepEqual(
      garage.treads.map((t) => t.level),
      [1, 2, 3],
    );
    near(main.top, 3258, "Main top");
    near(main.rise, 3258 / 19, "Main rise");
    near(cellar.bottom, 0, "Cellar start");
    near(c.base + cellar.top, 0, "Cellar landing");
    near(cellar.treads.at(-1).elevation, 160.75, "Lowest cellar tread");
    near(c.base + cellar.treads[0].elevation, -160.75, "Highest cellar tread");
    const enclosure = c.walls.filter((w) =>
      w.id.startsWith("cellar-stair-inner-"),
    );
    assert.equal(
      enclosure.length,
      2,
      "Both inside edges of the cellar stair are enclosed",
    );
    const groundSlabInCellar = g.slab.map((polygon) =>
      polygon.map((ring) =>
        shift(
          ring,
          c.offset.map((v) => -v),
        ),
      ),
    );
    for (const wall of c.walls) {
      const extensions = wall.bands.filter((b) => b.top + c.base > -172 + 0.01);
      for (const band of extensions) {
        near(
          area(pc.intersection(band.polygons, groundSlabInCellar)),
          0,
          "Cellar wall caps cannot overlap the ground slab and cause z-fighting",
        );
        near(
          c.base + band.top,
          0,
          "Exposed wall extensions reach ground level",
        );
      }
      near(
        area(
          pc.difference(
            wall.polygon,
            groundSlabInCellar,
            ...extensions.flatMap((b) => b.polygons),
          ),
        ),
        0,
        "Slab and exposed wall extensions close the entire floor zone",
      );
    }
    for (const wall of enclosure) {
      for (const tread of cellar.treads)
        near(
          area(pc.intersection(wall.polygon, [tread.points])),
          0,
          "Enclosure preserves all cellar tread widths",
        );
      near(
        area(pc.intersection(wall.polygon, [cellar.bottomLanding])),
        0,
        "Cellar exit remains open",
      );
    }
    const closures = g.walls.filter((w) =>
      w.id.startsWith("cellar-stair-inner-"),
    );
    assert.ok(
      !g.walls.some((w) =>
        /stair-basement-(cover|apron)|stair-flight-skirt/.test(w.id),
      ),
      "Separate stair cover and enlarged apron are removed",
    );
    assert.equal(
      closures.length,
      1,
      "Cellar return closes against the overhead main staircase",
    );
    const upperSide = g.walls.find((w) => w.id === "under-stair-east");
    near(
      enclosure[0].bounds.minX + c.offset[0],
      upperSide.bounds.minX,
      "Cellar side aligns with existing upper enclosure",
    );
    for (const wall of closures)
      for (const band of wall.bands)
        for (const tread of main.treads)
          if (area(pc.intersection(band.polygons, [tread.points])) > 1)
            assert.ok(
              band.top <=
                tread.elevation -
                  main.rise -
                  evidence.spec.inferredStairThickness +
                  0.02,
              "Enclosure stays below main stair structure",
            );
    near(garage.bottom, -514, "Garage bottom");
    near(garage.treads.at(-1).elevation, 0, "Garage landing");
    near(g.lowerSlabs[0].top, -514, "Garage slab");
    const garagePartition = g.walls.find((w) => w.id === "gallery-garage"),
      courtyard = g.walls.find((w) => w.id === "gallery-step"),
      garageDoor = garagePartition.cuts.find((c) => c.id === "garage-gallery");
    near(
      garagePartition.bounds.maxX - garagePartition.bounds.minX,
      90,
      "Garage/gallery door host is the 90 mm inner leaf",
    );
    near(
      courtyard.bounds.maxX - courtyard.bounds.minX,
      230,
      "Courtyard exterior remains 230 mm",
    );
    near(
      courtyard.bounds.maxZ,
      garagePartition.bounds.minZ,
      "Door partition meets the end of the exterior wall",
    );
    near(
      courtyard.bounds.maxX,
      garagePartition.bounds.maxX,
      "Gallery-side wall faces remain aligned",
    );
    near(
      garageDoor.bounds.maxZ - garageDoor.bounds.minZ,
      820,
      "Garage door retains its 820 mm opening",
    );
    assert.ok(
      garageDoor.bounds.minX < garagePartition.bounds.minX &&
        garageDoor.bounds.maxX > garagePartition.bounds.maxX,
      "Door aperture cuts through the full thin wall",
    );
    assert.ok(
      !courtyard.cuts.some((c) => c.id === "garage-gallery"),
      "The thick exterior wall no longer hosts the garage door",
    );
    const rear = g.walls.find((w) => w.id === "garage-rear"),
      study = g.walls.find((w) => w.id === "study-west"),
      studyNorth = g.walls.find((w) => w.id === "study-north"),
      piers = g.walls.filter((w) => w.id.startsWith("study-west-pier-"));
    assert.equal(piers.length, 2, "Both PDF study-wall piers are present");
    assert.ok(
      !g.walls.some((w) => w.id === "garage-rear-pier-6020"),
      "No unsupported rear-wall pier beside the garage steps",
    );
    for (const tread of garage.treads) {
      near(
        Math.min(...tread.points.map((p) => p[1])),
        rear.bounds.maxZ,
        "Garage risers meet the rear wall without a gap",
      );
      for (const wall of [study, studyNorth, ...piers])
        near(
          area(pc.intersection([tread.points], wall.polygon)),
          0,
          "Garage treads meet the study walls and piers without overlap",
        );
    }
    assert.ok(
      garage.treads[0].points.length > 8 && garage.treads[1].points.length > 8,
      "Garage returns retain curved boundaries instead of rectangular boxes",
    );
    near(
      Math.max(...garage.treads[0].points.map((p) => p[1])),
      Math.min(...piers.map((p) => p.bounds.minZ)),
      "Outer return meets the first pier",
    );
    for (const pier of piers)
      near(
        pier.bounds.maxX,
        study.bounds.minX,
        "Study piers touch the west wall face",
      );
    near(
      Math.min(...garage.treads[2].points.map((p) => p[0])),
      study.bounds.maxX,
      "Third rise meets the gallery-level landing",
    );
    const top = main.treads.at(-1),
      opening = shift(f.holes[1], f.offset);
    near(
      Math.min(...top.points.map((p) => p[1])),
      Math.min(...opening.map((p) => p[1])),
      "Main landing contact",
    );
    const landing = shift(cellar.topLanding, c.offset),
      doorWall = g.walls.find((w) => w.id === "under-stair-north");
    near(
      Math.min(...landing.map((p) => p[1])),
      doorWall.bounds.minZ,
      "Cellar landing spans door threshold",
    );
    near(
      Math.max(...landing.map((p) => p[1])),
      Math.min(...shift(cellar.treads[0].points, c.offset).map((p) => p[1])),
      "Cellar landing/tread contact",
    );
    for (const s of [main, garage])
      for (let j = 1; j < s.treads.length; j++) {
        const a = s.treads[j - 1].points,
          b = s.treads[j].points;
        near(
          area(pc.intersection([a], [b])),
          0,
          "Adjacent tread areas do not overlap",
        );
        const expanded = pc.union([a], [b]);
        assert.equal(
          expanded.length,
          1,
          `${s.id} treads ${j} and ${j + 1} must touch`,
        );
      }
    for (let j = 1; j < cellar.treads.length; j++)
      assert.equal(
        pc.union([cellar.treads[j - 1].points], [cellar.treads[j].points])
          .length,
        1,
        "Cellar treads must touch",
      );
    const stairMeshes = evidence.meshes.filter((m) => m.info.kind === "stair");
    assert.equal(stairMeshes.length, 37);
    for (const floor of [g, c])
      for (const s of floor.stairs)
        for (const t of s.treads) {
          const m = stairMeshes.find(
            (m) => m.info.stairId === s.id && m.info.level === t.level,
          );
          near(
            1000 * (m.position[1] + m.max[1]) + floor.base,
            floor.base + t.elevation,
            "Actual mesh top",
          );
          assert.ok(
            m.info.underside >= floor.base + s.bottom,
            "Mesh must not extend below its lower floor",
          );
        }
    const doorPolygon = [
      [16270, 7870],
      [16990, 7870],
      [16990, 7960],
      [16270, 7960],
    ];
    for (const t of main.treads) {
      if (area(pc.intersection([t.points], [doorPolygon])) > 1) {
        const m = stairMeshes.find(
          (m) => m.info.stairId === "stair" && m.info.level === t.level,
        );
        assert.ok(
          m.info.underside > 2040,
          "Stair underside must clear under-stair doorway",
        );
      }
    }
    // Sample the cellar treads inside the curved enclosure. The restored room
    // floor lies outside that wall and is not part of the cellar walking space.
    let minHeadroom = Infinity,
      sampleCount = 0,
      limitingPoint = null;
    for (const t of cellar.treads) {
      const ring = shift(t.points, c.offset),
        base = c.base + t.elevation;
      const xs = ring.map((p) => p[0]),
        zs = ring.map((p) => p[1]);
      for (let x = Math.min(...xs) + 45; x < Math.max(...xs); x += 80)
        for (let z = Math.min(...zs) + 45; z < Math.max(...zs); z += 80) {
          if (!inside([x, z], ring)) continue;
          if (inMulti([x, z], g.stairFloorPatch)) continue;
          if (t.level > 2 && !inside([x, z], stairBoundary)) continue;
          const overhead = [];
          if (inMulti([x, z], g.slab)) overhead.push(-172);
          for (const u of main.treads)
            if (inside([x, z], u.points))
              overhead.push(
                stairMeshes.find(
                  (m) => m.info.stairId === "stair" && m.info.level === u.level,
                ).info.underside,
              );
          for (const w of g.walls)
            for (const band of w.bands)
              if (inMulti([x, z], band.polygons)) overhead.push(band.bottom);
          for (const y of overhead)
            if (y > base && y - base < minHeadroom) {
              minHeadroom = y - base;
              limitingPoint = { x, z, level: t.level, base, overhead: y };
            }
          sampleCount++;
        }
    }
    assert.ok(
      minHeadroom >= evidence.spec.inferredStairHeadroom,
      `Cellar model clearance ${minHeadroom} mm at ${JSON.stringify(limitingPoint)}`,
    );
    const actualClearance = await page.evaluate(() => {
      const i = Building3D.instance,
        c = i.data.floors.find((f) => f.id === "cellar");
      const patch = i.data.floors.find(
        (f) => f.id === "ground",
      ).stairFloorPatch;
      const clearBoundary = i.data.floors
        .find((f) => f.id === "ground")
        .stairs.find((s) => s.id === "stair").opening;
      i.model.root.updateMatrixWorld(true);
      const V = i.camera.position.constructor;
      const meshes = i.model.pickables.map((mesh) => {
        const p = mesh.geometry.attributes.position,
          idx = mesh.geometry.index;
        const vertices = Array.from({ length: p.count }, (_, n) =>
          new V()
            .fromBufferAttribute(p, n)
            .applyMatrix4(mesh.matrixWorld)
            .multiplyScalar(1000),
        );
        const triangles = [];
        for (let n = 0; n < (idx?.count ?? p.count); n += 3)
          triangles.push(
            [0, 1, 2].map((k) => vertices[idx ? idx.getX(n + k) : n + k]),
          );
        return {
          name: mesh.userData.name,
          kind: mesh.userData.kind,
          triangles,
          x0: Math.min(...vertices.map((p) => p.x)),
          x1: Math.max(...vertices.map((p) => p.x)),
          z0: Math.min(...vertices.map((p) => p.z)),
          z1: Math.max(...vertices.map((p) => p.z)),
        };
      });
      function inside(x, z, r) {
        let b = false;
        for (let a = 0, j = r.length - 1; a < r.length; j = a++) {
          const p = r[a],
            q = r[j];
          if (
            p[1] > z !== q[1] > z &&
            x < ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]) + p[0]
          )
            b = !b;
        }
        return b;
      }
      let minimum = Infinity,
        outsideStairHeadroom = Infinity,
        limiting = null,
        samples = 0,
        walklineMinimum = Infinity;
      for (const tread of c.stairs[0].treads) {
        const ring = tread.points.map((p) => [
            p[0] + c.offset[0],
            p[1] + c.offset[1],
          ]),
          base = c.base + tread.elevation;
        const testPoints = [];
        for (
          let x = Math.min(...ring.map((p) => p[0])) + 45;
          x < Math.max(...ring.map((p) => p[0]));
          x += 80
        )
          for (
            let z = Math.min(...ring.map((p) => p[1])) + 45;
            z < Math.max(...ring.map((p) => p[1]));
            z += 80
          )
            if (inside(x, z, ring)) testPoints.push({ x, z, walkline: false });
        testPoints.push({
          x: ring.reduce((a, p) => a + p[0], 0) / ring.length,
          z: ring.reduce((a, p) => a + p[1], 0) / ring.length,
          walkline: true,
        });
        for (const { x, z, walkline } of testPoints) {
          if (
            patch.some(
              (p) =>
                inside(x, z, p[0]) && !p.slice(1).some((r) => inside(x, z, r)),
            )
          )
            continue;
          // The low soffit beneath the side wall is outside the clear inner
          // stair boundary. Record it separately from the walking clearance.
          const outsideStair = tread.level > 2 && !inside(x, z, clearBoundary);
          if (!walkline) samples++;
          for (const mesh of meshes) {
            // An operable leaf is a lateral obstacle, not a fixed ceiling.
            // Include it separately when testing the centre walking route.
            if (!walkline && mesh.kind === "door") continue;
            if (x < mesh.x0 || x > mesh.x1 || z < mesh.z0 || z > mesh.z1)
              continue;
            for (const [a, b, c] of mesh.triangles) {
              const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
              if (Math.abs(den) < 1e-5) continue;
              const u =
                ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den;
              const v =
                  ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den,
                w = 1 - u - v;
              if (Math.min(u, v, w) < -1e-8) continue;
              const y = u * a.y + v * b.y + w * c.y;
              if (y <= base + 0.02) continue;
              if (outsideStair) {
                outsideStairHeadroom = Math.min(outsideStairHeadroom, y - base);
                continue;
              }
              if (walkline)
                walklineMinimum = Math.min(walklineMinimum, y - base);
              else if (y - base < minimum) {
                minimum = y - base;
                limiting = { name: mesh.name, x, z, level: tread.level };
              }
            }
          }
        }
      }
      return {
        minimum,
        samples,
        limiting,
        walklineMinimum,
        outsideStairHeadroom,
      };
    });
    assert.ok(
      actualClearance.minimum >= evidence.spec.inferredStairHeadroom - 0.02,
      `Actual mesh headroom: ${JSON.stringify(actualClearance)}`,
    );
    assert.ok(
      actualClearance.walklineMinimum >=
        evidence.spec.inferredStairHeadroom - 0.02,
      "Cellar walking line, including open door, must be clear",
    );
    const lowerPoint = [3534 + 100, 3460 + 645];
    assert.ok(
      inMulti(lowerPoint, c.slab),
      "Cellar bottom landing must meet cellar slab",
    );
    for (const point of [
      [5500, 7000],
      [6000, 8000],
    ])
      assert.ok(
        inMulti(point, g.lowerSlabs[0].polygons),
        "Garage slab footprint",
      );
    const vehicleWall = g.walls.find((w) => w.id === "garage-front");
    assert.ok(
      vehicleWall.bands.some((b) => b.bottom === -514),
      "Garage walls reach slab",
    );
    assert.ok(
      !vehicleWall.bands
        .filter((b) => b.bottom < 0)
        .some((b) => inMulti([3000, 13195], b.polygons)),
      "Vehicle opening reaches garage slab",
    );
    const shared = await page.evaluate(() => {
      const clone = structuredClone(window.DRAWINGS),
        d = clone.find((d) => d.id === "ground");
      function nodes(n) {
        return [n, ...(n.children || []).flatMap(nodes)];
      }
      const group = nodes(d.vector).find(
        (n) => n.attributes?.["data-stair"] === "stair",
      );
      const node = group.children.find(
        (n) => n.attributes?.["data-tread-level"] === "1",
      );
      const before = Building3D.parseBuilding(clone).floors[0].stairs.find(
        (s) => s.id === "stair",
      ).treads[0].points[0][0];
      const p = node.attributes.points.trim().split(/\s+/);
      const q = p[0].split(",").map(Number);
      q[0] += 10;
      p[0] = q.join(",");
      node.attributes.points = p.join(" ");
      const after = Building3D.parseBuilding(clone).floors[0].stairs.find(
        (s) => s.id === "stair",
      ).treads[0].points[0][0];
      const g = Building3D.instance.data.floors[0],
        f = Building3D.instance.data.floors[1];
      const a = g.source.geometry.find((s) => s.id === "stair"),
        b = f.source.geometry.find((s) => s.id === "stair");
      return {
        delta: after - before,
        aligned: a.treads.every((t, j) =>
          t.points.every(
            (p, k) =>
              Math.abs(p[0] - b.treads[j].points[k][0] - f.offset[0]) < 0.01 &&
              Math.abs(p[1] - b.treads[j].points[k][1] - f.offset[1]) < 0.01,
          ),
        ),
      };
    });
    near(shared.delta, 10, "Shared primitive edit reaches model");
    assert.ok(shared.aligned, "Upper and lower plans share tread boundaries");
    for (const floor of ["first", "ground", "cellar", "all"]) {
      await page.locator("#quick-floor").selectOption(floor);
      await page.evaluate(() => {
        const i = Building3D.instance;
        Object.assign(i.settings, { roof: false, cut: false, plans: false });
        i.update();
        i.preset("iso");
      });
      const state = await page.evaluate(() => {
        const i = Building3D.instance,
          s = i.model.floorGroups.get("ground").stairGroups.get("stair");
        return {
          parent: s.parent.name,
          worldTop: i.model.pickables.find(
            (m) => m.userData.stairId === "stair" && m.userData.level === 19,
          ).userData.elevation,
          count: i.model.pickables.filter((m) => m.userData.stairId === "stair")
            .length,
        };
      });
      assert.equal(state.parent, floor === "first" ? "first" : "ground");
      assert.equal(state.count, 19);
      near(state.worldTop, 3258, "Stair source top invariant");
      await page.screenshot({ path: `audit/stairs/fixed-${floor}.png` });
    }
    assert.deepEqual(errors, []);
    evidence.checks = {
      mainRisers: 19,
      cellarRisers: 16,
      cellarWalkingTreads: 15,
      garageRisers: 3,
      mainRiseMm: main.rise,
      cellarRiseMm: cellar.rise,
      garageRiseMm: garage.rise,
      minCellarHeadroomMm: minHeadroom,
      actualMeshClearance: actualClearance,
      cellarSampleCount: sampleCount,
      sharedTreads: true,
    };
    fs.writeFileSync(
      "audit/stairs/fixed-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
    for (const stairId of ["stair", "cellar-stair", "garage-stair"]) {
      await page.evaluate((stairId) => {
        const i = Building3D.instance;
        Object.assign(i.settings, {
          floor: "all",
          explode: 0,
          roof: false,
          cut: false,
          labels: false,
          plans: false,
        });
        i.update();
        for (const e of i.model.floorGroups.values()) {
          e.group.visible = true;
          e.group.traverse((o) => {
            if (o.isMesh || o.isLine)
              o.visible = o.userData.stairId === stairId;
          });
        }
        const floor = i.data.floors.find((f) =>
          f.stairs.some((s) => s.id === stairId),
        );
        const s = floor.stairs.find((s) => s.id === stairId),
          points = s.treads.flatMap((t) => t.points);
        const x =
          (Math.min(...points.map((p) => p[0])) +
            Math.max(...points.map((p) => p[0]))) /
            2000 +
          floor.offset[0] / 1000;
        const z =
          (Math.min(...points.map((p) => p[1])) +
            Math.max(...points.map((p) => p[1]))) /
            2000 +
          floor.offset[1] / 1000;
        const y = (floor.base + (s.top + s.bottom) / 2) / 1000;
        i.model.root.position.set(0, 0, 0);
        i.pivot.position.set(0, 0, 0);
        i.pivot.quaternion.identity();
        i.orbit.target.set(x, y, z);
        i.camera.position.set(x + 5, y + 4, z + 6);
        i.camera.lookAt(x, y, z);
        i.camera.zoom = stairId === "garage-stair" ? 14 : 7;
        i.camera.updateProjectionMatrix();
        i.orbit.update();
        i.render();
      }, stairId);
      await page
        .locator("#model-canvas")
        .screenshot({ path: `audit/stairs/fixed-${stairId}-detail.png` });
    }
    console.log("PASS stairs:", evidence.checks);
  } finally {
    await browser.close();
  }
})();
