const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "audit/loft-floors"),
  baseline = process.argv.includes("--baseline"),
  prefix = baseline ? "before-" : "",
  view = process.argv.find((a) => a.startsWith("--view="))?.split("=")[1];
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Box3,Vector3,Raycaster} from "three";window.LoftTest={Box3,Vector3,Raycaster};',
    resolveDir: root,
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
  const page = await browser.newPage({
      viewport: { width: 1000, height: 900 },
    }),
    errors = [],
    results =
      view && fs.existsSync(path.join(out, prefix + "checks.json"))
        ? JSON.parse(fs.readFileSync(path.join(out, prefix + "checks.json")))
        : { baseline, baselineCommit: "59b5d73" };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
      console.error(m.text());
    }
  });
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  async function capture(name) {
    await frames();
    await page.screenshot({ path: path.join(out, prefix + name + ".png") });
  }
  async function camera(kind) {
    return page.evaluate((kind) => {
      const i = Building3D.instance,
        T = LoftTest;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      Object.assign(i.settings, {
        floor: "ground",
        roof: false,
        cut: true,
        plans: false,
        labels: false,
        landscape: false,
      });
      i.update();
      const poses = {
        gap: { target: [16.3, 0.1, 3.8], eye: [17.6, 4.3, 5.8], half: 1.45 },
        garage: { target: [3, -0.45, 10.5], eye: [7, 5, 16], half: 3.7 },
        circulation: {
          target: [18.52, 0.1, 10.15],
          eye: [20, 5.7, 13.8],
          half: 2.5,
        },
      };
      const p = poses[kind];
      i.camera.position.set(...p.eye);
      i.camera.up.set(0, 1, 0);
      i.camera.lookAt(...p.target);
      i.orbit.target.set(...p.target);
      const r = i.renderer.domElement.getBoundingClientRect();
      i.camera.left = (-p.half * r.width) / r.height;
      i.camera.right = -i.camera.left;
      i.camera.top = p.half;
      i.camera.bottom = -p.half;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
      i.interaction.reset();
      i.quality.sceneChanged();
      i.render();
      return p;
    }, kind);
  }
  async function inventory() {
    return page.evaluate(() => {
      const cache = new Map();
      const stats = (map) => {
        if (!map?.image) return null;
        if (cache.has(map)) return cache.get(map);
        const image = map.image;
        let data = image.data;
        if (!data) {
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          data = ctx.getImageData(0, 0, image.width, image.height).data;
        }
        const channels = data.length / (image.width * image.height);
        let hash = 2166136261,
          min = 255,
          max = 0,
          s = 0,
          ss = 0,
          count = 0;
        for (
          let n = 0;
          n < data.length;
          n +=
            Math.max(1, Math.floor((image.width * image.height) / 65536)) *
            channels
        ) {
          const v = data[n];
          hash = Math.imul(hash ^ v, 16777619) >>> 0;
          min = Math.min(min, v);
          max = Math.max(max, v);
          s += v;
          ss += v * v;
          count++;
        }
        const result = {
          name: map.name,
          width: image.width,
          height: image.height,
          channel: map.channel,
          repeat: map.repeat.toArray(),
          offset: map.offset.toArray(),
          min,
          max,
          std: Math.sqrt(ss / count - (s / count) ** 2),
          hash: hash.toString(16),
        };
        cache.set(map, result);
        return result;
      };
      const i = Building3D.instance;
      const material = (m) => ({
        name: m.name,
        color: m.color?.getHexString(),
        roughness: m.roughness,
        metalness: m.metalness,
        userData: m.userData,
        normalScale: m.normalScale?.toArray(),
        bumpScale: m.bumpScale,
        map: stats(m.map),
        normalMap: stats(m.normalMap),
        bumpMap: stats(m.bumpMap),
        roughnessMap: stats(m.roughnessMap),
      });
      const hash = (arrays) => {
        let h = 2166136261;
        for (const a of arrays) {
          if (!a) continue;
          for (const v of new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
            h = Math.imul(h ^ v, 16777619) >>> 0;
        }
        return h.toString(16);
      };
      const counts = new Map();
      const floors = i.model.pickables
        .filter((m) => ["room", "slab", "finish"].includes(m.userData.kind))
        .map((m) => {
          const key = [
              m.userData.kind,
              m.userData.floor,
              m.userData.name,
              m.userData.finishPatch,
            ].join("|"),
            ordinal = counts.get(key) || 0;
          counts.set(key, ordinal + 1);
          const p = m.geometry.attributes.position;
          let min = Infinity,
            max = -Infinity;
          for (let n = 0; n < p.count; n++) {
            min = Math.min(min, p.getY(n));
            max = Math.max(max, p.getY(n));
          }
          return {
            key: key + "|" + ordinal,
            metadata: m.userData,
            geometryHash: hash([p.array, m.geometry.index?.array]),
            vertices: p.count,
            position: m.position.toArray(),
            rotation: m.rotation.toArray(),
            scale: m.scale.toArray(),
            localY: [min, max],
            materials: [m.material].flat().map(material),
          };
        });
      const controls = [];
      for (const kind of ["wall", "door", "driveway", "front-pavement"]) {
        const meshes = i.model.pickables
          .filter((m) =>
            kind === "wall"
              ? m.userData.kind === "wall"
              : kind === "door"
                ? m.userData.kind === "door" &&
                  [m.material]
                    .flat()
                    .some((x) => x.userData.generatedTexture === "timber")
                : m.userData.siteId === kind,
          )
          .slice(0, 2);
        for (const m of meshes)
          controls.push({
            kind,
            name: m.userData.name,
            materials: [m.material].flat().map(material),
          });
      }
      return { floors, controls };
    });
  }
  async function photo(kind) {
    await page.evaluate(() => {
      const p = Building3D.instance.quality.photo;
      window.detailSnapshot = !p;
      if (p) {
        const old = p.setScene;
        p.setScene = function (...a) {
          const value = old.apply(this, a);
          window.detailSnapshot = true;
          p.setScene = old;
          return value;
        };
      }
    });
    await page.click('[data-render-mode="photo"]');
    await page.waitForFunction(
      () => {
        const q = Building3D.instance.quality;
        return (
          q.error ||
          (window.detailSnapshot && !q.preparing && q.photo?.samples >= 32)
        );
      },
      null,
      { timeout: 180000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    await page.evaluate(() => {
      const p = Building3D.instance.quality.photo;
      window.detailRender = p.renderSample;
      p.renderSample = () => p.present(false);
      p.present();
    });
    await capture(kind + "-photo");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#model-download");
    await (
      await downloadPromise
    ).saveAs(path.join(out, prefix + kind + "-export.png"));
    const value = await page.evaluate(() => ({
      samples: Building3D.instance.quality.photo.samples,
      counts: Building3D.instance.quality.photo.sampleCounts,
      denoise: Building3D.instance.quality.photo.denoiseDiagnostics,
    }));
    assert(value.samples >= 32);
    await page.evaluate(() => {
      Building3D.instance.quality.photo.renderSample = window.detailRender;
    });
    await page.click('[data-render-mode="explore"]');
    return value;
  }
  try {
    await page.goto(
      "file://" +
        path.join(
          root,
          baseline ? "tmp/loft-floors-baseline.html" : "9-glenn-viewer.html",
        ) +
        "#3d",
    );
    await page.waitForFunction(
      () => window.Building3D?.instance?.interaction,
      null,
      { timeout: 60000 },
    );
    await page.addScriptTag({ content: helper });
    assert(
      await page.evaluate(
        () => Building3D.instance.renderer.backend.isWebGPUBackend,
      ),
    );
    await page.click('[data-camera="top"]');
    await page.uncheck("#model-perspective");
    results.inventory = await inventory();
    if (!baseline) {
      const before = JSON.parse(
        fs.readFileSync(path.join(out, "before-checks.json")),
      );
      for (const f of before.inventory.floors) {
        if (f.metadata.finishPatch === "stair-floor") continue;
        const next = results.inventory.floors.find((n) => n.key === f.key);
        assert(next, `Existing floor ${f.key}`);
        for (const property of [
          "geometryHash",
          "vertices",
          "position",
          "rotation",
          "scale",
          "localY",
        ])
          assert.deepEqual(
            next[property],
            f[property],
            `${f.key} preserves ${property}`,
          );
      }
      for (const f of before.inventory.floors) {
        if (f.metadata.finishPatch === "stair-floor") continue;
        const next = results.inventory.floors.find((n) => n.key === f.key);
        if (f.metadata.kind === "slab") {
          assert.deepEqual(
            next.materials[1],
            f.materials[1],
            `${f.key} original sidewall`,
          );
          assert.deepEqual(
            next.materials[2],
            f.materials[0],
            `${f.key} original underside`,
          );
          assert.equal(next.materials[0].userData.generatedTexture, "cement");
        } else if (
          f.metadata.kind === "room" &&
          f.metadata.elevation === -514
        ) {
          assert.equal(next.materials[0].userData.generatedTexture, "cement");
        } else
          assert.deepEqual(
            next.materials,
            f.materials,
            `${f.key} original room finish unchanged`,
          );
      }
      for (const m of results.inventory.floors
        .flatMap((f) => f.materials)
        .filter((m) => m.userData.generatedTexture === "cement"))
        for (const key of ["map", "normalMap", "roughnessMap"])
          assert(m[key]?.std > 0.5, `Cement loaded nonuniform ${key}`);
      assert.deepEqual(
        results.inventory.controls,
        before.inventory.controls,
        "Walls, solid door wood, asphalt and paving unchanged",
      );
      results.geometryUnchanged = true;
    }
    for (const kind of view
      ? view.split(",")
      : ["garage", "circulation", "gap"]) {
      results[kind] = { camera: await camera(kind) };
      await capture(kind + "-explore");
      results[kind].photo = await photo(kind);
      console.log(kind, JSON.stringify(results[kind].photo));
    }
    results.gapHits = await page.evaluate(() => {
      const i = Building3D.instance,
        T = LoftTest;
      const targets = [
        [16.3, 3.8],
        [9.33, 7.935],
        [12, 5.775],
        [12, 7.985],
        [18, 10.36],
        [18.7, 10.36],
        [19.4, 9.95],
      ];
      const floors = i.model.pickables.filter(
        (m) =>
          m.userData.floor === "ground" &&
          ["slab", "room", "finish"].includes(m.userData.kind),
      );
      i.scene.updateMatrixWorld(true);
      return targets.map(([x, z]) => {
        const hit = new T.Raycaster(
          new T.Vector3(x, 2, z),
          new T.Vector3(0, -1, 0),
        ).intersectObjects(floors, false)[0];
        if (!hit) return { x, z };
        const m = Array.isArray(hit.object.material)
          ? hit.object.material[hit.face.materialIndex]
          : hit.object.material;
        return {
          x,
          z,
          y: hit.point.y,
          kind: hit.object.userData.kind,
          patch: hit.object.userData.finishPatch,
          finish: m.userData.generatedTexture,
        };
      });
    });
    if (!baseline)
      for (const hit of results.gapHits) {
        assert.equal(hit.finish, "oak", `Wood coverage at ${hit.x},${hit.z}`);
        assert(Math.abs(hit.y - 0.004) < 1e-5);
      }
    results.cutaway = await page.evaluate(() => {
      const i = Building3D.instance;
      return {
        floor: i.settings.floor,
        roof: i.settings.roof,
        cut: i.settings.cut,
        clip: i.model.floorGroups.get("ground").clipGroup.enabled,
      };
    });
    assert.equal(results.cutaway.roof, false);
    assert.equal(results.cutaway.clip, true);
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, prefix + "checks.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log("PASS native loft floor views, geometry, controls and cutaway");
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, prefix + "failure.png") })
      .catch(() => {});
    fs.writeFileSync(
      path.join(out, prefix + "failure.json"),
      JSON.stringify({ error: String(error), results, errors }, null, 2) + "\n",
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
