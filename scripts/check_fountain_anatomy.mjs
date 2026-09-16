import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { createFountainAnatomy } from "../model/fountain-anatomy.js";

const root = path.resolve(import.meta.dirname, "..");
const anatomy = createFountainAnatomy();
const metadata = anatomy.metadata;
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

for (const name of ["body", "eyes", "scalp"]) {
  const geometry = anatomy[name];
  assert(
    geometry.index &&
      geometry.attributes.position &&
      geometry.attributes.normal,
    `${name} is actual indexed geometry`,
  );
  assert(
    geometry.attributes.position.count > 500,
    `${name} has sculptural detail`,
  );
  for (const value of geometry.attributes.position.array)
    assert(Number.isFinite(value), `${name}: finite positions`);
  for (const value of geometry.index.array)
    assert(
      value < geometry.attributes.position.count,
      `${name}: valid topology`,
    );
  const normal = new THREE.Vector3();
  // Three's sphere topology includes unused duplicate vertices at its poles.
  for (const i of new Set(geometry.index.array)) {
    normal.fromBufferAttribute(geometry.attributes.normal, i);
    assert(
      Math.abs(normal.length() - 1) < 1e-4,
      `${name}: finite unit normals`,
    );
  }
}

const body = anatomy.body;
const position = body.attributes.position;
const parent = Array.from({ length: position.count }, (_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const vertex = (i) => [position.getX(i), position.getY(i), position.getZ(i)];
let longestEdge = 0;
for (let i = 0; i < body.index.count; i += 3) {
  const ids = [0, 1, 2].map((k) => body.index.getX(i + k));
  for (let k = 0; k < 3; k++) {
    const a = ids[k],
      b = ids[(k + 1) % 3];
    const edge = distance(vertex(a), vertex(b));
    assert(
      edge > 1e-7,
      "No collapsed edge at the posed neck, shoulders, elbows or fingers",
    );
    longestEdge = Math.max(longestEdge, edge);
    parent[find(a)] = find(b);
  }
}
assert.equal(
  new Set(parent.map((_, i) => find(i))).size,
  1,
  "Face, neck, torso, arms and hands form one connected surface",
);
// The upright shoulder exposes a 25.8mm armpit diagonal; joint volume is
// separately checked below, so normal pose changes do not imply a tear.
assert(
  longestEdge < 0.03,
  "No stretched bridge or detached joint concealed by a long triangle",
);
// Connectivity alone missed the original elbow pinch. Rays across a 16mm
// patch at the actual bend must pass through a solid, substantial arm volume.
const elbowMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const elbowMesh = new THREE.Mesh(body, elbowMaterial);
for (const dx of [-0.008, 0, 0.008])
  for (const dy of [-0.008, 0, 0.008]) {
    const elbow = metadata.elbows.L;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(elbow[0] + dx, elbow[1] + dy, -1),
      new THREE.Vector3(0, 0, 1),
    );
    const hits = ray.intersectObject(elbowMesh);
    assert(
      hits.length >= 2,
      "Raised elbow silhouette has no severed-looking hole",
    );
    // In the reference pose the head lies in front of the elbow. Select the
    // entry/exit that bracket its actual depth, not the foreground head's pair.
    const entry = hits.filter((hit) => hit.point.z < elbow[2]).at(-1);
    const exit = hits.find((hit) => hit.point.z > elbow[2]);
    assert(
      entry && exit && exit.distance - entry.distance > 0.025,
      "Raised elbow retains volume through its bend",
    );
  }
elbowMaterial.dispose();
assert(
  metadata.bounds.min[1] > 0.94 && metadata.bounds.min[1] < 1,
  "Legs are removed below the waist for the tail join",
);
assert(
  metadata.bounds.max[1] < 1.56,
  "Raised hand stays inside the fountain silhouette",
);
assert(metadata.neck[1] > 1.25 && metadata.neck[1] < 1.31);
assert(
  metadata.headBase[1] > metadata.neck[1] &&
    metadata.headTop[1] > metadata.headBase[1],
);
assert(
  metadata.headTop[0] > metadata.neck[0],
  "Head leans toward the raised arm as in the reference",
);
assert(metadata.headTop[1] > 1.47 && metadata.headTop[1] < 1.51);
assert(
  metadata.wrists.L[1] > metadata.headTop[1],
  "Raised hand reaches over the crown",
);
assert(
  metadata.wrists.R[1] > 1.1 && metadata.wrists.R[1] < 1.15,
  "Lap hand rests above the raised tail knee",
);

const countNear = (point, radius) => {
  let count = 0;
  for (let i = 0; i < position.count; i++)
    if (distance(vertex(i), point) < radius) count++;
  return count;
};
assert(
  countNear(metadata.headBase, 0.09) > 2000,
  "Detailed face topology remains in the head",
);
for (const side of ["L", "R"])
  assert(
    countNear(metadata.wrists[side], 0.04) > 500,
    `${side} wrist and hand topology survived cropping`,
  );
assert(
  metadata.scalpBounds.max[1] >= metadata.headTop[1],
  "Fitted scalp reaches the crown",
);
assert(
  metadata.scalpBounds.min[1] > metadata.neck[1],
  "Scalp does not mistakenly contain arm or torso geometry",
);
assert(
  metadata.scalpBounds.max[0] - metadata.scalpBounds.min[0] < 0.17,
  "Scalp follows the actual head envelope",
);
for (const center of metadata.eyeCenters)
  assert(
    countNear(center, 0.025) > 50,
    "Each eyeball remains seated within detailed eyelid topology",
  );

const sources = path.join(root, "assets/models/sources/mermaid-anatomy");
const provenance = JSON.parse(
  fs.readFileSync(path.join(sources, "provenance.json"), "utf8"),
);
assert.equal(provenance.license, "CC0-1.0");
for (const { file, source, sha256 } of provenance.files) {
  assert(
    source.includes(provenance.revision),
    `${file} has a pinned upstream source`,
  );
  assert.equal(
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(sources, file)))
      .digest("hex"),
    sha256,
    `${file} matches provenance`,
  );
}
for (const file of ["default.mhskel", "default_weights.mhw"])
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(sources, file), "utf8")).license,
    "CC0",
  );

