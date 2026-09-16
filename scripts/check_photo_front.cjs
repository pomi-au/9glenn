const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict"),
  clipping = require("polygon-clipping"),
  path = require("node:path"),
  fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    await page.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    const finishes = await page.evaluate(() =>
      Building3D.instance.model.pickables
        .filter(
          (m) =>
            m.userData.floor === "ground" &&
            ["room", "finish"].includes(m.userData.kind),
        )
        .map((m) => {
          const p = m.geometry.attributes.position;
          const triangles = [];
          for (let j = 0; j < p.count; j += 3) {
            const vertices = [j, j + 1, j + 2].map((k) => [
              p.getX(k),
              p.getY(k) + m.position.y,
              p.getZ(k),
            ]);
            if (vertices.every((v) => Math.abs(v[1] - 0.004) < 1e-6))
              triangles.push([vertices.map(([x, y, z]) => [x, z])]);
          }
          return { name: m.userData.name, triangles };
        }),
    );
    const porch = finishes.filter(
      (f) => f.name === "Photographed terracotta porch finish",
    );
    assert.ok(porch.length > 0, "porch finish is present");
    const area = (ring) =>
      Math.abs(
        ring.reduce((sum, p, i) => {
          const q = ring[(i + 1) % ring.length];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0) / 2,
      );
    for (const finish of finishes.filter((f) => !porch.includes(f)))
      for (const a of porch.flatMap((f) => f.triangles))
        for (const b of finish.triangles) {
          const overlap = clipping.intersection(a, b);
          assert.ok(
            overlap.reduce((sum, p) => sum + area(p[0]), 0) < 1e-8,
            `coplanar porch overlap with ${finish.name}`,
          );
        }
    console.log("PASS porch top has no overlapping room-finish triangles");
    const checks = await page.evaluate(() => {
      const model = Building3D.instance,
        ground = model.data.floors.find((f) => f.id === "ground");
      return BUILDING_SPEC.frontPhoto.windows.map((w) => {
        const cut = ground.cuts.find((c) => c.id === w.id),
          wall = ground.walls.find((wall) => wall.cuts.includes(cut));
        const solid = (x, y) =>
          Building3D.wallContains(wall, x, cut.window.y, y);
        return {
          id: w.id,
          width: cut.bounds.maxX - cut.bounds.minX,
          rise: cut.segmentRise,
          centreClear: !solid(w.x + w.width / 2, cut.head - 40),
          archShoulderSolid: solid(w.x + 40, cut.head - 40),
          middleClear: !solid(w.x + w.width / 2, (cut.sill + cut.head) / 2),
          sillSolid: solid(w.x + w.width / 2, cut.sill - 40),
          surroundFaces: model.model.pickables.filter(
            (m) => m.userData.name === w.id.replaceAll("-", " ") + " surround",
          ).length,
        };
      });
    });
    for (const c of checks) {
      assert.equal(c.rise, 180);
      assert.ok(c.width > 2800);
      assert.ok(
        c.centreClear && c.archShoulderSolid && c.middleClear && c.sillSolid,
        JSON.stringify(c),
      );
      assert.ok(c.surroundFaces >= 4);
    }
    const details = await page.evaluate(() => {
      const { model } = Building3D.instance;
      const colours = Object.fromEntries(
        [
          "wall",
          "fascia",
          "roof",
          "roofCap",
          "gutter",
          "frame",
          "entranceTimber",
          "porch",
        ].map((k) => [k, "#" + model.materials[k].color.getHexString()]),
      );
      const piers = BUILDING_SPEC.corniceAssembly.pilasters.map((p) => {
        const meshes = model.pickables.filter(
          (m) => m.userData.pilasterId === p.id,
        );
        const zs = meshes.flatMap((m) =>
          Array.from(m.geometry.attributes.position.array).filter(
            (v, i) => i % 3 === 2,
          ),
        );
        return {
          id: p.id,
          faces: meshes.length,
          front: Math.max(...zs) * 1000,
          back: Math.min(...zs) * 1000,
          capFaces: model.pickables.filter(
            (m) => m.userData.name === p.id.replaceAll("-", " ") + " cap",
          ).length,
          headBandFaces: model.pickables.filter(
            (m) => m.userData.name === p.id.replaceAll("-", " ") + " head band",
          ).length,
        };
      });
      const entranceLeaves = model.pickables.filter((m) =>
        m.userData.doorKey?.startsWith("ground:front-entry"),
      );
      return {
        colours,
        piers,
        entranceLeaves: entranceLeaves.map((m) => ({
          name: m.userData.name,
          kind: m.userData.kind,
          colour: m.material.color.getHexString(),
        })),
        timberEntrance:
          entranceLeaves.length === 2 &&
          entranceLeaves.every(
            (m) =>
              m.material.color.equals(model.materials.entranceTimber.color) &&
              !m.material.transparent,
          ),
      };
    });
    assert.equal(details.piers.length, 2);
    for (const p of details.piers) {
      assert.equal(p.faces, 6);
      assert.ok(Math.abs(p.front - 14020) < 0.01);
      assert.ok(Math.abs(p.back - 13785) < 0.01);
      assert.ok(p.capFaces >= 6 && p.headBandFaces >= 6);
    }
    assert.ok(details.timberEntrance, JSON.stringify(details));
    fs.writeFileSync(
      "audit/photo-reference/colour-and-piers-verification.json",
      JSON.stringify(details, null, 2),
    );
    async function capture(name) {
      const png = await page.evaluate(() => {
        const m = Building3D.instance;
        m.render();
        return m.renderer.domElement.toDataURL("image/png").split(",")[1];
      });
      fs.writeFileSync(
        "audit/photo-reference/" + name,
        Buffer.from(png, "base64"),
      );
    }
    await capture("model-colour-iso.png");
    await page.screenshot({ path: "tmp/cornices/photo-model-iso.png" });
    await page.evaluate(() => Building3D.instance.preset("front"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: "tmp/cornices/photo-model-front.png" });
    await capture("model-colour-front.png");
    await page.evaluate(() => {
      const m = Building3D.instance;
      m.preset("iso");
      m.orbit.target.set(16.075, 5, 14);
      m.camera.position.set(29, 12, 38);
      m.camera.zoom = 6;
      m.camera.updateProjectionMatrix();
      m.orbit.update();
      m.render();
    });
    await capture("model-upper-piers.png");
    for (const [name, offset] of [
      ["porch-front", [0, 3, 9]],
      ["porch-oblique", [3, 4, 9]],
    ]) {
      await page.evaluate((offset) => {
        const m = Building3D.instance;
        m.pivot.rotation.set(0, 0, 0);
        m.pivot.updateMatrixWorld(true);
        const target = m.model.floorGroups
          .get("ground")
          .group.localToWorld(m.camera.position.clone().set(16.075, 0.6, 15));
        m.camera.position
          .copy(target)
          .add(m.camera.position.clone().set(...offset));
        m.camera.lookAt(target);
        m.camera.zoom = 10;
        m.camera.updateProjectionMatrix();
        m.render();
      }, offset);
      await capture(name + ".png");
    }
    fs.writeFileSync(
      "audit/photo-reference/verification.json",
      JSON.stringify(checks, null, 2),
    );
    console.log(
      "PASS colours, two full-depth upper piers with returning caps and bands, solid timber entry leaves",
    );
    console.log(
      "PASS four actual segmental wall apertures: clear crown and centre, solid arch shoulders and sills, modelled surrounds",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
