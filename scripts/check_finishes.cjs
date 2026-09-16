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
    args: ["--enable-unsafe-webgpu"],
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
  const output = path.resolve(__dirname, "../audit/material-upgrade/finishes");
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    });
    const errors = [],
      remote = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) remote.push(request.url());
    });
    await page.goto(
      "file://" + path.resolve(__dirname, "../index.html") + "#3d",
      { timeout: 60000 },
    );
    await page.waitForFunction(() => window.Building3D?.instance, null, {
      timeout: 60000,
    });
    const result = await page.evaluate(() => {
      const i = Building3D.instance,
        m = i.model.materials,
        meshes = i.model.pickables;
      const materials = (mesh) => [mesh.material].flat();
      const family = (material) => material.userData?.generatedTexture;
      const hasFamily = (mesh, kind) =>
        materials(mesh).some((material) => family(material) === kind);
      const rooms = meshes.filter((mesh) => mesh.userData.kind === "room");
      const roomKey = (floor, name) => `${floor}:${name}`;
      const keys = (list) =>
        [
          ...new Set(
            list.map((mesh) =>
              roomKey(mesh.userData.floor, mesh.userData.name),
            ),
          ),
        ].sort();
      const carpetIds = new Set([
        "bed1",
        "bed2",
        "bed3",
        "bed4",
        "bed5",
        "study",
      ]);
      const expectedCarpet = [],
        expectedOak = [],
        expectedMosaic = [];
      for (const floor of i.data.floors) {
        for (const room of floor.rooms) {
          if (room.category === "void" || !room.pointsMm?.length) continue;
          const key = roomKey(floor.id, room.name);
          if (carpetIds.has(room.id)) expectedCarpet.push(key);
          else if (["kitchen", "laundry"].includes(room.id))
            expectedMosaic.push(key);
          else if (
            room.category !== "wet" &&
            ![
              "garage",
              "portico",
              "bath1",
              "bath2",
              "ensuite",
              "wc1",
              "powder",
            ].includes(room.id)
          )
            expectedOak.push(key);
        }
      }
      const allMeshes = [];
      i.model.root.traverse((mesh) => {
        if (mesh.isMesh) allMeshes.push(mesh);
      });
      const families = {};
      for (const kind of ["plaster", "timber", "oak", "bark", "carpet"]) {
        const matching = allMeshes.filter((mesh) => hasFamily(mesh, kind));
        const variants = [
          ...new Set(
            matching.flatMap((mesh) =>
              materials(mesh)
                .filter((material) => family(material) === kind)
                .map((material) => material.userData.finishVariant?.index)
                .filter(Number.isInteger),
            ),
          ),
        ];
        families[kind] = { meshes: matching.length, variants: variants.sort() };
      }
      const bases = meshes.filter(
        (mesh) => mesh.userData.part === "bottom-cover",
      );
      const woodDoors = meshes.filter(
        (mesh) =>
          mesh.userData.kind === "door" &&
          materials(mesh).some((material) => material.userData?.wood),
      );
      const mapped = allMeshes.filter((mesh) =>
        materials(mesh).some(
          (material) =>
            material.userData?.physicalUV || material.userData?.wood,
        ),
      );
      return {
        backend: i.renderer.backend.isWebGPUBackend,
        fallback: i.renderer._getFallback,
        expectedCarpet: [...new Set(expectedCarpet)].sort(),
        carpetRooms: keys(rooms.filter((mesh) => hasFamily(mesh, "carpet"))),
        expectedOak: [...new Set(expectedOak)].sort(),
        oakRooms: keys(rooms.filter((mesh) => hasFamily(mesh, "oak"))),
        expectedMosaic: [...new Set(expectedMosaic)].sort(),
        mosaicRooms: keys(
          rooms.filter((mesh) =>
            materials(mesh).some((material) => material.map === m.mosaic.map),
          ),
        ),
        cabinetBaseCount: bases.length,
        cabinetBases: bases.every((mesh) =>
          materials(mesh).some(
            (material) =>
              family(material) === "timber" &&
              material.map === m.cabinetWood.map,
          ),
        ),
        mappedDoors: woodDoors.length,
        doorMaps: woodDoors.every((mesh) =>
          materials(mesh)
            .filter((material) => material.userData?.wood)
            .every(
              (material) =>
                family(material) === "timber" &&
                !!material.map &&
                !!material.normalMap,
            ),
        ),
        applianceWood: meshes.some(
          (mesh) =>
            mesh.userData.profile?.startsWith("appliance") &&
            materials(mesh).some((material) => material.userData?.wood),
        ),
        dishwasher: meshes.some(
          (mesh) => mesh.userData.fixtureId === "dishwasher",
        ),
        physicalUVMeshes: mapped.length,
        validUVs: mapped.every((mesh) => {
          const uv = mesh.geometry.attributes.uv;
          return (
            uv &&
            uv.count === mesh.geometry.attributes.position.count &&
            Array.from(uv.array).every(Number.isFinite)
          );
        }),
        families,
        maps: [
          "wall",
          "room",
          "carpet",
          "cabinetWood",
          "door",
          "entranceTimber",
          "mosaic",
        ].map((name) => {
          const material = m[name],
            texture = material.map;
          return {
            name,
            family: family(material),
            map: !!texture,
            loaded:
              !!texture?.image &&
              texture.image.width > 1 &&
              texture.image.height > 1,
            normal: !!material.normalMap,
            bump: !!material.bumpMap,
            roughness: !!material.roughnessMap,
            repeat: texture?.repeat.toArray(),
          };
        }),
      };
    });
    assert.equal(result.backend, true, "Finishes must render with WebGPU");
    assert.equal(result.fallback, null, "WebGPU must have no WebGL fallback");
    assert.equal(
      result.expectedCarpet.length,
      6,
      "All five bedrooms and study must exist",
    );
    assert.deepEqual(
      result.carpetRooms,
      result.expectedCarpet,
      "Carpet belongs only in bedrooms and study",
    );
    assert.deepEqual(
      result.oakRooms,
      result.expectedOak,
      "Other dry room floors must retain oak despite per-object variants",
    );
    assert(
      result.oakRooms.length >= 5,
      "Oak flooring must remain present throughout shared rooms",
    );
    assert.equal(result.expectedMosaic.length, 2);
    assert.deepEqual(
      result.mosaicRooms,
      result.expectedMosaic,
      "Only kitchen and laundry use mosaic",
    );
    assert(
      result.cabinetBaseCount > 0 && result.cabinetBases,
      "Cabinet undersides must retain the cabinetry map",
    );
    assert(
      result.mappedDoors > 10 && result.doorMaps,
      "Wooden doors need generated timber and relief maps",
    );
    assert(
      !result.applianceWood && !result.dishwasher,
      "Appliances must not receive wood; omitted dishwasher stays absent",
    );
    assert(
      result.physicalUVMeshes > 100 && result.validUVs,
      "Physical finishes need finite UVs for every vertex",
    );
    for (const [kind, family] of Object.entries(result.families)) {
      assert(family.meshes > 0, `Missing generated ${kind} material family`);
      assert(
        family.variants.length >= 2,
        `${kind} must retain visible per-object material variation`,
      );
    }
    assert(
      result.maps.every(
        (map) =>
          map.map &&
          map.loaded &&
          (map.normal || map.bump) &&
          map.repeat.every((value) => Number.isFinite(value) && value > 0),
      ),
      "Finishes require loaded albedo, normal or height relief, and physical repeats",
    );
    assert(
      result.maps
        .filter((map) => map.family)
        .every((map) => map.normal && map.roughness),
      "Generated families need normal and roughness detail",
    );

    for (const view of ["kitchen", "laundry", "timber-floor"]) {
      const png = await page.evaluate(async (view) => {
        const i = Building3D.instance;
        i.activate(false);
        Object.assign(i.settings, {
          floor: "ground",
          roof: false,
          cut: false,
          plans: false,
          labels: false,
          landscape: false,
        });
        i.update();
        i.model.root.position.set(0, 0, 0);
        i.pivot.position.set(0, 0, 0);
        i.pivot.quaternion.identity();
        i.model.root.updateMatrixWorld(true);
        const poses = {
          kitchen: [
            [21.4, 2, 4.6],
            [20.7, 0.6, 1.4],
          ],
          laundry: [
            [16.2, 2, 4.2],
            [15.1, 0.55, 2.4],
          ],
          "timber-floor": [
            [12.6, 1.7, 10.7],
            [15.4, 0.4, 9.5],
          ],
        };
        const camera = i.tour.camera;
        camera.position.set(...poses[view][0]);
        camera.lookAt(...poses[view][1]);
        camera.updateProjectionMatrix();
        i.renderer.shadowMap.needsUpdate = true;
        i.selection.render(camera);
        await i.renderer.backend.device.queue.onSubmittedWorkDone();
        return i.renderer.domElement.toDataURL("image/png");
      }, view);
      fs.writeFileSync(
        path.join(output, `${view}.png`),
        Buffer.from(png.split(",")[1], "base64"),
      );
    }
    assert.deepEqual(errors, [], "Browser and GPU errors");
    assert.deepEqual(
      remote,
      [],
      "Portable viewer must load all finishes offline",
    );
    fs.writeFileSync(
      path.join(output, "checks.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(
      "PASS generated finish families and variants, bedroom/study carpet, oak floors, kitchen/laundry mosaic, cabinet and door maps, finite physical UVs, offline native WebGPU",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
