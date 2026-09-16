const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const clip = require("polygon-clipping");
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
      viewport: { width: 1500, height: 1050 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("index.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    const data = await page.evaluate(() => {
      const i = Building3D.instance;
      const ground = i.data.floors.find((f) => f.id === "ground");
      const pool = ground.source.geometry.find((g) => g.type === "pool");
      const meshes = i.model.pickables.filter((m) => m.userData.poolId);
      const dimensions = meshes.map((m) => {
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox;
        return {
          part: m.userData.part,
          bottom: b.min.y + m.position.y,
          top: b.max.y + m.position.y,
          restTop: m.userData.restWaterLevel,
          minX: b.min.x,
          maxX: b.max.x,
          minZ: b.min.z,
          maxZ: b.max.z,
          finite: Array.from(m.geometry.attributes.position.array).every(
            Number.isFinite,
          ),
        };
      });
      const clone = structuredClone(DRAWINGS.find((d) => d.id === "ground"));
      function nodes(n) {
        return [n, ...(n.children || []).flatMap(nodes)];
      }
      const water = nodes(clone.vector).find(
        (n) => n.attributes?.["data-pool-part"] === "water",
      );
      const pts = water.attributes.points
        .split(" ")
        .map((p) => p.split(",").map(Number));
      pts[0][0] += 37;
      water.attributes.points = pts.map((p) => p.join(",")).join(" ");
      const changed = Building3D.parseBuilding(
        DRAWINGS.map((d) => (d.id === "ground" ? clone : d)),
      )
        .floors.find((f) => f.id === "ground")
        .source.geometry.find((g) => g.type === "pool");
      return {
        pool,
        outline: ground.outline,
        dimensions,
        editShared: changed.parts.water[0][0] === pts[0][0],
      };
    });
    assert(data.editShared, "Pool edits must propagate from SVG to 3D");
    assert.equal(
      data.dimensions.filter((m) => !m.part.startsWith("fountain")).length,
      8,
    );
    assert(data.dimensions.some((m) => m.part === "fountain water jet"));
    assert(
      data.dimensions.some(
        (m) =>
          m.part === "fountain mermaid face with carved eyes nose and lips",
      ),
      "reference mermaid has a sculpted face",
    );
    assert(data.dimensions.every((m) => m.finite));
    const water = data.dimensions.find((m) => m.part === "water");
    assert(Math.abs(water.restTop + 0.16) < 0.00001);
    assert(
      water.top <= water.restTop + 0.06001,
      "fountain waves stay within the existing6cm surface bound",
    );
    assert(Math.abs(water.maxX - water.minX - 4.0) < 0.00001);
    assert(Math.abs(water.maxZ - water.minZ - 8.3) < 0.00001);
    assert(
      Math.abs(water.minX - 27.63) < 0.00001,
      "One metre from house wall to water",
    );
    assert(
      Math.abs(water.minZ - 5.3) < 0.00001 &&
        Math.abs(water.maxZ - 13.6) < 0.00001,
      "Pool beside front portion of east wall",
    );
    assert(
      data.pool.parts.water.some(([x, z]) => z < 6600),
      "Rear rounded entry",
    );
    assert(
      data.pool.parts.water.some(([x, z]) => z > 12300),
      "Front rounded entry",
    );
    assert.equal(
      clip.intersection([data.pool.parts.water], [data.outline]).length,
      0,
      "Pool outside house",
    );
    assert.equal(
      clip.difference([data.pool.parts.water], [data.pool.parts.coping]).length,
      0,
      "Coping contains basin",
    );
    assert.equal(
      clip.difference([data.pool.parts.coping], [data.pool.parts.paving])
        .length,
      0,
      "Paving contains coping",
    );
    for (let n = 0; n < 2; n++)
      assert.equal(
        clip.difference([data.pool.parts["step-" + n]], [data.pool.parts.water])
          .length,
        0,
        "Steps inside pool",
      );
    const near = data.pool.parts["step-0"],
      far = data.pool.parts["step-1"].slice().reverse();
    for (const entry of [near, far]) {
      const xs = entry.map((p) => p[0]);
      assert(
        Math.abs(
          (Math.min(...xs) + Math.max(...xs)) / 2000 -
            (water.minX + water.maxX) / 2,
        ) < 0.00001,
        "Rounded entries must be centered across the pool width",
      );
    }
    for (let n = 0; n < near.length; n++) {
      assert(
        Math.abs(near[n][0] - far[n][0]) < 0.01 &&
          Math.abs(near[n][1] + far[n][1] - 18900) < 0.01,
        "Equal reflected rounded entries",
      );
    }
    assert.equal(
      clip.difference([data.pool.parts.fountain], [data.pool.parts.water])
        .length,
      0,
      "Fountain pedestal stands inside water",
    );
    const basin = data.dimensions.find((m) => m.part === "basin floor");
    assert(
      Math.abs(water.restTop - basin.top - 1.2) < 0.00001,
      "Exactly 1.2 m resting water depth",
    );
    assert(
      Math.abs(water.bottom - (basin.top - 0.002)) < 0.00001,
      "Hidden water boundary overlaps the solid basin by 2 mm to avoid coplanar ray-hit ties",
    );
    assert.equal(
      data.dimensions.filter((m) => m.part.startsWith("entry step")).length,
      2,
      "One step at each end",
    );
    assert.equal(
      clip.difference([data.pool.parts.fountain], [data.pool.parts["step-1"]])
        .length,
      0,
      "Fountain supported inside entry step",
    );
    const animation = await page.evaluate(async () => {
      const { model, interaction } = Building3D.instance;
      const water = model.pickables.find((m) => m.userData.part === "water");
      const controller = interaction.controllers.find(
        (c) => c.kind === "water",
      );
      const drop = model.pickables.find(
        (m) => m.userData.part === "fountain flowing water",
      );
      const originalPositions =
        water.geometry.attributes.position.array.slice();
      const originalNormals = water.geometry.attributes.normal.array.slice();
      function snapshot() {
        return {
          diagnostics: controller.diagnostics,
          drop: drop.isInstancedMesh
            ? Array.from(drop.instanceMatrix.array.slice(0, 16))
            : drop.position.toArray(),
        };
      }
      const a = snapshot();
      const start = performance.now();
      while (
        controller.diagnostics.impactCount < a.diagnostics.impactCount + 2 &&
        performance.now() - start < 5000
      )
        await new Promise((r) => requestAnimationFrame(r));
      const b = snapshot();
      let positionDelta = 0,
        normalDelta = 0;
      for (let n = 0; n < originalPositions.length; n++)
        positionDelta = Math.max(
          positionDelta,
          Math.abs(
            water.geometry.attributes.position.array[n] - originalPositions[n],
          ),
        );
      for (let n = 0; n < originalNormals.length; n++)
        normalDelta = Math.max(
          normalDelta,
          Math.abs(
            water.geometry.attributes.normal.array[n] - originalNormals[n],
          ),
        );
      return {
        a,
        b,
        positionDelta,
        normalDelta,
        ringCount: model.pickables.filter(
          (m) => m.userData.part === "fountain expanding ripple",
        ).length,
      };
    });
    assert.equal(
      animation.ringCount,
      0,
      "impact ripples are part of the water surface, with no raised ring meshes",
    );
    assert(
      animation.b.diagnostics.impactCount >=
        animation.a.diagnostics.impactCount + 2,
      "falling stream repeatedly impacts the water",
    );
    assert(
      animation.positionDelta > 0.00001 && animation.normalDelta > 0.0001,
      "impact waves move physical vertices and reflection normals",
    );
    assert.notDeepEqual(animation.a.drop, animation.b.drop, "Jet water flows");
    fs.mkdirSync("audit/pool", { recursive: true });
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.preset("iso");
      i.render();
    });
    await page
      .locator("#model-canvas")
      .screenshot({ path: "audit/pool/whole-house.png" });
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.preset("iso");
      const target = i.camera.position.clone().set(29.6, 0.6, 9.5);
      i.orbit.target.copy(target);
      i.camera.position
        .copy(target)
        .add(i.camera.position.clone().set(13, 11, 11));
      i.camera.lookAt(target);
      i.camera.zoom = 3.1;
      i.camera.updateProjectionMatrix();
      i.render();
    });
    await page
      .locator("#model-canvas")
      .screenshot({ path: "audit/pool/close-up.png" });
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.preset("top");
      i.camera.up.set(-1, 0, 0);
      i.orbit.target.set(28.8, 0, 7200 / 1000);
      i.camera.position.set(28.8, 65, 7.2);
      i.camera.lookAt(i.orbit.target);
      i.camera.zoom = 2.9;
      i.camera.updateProjectionMatrix();
      i.render();
    });
    fs.writeFileSync(
      "audit/pool/overhead.png",
      Buffer.from(
        await page.evaluate(
          () =>
            Building3D.instance.renderer.domElement
              .toDataURL("image/png")
              .split(",")[1],
        ),
        "base64",
      ),
    );
    const visibility = await page.evaluate(() => {
      const i = Building3D.instance;
      const group = i.model.root.getObjectByName("swimming-pool");
      const result = [];
      for (const floor of ["first", "ground", "all"]) {
        i.settings.floor = floor;
        i.settings.cut = floor === "ground";
        i.update();
        let visible = true;
        for (let parent = group; parent; parent = parent.parent)
          visible &&= parent.visible;
        result.push(visible);
      }
      i.settings.floor = "all";
      i.settings.cut = false;
      i.settings.explode = 2;
      i.update();
      i.model.root.updateMatrixWorld(true);
      const y = group.getWorldPosition(i.camera.position.clone()).y;
      return { result, y };
    });
    assert.deepEqual(visibility.result, [false, true, true]);
    assert(
      Math.abs(visibility.y - 2) < 0.00001,
      "Pool follows ground floor in exploded view",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "audit/pool/report.json",
      JSON.stringify(
        { status: "Passed", ...data, animation, visibility },
        null,
        2,
      ),
    );
    console.log(
      "PASS shared pool edits, 8 basin/step meshes plus fountain, basin/coping/paving containment, matching rounded entries with one step each, 1.2 m resting depth, animated stream with physical impact waves and normals, 4.0 × 8.3 m footprint, floor isolation and exploded alignment",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
