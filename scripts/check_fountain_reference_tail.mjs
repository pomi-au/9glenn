import assert from "node:assert/strict";
import * as THREE from "three";
import { createReferenceTail } from "../model/fountain-reference-tail.js";
const parts = createReferenceTail();
let triangles = 0;
for (const [name, geometry] of Object.entries(parts)) {
  const position = geometry.attributes.position,
    index = geometry.index,
    normals = geometry.attributes.normal;
  const count = index?.count ?? position.count;
  triangles += count / 3;
  for (const attribute of Object.values(geometry.attributes))
    assert(
      Array.from(attribute.array).every(Number.isFinite),
      `${name} finite attributes`,
    );
  const key = (i) =>
    [position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => Math.round(v * 1e6))
      .join(",");
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    const vertices = ids.map((j) =>
      new THREE.Vector3().fromBufferAttribute(position, j),
    );
    const [a, b, c] = vertices;
    const keys = ids.map(key);
    assert.equal(new Set(keys).size, 3, `${name} has no collapsed triangles`);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const edge = [keys[j], keys[(j + 1) % 3]].sort().join("/");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert(volume > 0, `${name} outward signed volume`);
  assert(
    [...edges.values()].every((count) => count === 2),
    `${name} is a closed manifold after UV seam welding`,
  );
  for (let i = 0; i < normals.count; i++) {
    const length = Math.hypot(
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i),
    );
    assert(Math.abs(length - 1) < 1e-5, `${name} has unit shading normals`);
  }
}
assert(
  triangles > 30000 && triangles < 50000,
  `Bounded detailed geometry: ${triangles}`,
);
assert(
  parts.fin.boundingBox.min.y > 0.62 && parts.fin.boundingBox.min.y < 0.635,
);
assert(parts.fin.boundingBox.max.x - parts.fin.boundingBox.min.x > 0.35);
assert(
  parts.fin.boundingBox.max.z - parts.fin.boundingBox.min.z > 0.035,
  "Fin has curved volume, not a flat cutout",
);
assert(
  parts.rock.boundingBox.min.y > 0.6 && parts.rock.boundingBox.max.y < 0.99,
);
const tail = new THREE.Mesh(parts.tail, new THREE.MeshStandardMaterial());
assert(
  parts.fin.boundingBox.max.y - parts.fin.boundingBox.min.y > 0.17,
  "Reference fin drapes vertically instead of a shallow horizontal wing",
);
for (const x of [-0.06, 0.025, 0.11]) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 0.954, -1),
    new THREE.Vector3(0, 0, 1),
  );
  assert(
    ray.intersectObject(tail).length > 0,
    "Seated hip volume closes the anatomical waist cut",
  );
}

for (const [x, y] of [
  [0.12, 1.015],
  [0.12, 0.92],
  [0.055, 0.81],
  [0.02, 0.79],
]) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, y, -1),
    new THREE.Vector3(0, 0, 1),
  );
  assert(
    ray.intersectObject(tail).length > 0,
    `Reference descending tail silhouette at ${x},${y}`,
  );
}
console.log(
  `PASS reference tail: ${triangles} triangles; closed outward solids, raised knee/descending tail, draped volumetric fin, layered rock and finite metre UVs`,
);
