import assert from "node:assert/strict";
import { build } from "esbuild";
import * as THREE from "three";
import clipping from "polygon-clipping";
import { archOpeningProfile } from "../model/arch-profile.js";
import { segmentalOpening } from "../model/segmental-arch.js";
import { rectangle } from "../model/model-geometry.js";

// Bundle only the production geometry helper; image assets are irrelevant to
// the pane topology and remain out of this independent Node geometry check.
const result = await build({
  stdin: {
    contents: 'export { glazingGeometry } from "./model/build-model.js";',
    resolveDir: process.cwd(),
    sourcefile: "glazing-test-entry.js",
  },
  bundle: true,
  format: "esm",
  write: false,
  loader: { ".jpg": "empty", ".png": "empty" },
});
const { glazingGeometry } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

function ringArea(ring) {
  let value = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    value += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(value) / 2;
}

function checkPane(polygon, thickness = 0.006) {
  const geometry = glazingGeometry(polygon, thickness);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  assert(Math.abs(bounds.min.z + thickness / 2) < 1e-8);
  assert(
    Math.abs(bounds.max.z - thickness / 2) < 1e-8,
    "Pane is centered on its original opening plane",
  );
  const outer = polygon[0];
  for (const [coordinate, component] of [
    [0, "x"],
    [1, "y"],
  ]) {
    const values = outer.map((point) => point[coordinate] / 1000);
    assert(Math.abs(bounds.min[component] - Math.min(...values)) < 1e-6);
    assert(
      Math.abs(bounds.max[component] - Math.max(...values)) < 1e-6,
      "Adding thickness cannot change the architectural opening outline",
    );
  }
  const positions = geometry.attributes.position;
  const indices = geometry.index?.array;
  const edgeCounts = new Map(),
    edgeDirections = new Map();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    cross = new THREE.Vector3();
  const vertexKey = (v) =>
    v
      .toArray()
      .map((n) => Math.round(n * 1e6))
      .join(",");
  let volume = 0;
  const count = indices?.length ?? positions.count;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(positions, indices ? indices[i] : i);
    b.fromBufferAttribute(positions, indices ? indices[i + 1] : i + 1);
    c.fromBufferAttribute(positions, indices ? indices[i + 2] : i + 2);
    assert(
      cross.subVectors(b, a).cross(c.clone().sub(a)).length() > 1e-10,
      "No degenerate pane triangles",
    );
    volume += a.dot(cross.crossVectors(b, c)) / 6;
    const keys = [vertexKey(a), vertexKey(b), vertexKey(c)];
    for (let edge = 0; edge < 3; edge++) {
      const u = keys[edge],
        v = keys[(edge + 1) % 3];
      const key = u < v ? `${u}|${v}` : `${v}|${u}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      edgeDirections.set(
        key,
        (edgeDirections.get(key) || 0) + (u < v ? 1 : -1),
      );
    }
  }
  assert(
    [...edgeCounts.values()].every((value) => value === 2),
    "Every pane edge belongs to exactly two triangles: closed watertight volume",
  );
  assert(
    [...edgeDirections.values()].every((value) => value === 0),
    "Adjacent triangles have consistent outward winding",
  );
  const area =
    (ringArea(polygon[0]) -
      polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)) /
    1e6;
  assert(
    Math.abs(volume - area * thickness) < 2e-8,
    "Positive optical volume equals the original glazed area times thickness",
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
  );
  mesh.updateMatrixWorld();
  // Original glazed polygon must remain visible from both sides of its solid.
  const inside = outer
    .reduce(
      (sum, p) => sum.add(new THREE.Vector2(p[0], p[1])),
      new THREE.Vector2(),
    )
    .multiplyScalar(1 / outer.length / 1000);
  if (!polygon.slice(1).length) {
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(inside.x, inside.y, side),
        new THREE.Vector3(0, 0, -side),
      );
      assert(
        ray.intersectObject(mesh).length > 0,
        "Both outside faces refract rays into a real pane",
      );
    }
  }
  return { geometry, mesh };
}

checkPane([rectangle(0, 0, 1200, 1800)]);
checkPane([rectangle(0, 0, 900, 2005)], 0.01);
const arch = archOpeningProfile(0, 2410, 0, 2143, 820, 1205);
checkPane([arch]);
checkPane([segmentalOpening(45, 2600, 650, 2900, 240)]);
const notched = clipping.difference([arch], [rectangle(410, -1, 1590, 2144)]);
for (const polygon of notched) checkPane(polygon);
const hole = rectangle(500, 400, 700, 1200);
const { mesh } = checkPane([rectangle(0, 0, 2400, 2800), hole]);
const throughHole = new THREE.Raycaster(
  new THREE.Vector3(0.8, 1, 1),
  new THREE.Vector3(0, 0, -1),
);
assert.equal(
  throughHole.intersectObject(mesh).length,
  0,
  "Retained opening holes never acquire glass caps",
);
checkPane([arch.slice().reverse()]);
assert.throws(() => glazingGeometry([arch], 0), RangeError);
assert.throws(() => glazingGeometry([arch], NaN), RangeError);
console.log(
  "PASS closed centered 6 mm glazing and 10 mm shower profiles: segmental/arched/rectangular outlines, door cutouts and holes, outward winding, two-sided optical volume, unchanged projected dimensions",
);
