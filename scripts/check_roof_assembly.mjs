import assert from "node:assert/strict";
import fs from "node:fs";
import clipping from "polygon-clipping";
import {
  buildRoofAssembly,
  projectRoofs,
  sectionRoofs,
} from "../model/roof-assembly.js";
const spec = JSON.parse(fs.readFileSync("assets/building-spec.json", "utf8"));
const assembly = buildRoofAssembly(spec);
assert.deepEqual(
  assembly,
  spec.roofAssembly,
  "the packaged 3D faces must equal drawing authoring faces",
);
const surfaces = assembly.faces.filter((f) => f.kind === "surface");
const ringArea = (r) =>
  Math.abs(
    r.reduce((sum, p, i) => {
      const q = r[(i + 1) % r.length];
      return sum + p[0] * q[1] - p[1] * q[0];
    }, 0) / 2,
  );
const polygonArea = (poly) =>
  ringArea(poly[0]) - poly.slice(1).reduce((sum, r) => sum + ringArea(r), 0);
const multiArea = (polys) => polys.reduce((sum, p) => sum + polygonArea(p), 0);
const footprint = (f) => f.rings.map((r) => r.map(([x, y, z]) => [x, z]));
const near = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) < tol, `${a} differs from ${b}`);
for (const f of surfaces) {
  const wanted =
    f.component === "arch-gable"
      ? 25
      : f.component === "portico-deck"
        ? 1
        : 20 + 49 / 60;
  near(
    (Math.atan(Math.hypot(...f.plane.slice(0, 2))) * 180) / Math.PI,
    wanted,
    1e-7,
  );
  for (const ring of f.rings)
    for (const [x, y, z] of ring)
      near(y, f.plane[0] * x + f.plane[1] * z + f.plane[2], 1e-7);
  assert.ok(polygonArea(footprint(f)) > 1);
}
// The exposed upper footprint is the dimensioned stepped wall outline + 160 mm.
const expected = [
  [
    [9440, 440],
    [26790, 440],
    [26790, 12870],
    [22710, 12870],
    [22710, 13950],
    [17970, 13950],
    [17970, 14180],
    [14180, 14180],
    [14180, 13950],
    [9440, 13950],
    [9440, 12870],
    [5360, 12870],
    [5360, 4520],
    [9440, 4520],
  ],
];
const upper = surfaces.filter((f) => f.level === "upper").map(footprint);
const union = clipping.union(...upper);
assert.ok(
  multiArea(clipping.xor(union, expected)) < 5,
  "no missing roof or invented cover over rear courtyard",
);
for (let i = 0; i < surfaces.length; i++)
  for (let j = i + 1; j < surfaces.length; j++) {
    if (surfaces[i].level !== surfaces[j].level) continue;
    assert.ok(
      multiArea(
        clipping.intersection(footprint(surfaces[i]), footprint(surfaces[j])),
      ) < 5,
      `overlapping skins: ${surfaces[i].id} / ${surfaces[j].id}`,
    );
  }
function heightAt(component, x, z) {
  const f = surfaces
    .filter((f) => f.component === component)
    .find(
      (f) =>
        multiArea(
          clipping.intersection(footprint(f), [
            [
              [x - 0.05, z - 0.05],
              [x + 0.05, z - 0.05],
              [x + 0.05, z + 0.05],
              [x - 0.05, z + 0.05],
            ],
          ]),
        ) > 0.0001,
    );
  return f ? f.plane[0] * x + f.plane[1] * z + f.plane[2] : null;
}
const ridge = assembly.edges.filter(
  (e) => e.kind === "ridge" && Math.abs(e.a[1] - e.b[1]) < 0.01,
);
assert.ok(
  ridge.some(
    (e) => e.component === "main-hip" && Math.abs(e.a[2] - 6655) < 0.01,
  ),
);
assert.ok(
  ridge.some(
    (e) =>
      e.component === "central-hip" &&
      Math.abs(e.a[0] - 16075) < 0.01 &&
      Math.abs(e.b[2] - 7315) < 0.01,
  ),
);
near(
  heightAt("central-hip", 16075, 7200) - heightAt("main-hip", 14000, 6655),
  420 * Math.tan((spec.roofPitch * Math.PI) / 180),
);
near(
  heightAt("arch-gable", 16075, 13790),
  6171 + 1895 * Math.tan((25 * Math.PI) / 180),
);
assert.ok(
  assembly.edges.some(
    (e) =>
      e.kind === "valley" &&
      e.faceIds.some((id) => id.startsWith("arch-gable")),
  ),
);
assert.ok(
  assembly.faces.some(
    (f) =>
      f.kind === "infill" &&
      f.rings[0].some((p) => Math.abs(p[0] - 9440) < 0.01 && p[1] > 7600),
  ),
  "rear-west cut is closed vertically",
);
near(
  heightAt("garage-hip", 5000, 9895),
  2391 + 3535 * Math.tan((spec.roofPitch * Math.PI) / 180),
);
near(
  heightAt("garage-hip", 6800, 6500),
  spec.garageEaves + 140 * Math.tan((spec.roofPitch * Math.PI) / 180),
);
near(
  heightAt("garage-hip", 6200, 12800),
  spec.garageEaves + 150 * Math.tan((spec.roofPitch * Math.PI) / 180),
);
assert.ok(
  assembly.edges.some(
    (e) => e.component === "garage-hip" && e.kind === "abutment",
  ),
);
assert.ok(
  assembly.faces.some(
    (f) =>
      f.id.startsWith("garage-abutment-") &&
      f.rings[0].some((p) => p[1] < spec.groundCeiling),
  ),
  "house apron meets the sloping roof below the floor zone",
);
for (const face of surfaces.filter((f) => f.component === "garage-hip")) {
  if (face.id.startsWith("garage-rear-return-")) {
    assert.ok(
      face.rings
        .flat()
        .every(([x, y, z]) => y < spec.groundCeiling && z <= 7890 && x <= 6950),
      "rear return fits below the house slab at the gallery junction",
    );
    continue;
  }
  assert.ok(
    multiArea(
      clipping.intersection(footprint(face), [assembly.upperFootprint]),
    ) < 1,
    "no garage roof hidden beneath the house footprint",
  );
}
assert.equal(
  heightAt("garage-hip", 6000, 9895),
  null,
  "garage roof cannot intersect upper storey",
);
near(
  heightAt("portico-deck", 16075, 16070) -
    heightAt("portico-deck", 16075, 13790),
  2280 * Math.tan(Math.PI / 180),
);
near(
  heightAt("bay-lean-to", 21000, 600) - heightAt("bay-lean-to", 21000, 0),
  600 * Math.tan((spec.roofPitch * Math.PI) / 180),
);
// The raised gable infill must not plug the arched glazing above ceiling height.
const gable = assembly.faces
  .filter((f) => f.id.startsWith("arch-gable-infill"))
  .map((f) => f.rings.map((r) => r.map(([x, y]) => [x, y])));
