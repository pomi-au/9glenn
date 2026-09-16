import assert from "node:assert/strict";
import * as THREE from "three";
import { roofSkin, roofTileMaps } from "../model/roof-mesh.js";

const materials = Object.fromEntries(
  ["roof", "roofCap", "fascia", "roofInfill"].map((key) => [
    key,
    new THREE.MeshStandardMaterial(),
  ]),
);
for (const outline of [
  [
    [0, 0],
    [10000, 0],
    [10000, 6000],
    [0, 6000],
  ],
  [
    [0, 0],
    [6000, 0],
    [6000, 10000],
    [0, 10000],
  ],
  [
    [0, 0],
    [6000, 0],
    [6000, 6000],
    [0, 6000],
  ],
]) {
  const original = JSON.stringify(outline);
  const group = new THREE.Group();
  roofSkin(
    group,
    outline,
    3000,
    25,
    "Test roof",
    materials,
    (mesh, info) => {
      mesh.userData = info;
    },
    160,
  );
  assert.equal(JSON.stringify(outline), original);
  const faces = group.children.filter(
    (mesh) => mesh.material === materials.roof,
  );
  assert.equal(faces.length, 4);
  let projectedArea = 0;
  for (const mesh of faces) {
    const { position, normal, uv } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      assert.ok(normal.getY(i) > 0, "Roof faces must face upward");
      assert.ok(
        Math.abs(normal.getY(i) - Math.cos((25 * Math.PI) / 180)) < 1e-5,
        "All slopes retain the recorded pitch",
      );
      assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)));
    }
    for (let i = 0; i < position.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i);
      const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
      projectedArea += b.sub(a).cross(c.sub(a)).y / 2;
    }
  }
  const width = Math.max(...outline.map((p) => p[0])) / 1000 + 0.32;
  const depth = Math.max(...outline.map((p) => p[1])) / 1000 + 0.32;
  assert.ok(
    Math.abs(projectedArea - width * depth) < 1e-4,
    "Roof faces cover the footprint without gaps or overlap",
  );
  const caps = group.children.find((mesh) => mesh.isInstancedMesh);
  assert.ok(caps?.count > 0);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < caps.count; i++) {
    caps.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
    assert.ok(matrix.determinant() > 0, "Cap scales remain positive");
  }
}
const maps = roofTileMaps();
assert.equal(maps.map.wrapS, THREE.RepeatWrapping);
assert.equal(maps.bumpMap.colorSpace, THREE.NoColorSpace);
assert.ok(
  maps.map.generateMipmaps,
  "Roof pattern must filter correctly at a distance",
);
console.log(
  "PASS roof coverage, outward normals, pitch, square/long hip caps, unchanged footprints and offline tile maps",
);
