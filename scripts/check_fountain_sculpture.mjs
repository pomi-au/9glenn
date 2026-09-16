import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createFountainSculpture } from "../model/fountain-sculpture.js";
import { flightTime, ballisticPoint } from "../model/fountain-flow.js";

const root = new THREE.Group();
const bronze = new THREE.MeshStandardMaterial({
  metalness: 0.42,
  roughness: 0.65,
});
const sculpture = createFountainSculpture(
  (geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  },
  new THREE.MeshStandardMaterial(),
  bronze,
);
root.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(root);
assert(bounds.min.y >= 0.149 && bounds.max.y > 1.49 && bounds.max.y < 1.57);
assert(
  bounds.max.x - bounds.min.x > 0.9 && bounds.max.x - bounds.min.x < 0.95,
  "The reference shell basin is approximately 0.91m wide",
);
assert(bounds.min.z > -0.51 && bounds.max.z < 0.48);
assert(
  sculpture.nozzle.z < bounds.min.z,
  "Stream starts beyond the actual open bronze lip",
);
assert.equal(sculpture.nozzle.z, -0.5044);
assert(Math.abs(sculpture.nozzle.y - sculpture.basinWater.center.y) < 0.01);
assert(
  sculpture.basinWater.radius > 0.39 && sculpture.basinWater.radius < 0.405,
);
assert.deepEqual(sculpture.velocity.toArray(), [0, -0.06, -1.8]);
let triangles = 0;
for (const mesh of root.children) {
  assert.equal(
    mesh.material,
    bronze,
    "Pedestal, shell and figure share supplied bronze before region routing",
  );
  triangles +=
    (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  for (const name of ["position", "normal", "uv"])
    assert(
      Array.from(mesh.geometry.attributes[name].array).every(Number.isFinite),
      `${mesh.name} finite ${name}`,
    );
}
assert(
  triangles > 120000 && triangles < 220000,
  `Bounded detailed anatomy and hair: ${triangles}`,
);
assert(
  root.children.length <= 12,
  "Continuous anatomical body and merged hair keep draw counts bounded",
);
const find = (phrase) =>
  root.children.find((mesh) => mesh.name.includes(phrase));
for (const phrase of [
  "scaled curled tail",
  "lobed fluted fin",
  "rock seat",
  "sculpted torso",
  "raised arm",
  "arm across lap",
  "hands and fingers",
  "eyes nose and lips",
  "eyelids and eyes",
  "grooved hair crown",
  "flowing carved hair",
  "scalloped shell basin",
])
  assert(find(phrase), `Reference component present: ${phrase}`);
const body = find("sculpted torso");
for (const phrase of [
  "raised arm",
  "arm across lap",
  "hands and fingers",
  "eyes nose and lips",
])
  assert.equal(
    find(phrase),
    body,
    "Face, hands and arms are in the continuous anatomical body",
  );
assert(
  body.geometry.attributes.position.count > 30000,
  "Actual anatomical mesh replaces primitive body proxies",
);
const fin = find("lobed fluted fin");
assert(
  fin.geometry.boundingBox.min.y > 0.62 &&
    fin.geometry.boundingBox.min.y < 0.64,
);
assert(fin.geometry.boundingBox.max.x - fin.geometry.boundingBox.min.x > 0.35);
assert(
  fin.geometry.boundingBox.max.z - fin.geometry.boundingBox.min.z > 0.035,
  "Draped fin retains actual volume",
);
const bowl = find("scalloped shell basin"),
  p = bowl.geometry.attributes.position,
  index = bowl.geometry.index;
let volume = 0;
for (let i = 0; i < index.count; i += 3) {
  const [a, b, c] = [0, 1, 2].map((j) =>
    new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)),
  );
  volume += a.dot(b.cross(c)) / 6;
}
assert(volume > 0, "The scaled shell remains outward wound");
const pedestal = find("fountain pedestal"),
  plinth = find("circular plinth");
