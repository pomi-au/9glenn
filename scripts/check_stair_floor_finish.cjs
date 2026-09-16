const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseline = process.argv.includes("--baseline");
const output = path.resolve("audit/stair-floor-finish");
fs.mkdirSync(output, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Vector3,Raycaster} from "three";import clipping from "polygon-clipping";window.FloorTest={Vector3,Raycaster,clipping};',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
}).outputFiles[0].text;
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(
      "file://" +
        path.resolve(
          baseline ? "tmp/stair-floor-before.html" : "9-glenn-viewer.html",
        ) +
        "#3d",
    );
    await page.waitForFunction(() => window.Building3D?.instance, null, {
      timeout: 60000,
    });
    await page.addScriptTag({ content: helper });
    await page.uncheck("#model-perspective");
    const result = await page.evaluate(() => {
      const i = Building3D.instance,
        T = FloorTest;
      const g = i.data.floors.find((f) => f.id === "ground"),
        patch = g.stairFloorPatch;
      const rooms = g.rooms
        .filter((r) => r.category !== "void" && r.pointsMm?.length)
        .map((r) => [r.pointsMm]);
      const uncovered = T.clipping.difference(patch, ...rooms);
      const area = (polygons) =>
        polygons.reduce(
          (total, poly) =>
            total +
            poly.reduce(
              (sum, ring, j) =>
                sum +
                (j ? -1 : 1) *
                  Math.abs(
                    ring.reduce((a, p, k) => {
                      const q = ring[(k + 1) % ring.length];
                      return a + p[0] * q[1] - q[0] * p[1];
                    }, 0) / 2,
                  ),
              0,
            ),
          0,
        ) / 1e6;
      const within = (p, ring) => {
        let c = false;
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++)
          if (
            ring[a][1] > p[1] !== ring[b][1] > p[1] &&
            p[0] <
              ((ring[b][0] - ring[a][0]) * (p[1] - ring[a][1])) /
                (ring[b][1] - ring[a][1]) +
                ring[a][0]
          )
            c = !c;
        return c;
      };
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      Object.assign(i.settings, {
        floor: "ground",
        roof: false,
        cut: false,
        landscape: false,
      });
      i.update(true);
      i.scene.updateMatrixWorld(true);
      const group = i.model.floorGroups.get("ground").group;
      const meshes = i.model.pickables.filter(
        (m) =>
          m.userData.floor === "ground" &&
          ["slab", "room", "finish"].includes(m.userData.kind),
      );
      const hits = [];
      for (const polygon of uncovered) {
        const ring = polygon[0],
          xs = ring.map((p) => p[0]),
          zs = ring.map((p) => p[1]);
        for (let x = Math.min(...xs) + 15; x < Math.max(...xs); x += 40)
          for (let z = Math.min(...zs) + 15; z < Math.max(...zs); z += 40) {
            if (
              !within([x, z], ring) ||
              polygon.slice(1).some((h) => within([x, z], h))
            )
              continue;
            const point = new T.Vector3(x / 1000, 0.05, z / 1000).applyMatrix4(
              group.matrixWorld,
            );
            const hit = new T.Raycaster(
              point,
              new T.Vector3(0, -1, 0),
              0,
              0.1,
            ).intersectObjects(meshes)[0];
            if (!hit) {
              hits.push({ missing: true });
              continue;
            }
            const material = Array.isArray(hit.object.material)
              ? hit.object.material[hit.face.materialIndex]
              : hit.object.material;
            hits.push({
              x,
              z,
              name: hit.object.userData.name,
              kind: hit.object.userData.kind,
              finishPatch: hit.object.userData.finishPatch,
              elevation: hit.point.y,
              generatedTexture: material.userData.generatedTexture,
              map: !!material.map,
              normalMap: !!material.normalMap,
            });
          }
      }
      // These visible circulation points lie beyond the small restored slab
      // wedge, between the curved guard and the straight ENTRY/FAMILY outlines.
      // Checking them prevents a fix that covers only the original patch.
      const circulation = [
        [18000, 10360],
        [18700, 10360],
        [19400, 9950],
      ].map(([x, z]) => {
        const point = new T.Vector3(x / 1000, 0.05, z / 1000).applyMatrix4(
          group.matrixWorld,
        );
        const hit = new T.Raycaster(
          point,
          new T.Vector3(0, -1, 0),
          0,
          0.1,
        ).intersectObjects(meshes)[0];
        if (!hit) return { x, z, missing: true };
        const material = Array.isArray(hit.object.material)
          ? hit.object.material[hit.face.materialIndex]
          : hit.object.material;
        return {
          x,
          z,
          kind: hit.object.userData.kind,
          finishPatch: hit.object.userData.finishPatch,
          map: !!material.map,
          normalMap: !!material.normalMap,
          elevation: hit.point.y,
          generatedTexture: material.userData.generatedTexture,
        };
      });
      const target = new T.Vector3(
        hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length / 1000,
        0.1,
        hits.reduce((sum, hit) => sum + hit.z, 0) / hits.length / 1000,
      );
      i.camera.position.copy(target).add(new T.Vector3(1.3, 1.7, 1.5));
      i.camera.up.set(0, 1, 0);
      i.camera.lookAt(target);
      i.orbit.target.copy(target);
      const rect = i.renderer.domElement.getBoundingClientRect();
      i.camera.top = 0.7;
      i.camera.bottom = -0.7;
      i.camera.left = (-0.7 * rect.width) / rect.height;
      i.camera.right = -i.camera.left;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
      i.render();
      return {
        patchArea: area(patch),
        uncoveredFinishArea: area(uncovered),
        outsideSlabArea: area(T.clipping.difference(patch, g.slab)),
        overlapsVoidArea: area(
          T.clipping.intersection(
            patch,
            T.clipping.union(...g.holes.map((r) => [r])),
          ),
        ),
        cameraTarget: target.toArray(),
        samples: hits.length,
        hits,
        circulation,
      };
    });
    assert(result.samples > 20, "enough independent floor samples");
    assert(
      result.outsideSlabArea < 1e-8,
      "finish stays on the structural slab",
    );
    assert(
      result.overlapsVoidArea < 1e-8,
      "finish leaves the stair opening intact",
    );
    for (const hit of [...result.hits, ...result.circulation]) {
      assert(!hit.missing, "floor coverage has no holes");
      if (baseline) assert.equal(hit.kind, "slab");
      else {
        assert.equal(hit.finishPatch, "stair-floor");
        assert.equal(hit.generatedTexture, "oak");
        assert(
          hit.map && hit.normalMap,
          "restored finish has oak albedo and relief",
        );
        assert(
          Math.abs(hit.elevation - 0.004) < 1e-6,
          "finish matches existing room height",
        );
      }
    }
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({
      path: path.join(output, baseline ? "before.png" : "after.png"),
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, baseline ? "before.json" : "after.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(
      `PASS ${baseline ? "baseline exposed slab" : "stair oak finish"}: ${result.samples} rays, ${result.patchArea.toFixed(6)}m², preserved slab/void boundaries`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