assert.ok(
  multiArea(
    clipping.intersection(clipping.union(...gable), [
      [
        [16050, 6080],
        [16100, 6080],
        [16100, 6150],
        [16050, 6150],
      ],
    ]),
  ) < 0.01,
);
for (const view of ["front", "rear", "left", "right"]) {
  const faces = projectRoofs(assembly, view);
  for (const face of faces)
    for (const ring of face.rings)
      assert.ok(ring.flat().every(Number.isFinite));
  for (let i = 0; i < faces.length; i++)
    for (let j = i + 1; j < faces.length; j++)
      assert.ok(
        multiArea(clipping.intersection(faces[i].rings, faces[j].rings)) < 20,
        `${view} hidden faces must not overlap`,
      );
}
const cuts = sectionRoofs(assembly);
assert.ok(cuts.length >= 3);
for (const c of cuts) {
  const f = surfaces.find((f) => f.id === c.faceId);
  assert.ok(f);
  for (const [z, y] of c.points.slice(0, 2))
    near(
      6041 - y,
      f.plane[0] * assembly.sectionX + f.plane[1] * (z + 600) + f.plane[2],
    );
}
console.log(
  `PASS ${surfaces.length} shared roof planes: coverage, no overlaps, pitches, separated ridges, arch clearance, rear setback, garage return, lower depths, four hidden-surface projections and ${cuts.length} section cuts`,
);

// Verify actual triangulated Three.js surfaces, including non-convex joins/holes.
const THREE = await import("three");
const { roofAssemblyMeshes } = await import("../model/roof-assembly-mesh.js");
const groups = [new THREE.Group(), new THREE.Group()];
const material = new THREE.MeshBasicMaterial();
roofAssemblyMeshes(
  assembly,
  ...groups,
  { roof: material, fascia: material, roofInfill: material, roofCap: material },
  (mesh, info) => Object.assign(mesh.userData, info),
);
for (const face of surfaces) {
  const mesh = groups
    .flatMap((g) => g.children)
    .find((m) => m.userData.roofFaceId === face.id);
  assert.ok(mesh, `missing mesh ${face.id}`);
  const positions = mesh.geometry.getAttribute("position"),
    normals = mesh.geometry.getAttribute("normal");
  let projectedArea = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) * 1000,
      y = positions.getY(i) * 1000,
      z = positions.getZ(i) * 1000;
    near(y, face.plane[0] * x + face.plane[1] * z + face.plane[2], 0.003);
    assert.ok(normals.getY(i) > 0.85, `upward normal ${face.id}`);
  }
  for (let i = 0; i < positions.count; i += 3)
    projectedArea += ringArea(
      [0, 1, 2].map((n) => [
        positions.getX(i + n) * 1000,
        positions.getZ(i + n) * 1000,
      ]),
    );
  near(projectedArea, polygonArea(footprint(face)), 30);
}
console.log(
  "PASS actual mesh vertices, upward normals and triangulated coverage match every shared roof surface",
);
assert.ok(
  !projectRoofs(assembly, "front").some((f) => f.component === "bay-lean-to"),
  "rear bay must be hidden by house in front view",
);
assert.ok(
  !projectRoofs(assembly, "right").some((f) => f.component === "garage-hip"),
  "garage must be hidden by house in right view",
);
fs.writeFileSync(
  "audit/roofs/verification.json",
  JSON.stringify(
    {
      status: "passed",
      roofSurfaces: surfaces.length,
      components: 6,
      elevations: 4,
      sectionCuts: cuts.length,
      checks: [
        "shared SVG/3D geometry",
        "complete upper coverage",
        "no overlapping roof skins",
        "printed pitches",
        "separate ridge positions",
        "gable arch clearance",
        "rear setback closure",
        "garage return below slab",
        "portico and bay depths",
        "hidden surface occlusion",
        "actual mesh normals and coverage",
      ],
    },
    null,
    2,
  ),
);
console.log(
  "PASS façade occlusion hides rear bay from front and garage from right",
);