assert(
  plinth,
  "Reference figure has its central supporting drum and circular plinth",
);
assert(
  pedestal.geometry.boundingBox.max.y > bowl.geometry.boundingBox.min.y,
  "Outer pedestal overlaps the shell base instead of leaving a floating bowl",
);
assert(
  plinth.geometry.boundingBox.min.y < 0.435 &&
    plinth.geometry.boundingBox.max.y > 0.62,
  "Central drum rises from the basin floor to the rock seat",
);
for (const height of [0.45, 0.5, 0.57]) {
  const supportRay = new THREE.Raycaster(
    new THREE.Vector3(0, height, -0.3),
    new THREE.Vector3(0, 0, 1),
    0,
    0.6,
  );
  assert(
    supportRay.intersectObject(plinth).length > 0,
    "Visible support closes the gap beneath the circular plinth",
  );
}

const channel = new THREE.Raycaster(
  new THREE.Vector3(0, sculpture.nozzle.y, -0.57),
  new THREE.Vector3(0, 0, 1),
  0,
  0.17,
);
assert.equal(
  channel.intersectObject(find("pouring lip")).length,
  0,
  "Raised, enlarged lip retains an open pouring channel",
);

// Actual posed eye positions detect a fringe accidentally drawn across the face.
const metadata = JSON.parse(
  fs.readFileSync(
    new URL("../assets/models/mermaid-anatomy.json", import.meta.url),
  ),
).metadata;
for (const eye of metadata.eyeCenters) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(eye[0], eye[1], -1),
    new THREE.Vector3(0, 0, 1),
  );
  const nearest = ray.intersectObjects(root.children)[0];
  assert(
    nearest && nearest.object === find("eyelids and eyes"),
    "Both anatomical eyes remain visible from the reference front",
  );
}

// Verify the changed spout still falls inside the real pool source footprint.
const drawings = JSON.parse(
  fs.readFileSync(new URL("../assets/drawing-data.json", import.meta.url)),
);
const plan = drawings.find((d) => d.id === "ground");
const poolParts = {};
function visit(node) {
  const part = node.attributes?.["data-pool-part"];
  if (part)
    poolParts[part] = node.attributes.points
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number));
  for (const child of node.children || []) visit(child);
}
visit(plan.vector);
const origin = poolParts.fountain.reduce(
  (sum, p) => [
    sum[0] + p[0] / poolParts.fountain.length / 1000,
    sum[1] + p[1] / poolParts.fountain.length / 1000,
  ],
  [0, 0],
);
const spec = JSON.parse(
  fs.readFileSync(new URL("../assets/building-spec.json", import.meta.url)),
);
const surface = -spec.pool.waterDrop / 1000;
const duration = flightTime(sculpture.nozzle.y, sculpture.velocity.y, surface);
const hit = ballisticPoint(sculpture.nozzle, sculpture.velocity, duration);
assert(Math.abs(hit.y - surface) < 1e-10);
const impact = [(origin[0] + hit.x) * 1000, (origin[1] + hit.z) * 1000];
const inside = (point, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    if (
      ring[i][1] > point[1] !== ring[j][1] > point[1] &&
      point[0] <
        ((ring[j][0] - ring[i][0]) * (point[1] - ring[i][1])) /
          (ring[j][1] - ring[i][1]) +
          ring[i][0]
    )
      result = !result;
  return result;
};
assert(
  inside(impact, poolParts.water),
  "The enlarged fountain stream hits actual pool water",
);
assert(
  !inside(impact, poolParts.fountain),
  "Impact clears the fountain pedestal",
);
console.log(
  `PASS reference mermaid: ${root.children.length} parts, ${triangles} triangles, continuous anatomy, visible eyes, broad shell, open outlet and actual pool impact at ${impact.map((v) => (v / 1000).toFixed(3)).join(", ")}m`,
);