// Build into a private scratch directory: production assets stay untouched.
// Scaling every skin weight by the same amount must leave the posed mesh
// unchanged. This catches missing normalization and resulting joint drift.
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), "fountain-anatomy-check-"),
);
try {
  const scratchSources = path.join(
    scratch,
    "assets/models/sources/mermaid-anatomy",
  );
  fs.cpSync(sources, scratchSources, { recursive: true });
  const build = () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/build_fountain_anatomy.mjs")],
      { cwd: scratch, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return fs.readFileSync(
      path.join(scratch, "assets/models/mermaid-anatomy.json"),
      "utf8",
    );
  };
  const original = fs.readFileSync(
    path.join(root, "assets/models/mermaid-anatomy.json"),
    "utf8",
  );
  assert.equal(
    build(),
    original,
    "Pinned sources reproduce the committed anatomy byte for byte",
  );
  const weightFile = path.join(scratchSources, "default_weights.mhw");
  const weights = JSON.parse(fs.readFileSync(weightFile, "utf8"));
  for (const entries of Object.values(weights.weights))
    for (const pair of entries) pair[1] *= 2;
  fs.writeFileSync(weightFile, JSON.stringify(weights));
  assert.equal(build(), original, "Skin weights are normalized before posing");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
  for (const name of ["body", "eyes", "scalp"]) anatomy[name].dispose();
}
assert(
  fs.statSync(path.join(root, "assets/models/mermaid-anatomy.json")).size <
    20 * 1024 * 1024,
  "Portable anatomy payload remains bounded",
);
console.log(
  `PASS fountain anatomy: connected face/body/hands, fitted scalp/eyes, ${metadata.bodyTriangles} body triangles, max edge ${(longestEdge * 1000).toFixed(1)}mm, CC0 hashes, reproducible normalized skinning.`,
);
