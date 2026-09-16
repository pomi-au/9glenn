const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const clipping = require("polygon-clipping");
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
        viewport: { width: 1100, height: 760 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForFunction(
      () => window.Building3D?.instance,
      {},
      { timeout: 90000 },
    );
    const result = await page.evaluate(() => {
      const i = Building3D.instance,
        g = i.data.floors.find((f) => f.id === "ground"),
        land = i.model.root.getObjectByName("landscaping");
      const areas = g.source.geometry.filter((p) => p.type === "site-area"),
        plants = g.source.geometry.filter((p) => p.type === "site-plant");
      const driveway = areas.find((a) => a.id === "driveway");
      const meshes = i.model.pickables.filter(
        (m) => m.userData.kind === "landscape",
      );
      const drive = meshes.find((m) => m.userData.siteId === "driveway");
      drive.geometry.computeBoundingBox();
      const clone = structuredClone(DRAWINGS.find((d) => d.id === "ground"));
      const nodes = (n) => [n, ...(n.children || []).flatMap(nodes)];
      const tree = nodes(clone.vector).find(
        (n) => n.attributes?.["data-site-plant"] === "front-shade-tree",
      );
      tree.attributes.cx = String(Number(tree.attributes.cx) + 123);
      const changed = Building3D.parseBuilding(
        DRAWINGS.map((d) => (d.id === "ground" ? clone : d)),
      )
        .floors.find((f) => f.id === "ground")
        .source.geometry.find((g) => g.id === "front-shade-tree");
      let triangles = 0;
      for (const m of meshes) {
        const p = m.geometry.attributes.position;
        triangles +=
          ((m.geometry.index?.count || p.count) / 3) *
          (m.isInstancedMesh ? m.count : 1);
      }
      const routeTrees = plants
        .filter((p) => p.form === "tree")
        .every(
          (p) => !(p.x > 14870 && p.x < 17280 && p.z > 16070 && p.z < 22200),
        );
      // Check each rendered leaf cluster, branch and pot, not only plant centres.
      i.model.root.updateWorldMatrix(true, true);
      const inverse = i.model.floorGroups
        .get("ground")
        .group.matrixWorld.clone()
        .invert();
      const plantIds = new Set(plants.map((p) => p.id));
      const plantBounds = [];
      for (const mesh of meshes.filter((m) =>
        plantIds.has(m.userData.siteId),
      )) {
        mesh.geometry.computeBoundingBox();
        const transform = inverse.clone().multiply(mesh.matrixWorld);
        for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
          const matrix = transform.clone();
          if (mesh.isInstancedMesh) {
            const instance = transform.clone();
            mesh.getMatrixAt(n, instance);
            matrix.multiply(instance);
          }
          const box = mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
          plantBounds.push({
            id: mesh.userData.siteId,
            part: mesh.userData.name,
            min: box.min.toArray(),
            max: box.max.toArray(),
          });
        }
      }
      const buildingEnvelopes = i.data.floors.map((f) => ({
        id: f.id,
        bottom: (f.base - i.data.floorZone) / 1000,
        top: (f.base + f.height) / 1000,
        polygon: [
          f.outline.map(([x, z]) => [
            (x + f.offset[0]) / 1000,
            (z + f.offset[1]) / 1000,
          ]),
        ],
      }));
      for (const face of i.data.spec.roofAssembly.faces.filter(
        (f) => f.kind === "surface",
      )) {
        const heights = face.rings.flat().map((p) => p[1] / 1000);
        buildingEnvelopes.push({
          id: face.id,
          bottom: Math.min(...heights),
          top: Math.max(...heights),
          polygon: face.rings.map((r) =>
            r.map(([x, y, z]) => [x / 1000, z / 1000]),
          ),
        });
      }
      return {
        plantBounds,
        buildingEnvelopes,
        portico: [g.rooms.find(r=>r.id==='portico').pointsMm.map(([x,z])=>[x/1000,z/1000])],
        porchPlanters: plants.filter(p=>p.id.startsWith('portico-planter-')),
        porchPiers: i.model.pickables.filter(m=>m.userData.name?.startsWith('photo pier base')).map(m=>{
          m.geometry.computeBoundingBox();
          const b=m.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld));
          return {min:b.min.toArray(),max:b.max.toArray()};
        }),
        hardSurfaces: areas
          .filter((a) => ["paving", "concrete", "asphalt"].includes(a.material))
          .map((a) => ({
            id: a.id,
            polygon: [a.points.map(([x, z]) => [x / 1000, z / 1000])],
          })),
        topiaryBeds: Object.fromEntries(
          [
            ["porch-topiary-left", "living-bed"],
            ["porch-topiary-right", "family-bed"],
          ].map(([id, bed]) => [
            id,
            [
              areas
                .find((a) => a.id === bed)
                .points.map(([x, z]) => [x / 1000, z / 1000]),
            ],
          ]),
        ),
        areas: areas.length,
        plants: plants.length,
        meshes: meshes.length,
        triangles,
        driveway,
        driveTop: drive.geometry.boundingBox.max.y + drive.position.y,
        sharedEdit: changed.x === Number(tree.attributes.cx),
        finite: meshes.every((m) =>
          Array.from(m.geometry.attributes.position.array).every(
            Number.isFinite,
          ),
        ),
        routeTrees,
      };
    });
    assert.equal(result.areas, 12);
    assert.equal(result.porchPlanters.length,4);
    assert(result.porchPlanters.every(p=>p.form==='box-shrub' && p.baseElevation===540 && p.soilPoints.length===4));
    assert(!result.plantBounds.some(p=>p.id.startsWith('portico-planter-') && p.part==='Entrance planter'),'No freestanding porch pots');
    assert(result.plants > 35);
    assert(result.meshes > result.plants);
    assert(result.sharedEdit && result.finite && result.routeTrees);
    assert(
      Math.abs(result.driveTop + 0.514) < 0.00001,
      "Driveway meets garage datum",
    );
    assert.equal(result.driveway.points[0][1], 13310);
    const contacts = [];
    const pavingContacts = [];
    let topiaryPotsInBeds = 0;
    for (const plant of result.plantBounds) {
      const [x, y, z] = plant.min,
        [right, top, back] = plant.max;
      const footprint = [
        [
          [x, z],
          [right, z],
          [right, back],
          [x, back],
        ],
      ];
      const porchPlant=plant.id.startsWith('portico-planter-');
      if(porchPlant){
        assert.deepEqual(clipping.difference(footprint,result.portico),[], 'Porch planting stays on its floor');
        assert(right<15.41 || x>16.74, 'Central porch approach stays clear');
        assert(y>=0.5199,'Planting and soil sit inside raised boxes');
        const box=result.porchPlanters.find(p=>p.id===plant.id);
        const xs=box.soilPoints.map(p=>p[0]/1000),zs=box.soilPoints.map(p=>p[1]/1000);
        assert(x>=Math.min(...xs)-1e-5&&right<=Math.max(...xs)+1e-5&&z>=Math.min(...zs)-1e-5&&back<=Math.max(...zs)+1e-5,'Soil and foliage stay inside the planter recess');
        for(const pier of result.porchPiers){
          const [px,py,pz]=pier.min,[qx,qy,qz]=pier.max;
          assert(!(right>px&&x<qx&&back>pz&&z<qz&&top>py&&y<qy),'Pots and foliage clear the pier bases');
        }
      }
      if (result.topiaryBeds[plant.id]) {
        for (const surface of result.hardSurfaces) {
          if (clipping.intersection(footprint, surface.polygon).length)
            pavingContacts.push({ plant: plant.id, surface: surface.id });
        }
        if (plant.part === "Entrance planter") {
          assert.deepEqual(
            clipping.difference(footprint, result.topiaryBeds[plant.id]),
            [],
            plant.id + " pot must sit entirely in its planting bed",
          );
          topiaryPotsInBeds++;
        }
      }
      for (const building of result.buildingEnvelopes) {
        if (porchPlant && building.id==='ground') continue;
        if (top <= building.bottom || y >= building.top) continue;
        if (clipping.intersection(footprint, building.polygon).length)
          contacts.push({ plant: plant.id, building: building.id });
      }
    }
    assert.deepEqual(
      contacts,
      [],
      "Rendered planting must clear house and roof envelopes",
    );
    assert.deepEqual(
      pavingContacts,
      [],
      "Entrance topiaries must clear all paving",
    );
    assert.equal(topiaryPotsInBeds, 2);
    result.topiaryPavingContacts = pavingContacts;
    result.topiaryPotsInBeds = topiaryPotsInBeds;
    delete result.hardSurfaces;
    delete result.topiaryBeds;
    result.plantBoundsChecked = result.plantBounds.length;
    result.buildingContacts = contacts;
    delete result.plantBounds;
    delete result.buildingEnvelopes;
    async function capture(name) {
      const png = await page.evaluate(() => {
        const i = Building3D.instance;
        i.render();
        return i.renderer.domElement.toDataURL("image/png").split(",")[1];
      });
      fs.writeFileSync("audit/landscape/" + name, Buffer.from(png, "base64"));
    }
    for(const view of ['porch-top','porch-entry']){
      const png=await page.evaluate(view=>{
        const i=Building3D.instance;Object.assign(i.settings,{floor:'ground',roof:false,cut:false,plans:false,labels:false,landscape:true});i.update();
        i.model.root.position.set(0,0,0);i.pivot.position.set(0,0,0);i.pivot.quaternion.identity();i.model.root.updateMatrixWorld(true);
        const c=i.tour.camera;
        c.position.set(...(view==='porch-top'?[16.075,5,14.93]:[16.075,1.8,17.8]));c.lookAt(16.075,0.25,14.9);c.updateProjectionMatrix();
        i.renderer.shadowMap.needsUpdate=true;i.renderer.render(i.scene,c);return i.renderer.domElement.toDataURL('image/png').split(',')[1];
      },view);
      fs.writeFileSync('audit/landscape/'+view+'.png',Buffer.from(png,'base64'));
    }
    await page.evaluate(()=>Building3D.instance.preset('iso'));
    await capture("model-iso.png");
    await page.evaluate(() => Building3D.instance.preset("front"));
    await capture("model-front.png");
    await page.evaluate(() => Building3D.instance.preset("top"));
    await capture("model-top.png");
    await page.locator("#controls-toggle").click();
    await page.locator("#model-landscape").uncheck();
    assert(
      await page.evaluate(
        () =>
          !Building3D.instance.model.root.getObjectByName("landscaping")
            .visible,
      ),
    );
    await page.locator("#model-landscape").check();
    const floors = await page.evaluate(() => {
      const i = Building3D.instance,
        g = i.model.root.getObjectByName("landscaping");
      return ["first", "ground", "all"].map((f) => {
        i.settings.floor = f;
        i.update();
        let visible = true;
        for (let p = g; p; p = p.parent) visible &&= p.visible;
        return visible;
      });
    });
    assert.deepEqual(floors, [false, true, true]);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "audit/landscape/verification.json",
      JSON.stringify({ ...result, floors, status: "Passed" }, null, 2),
    );
    console.log(
      `PASS ${result.plantBoundsChecked} rendered plant bounds clear house and roof envelopes; shared edits, driveway datum, visibility toggle and floor isolation`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
