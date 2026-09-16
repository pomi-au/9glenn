import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { separateSlabUnderside } from "../model/slab-finish.js";

const shape = new THREE.Shape();
shape.moveTo(0, 0);
shape.lineTo(2, 0);
shape.lineTo(2, 2);
shape.lineTo(0, 2);
shape.closePath();
const hole = new THREE.Path();
hole.moveTo(0.8, 0.8);
hole.lineTo(0.8, 1.2);
hole.lineTo(1.2, 1.2);
hole.lineTo(1.2, 0.8);
hole.closePath();
shape.holes.push(hole);
for (const indexed of [false, true]) {
  let geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.172,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  if (indexed) geometry = mergeVertices(geometry);
  const snapshots = Object.fromEntries(
    Object.entries(geometry.attributes).map(([k, v]) => [
      k,
      Array.from(v.array),
    ]),
  );
  const indices = geometry.index && Array.from(geometry.index.array);
  separateSlabUnderside(geometry, 2);
  for (const [k, values] of Object.entries(snapshots))
    assert.deepEqual(
      Array.from(geometry.attributes[k].array),
      values,
      `${k} unchanged`,
    );
  assert.deepEqual(
    geometry.index && Array.from(geometry.index.array),
    indices,
    "Triangle indices unchanged",
  );
  const total = geometry.index?.count || geometry.attributes.position.count,
    coverage = new Uint8Array(total),
    counts = [0, 0, 0];
  for (const group of geometry.groups) {
    assert.equal(group.start % 3, 0);
    assert.equal(group.count % 3, 0);
    for (let n = group.start; n < group.start + group.count; n++) coverage[n]++;
    for (let n = group.start; n < group.start + group.count; n += 3) {
      const v = geometry.index?.getX(n) ?? n,
        normalY = geometry.attributes.normal.getY(v),
        expected = normalY < -0.5 ? 2 : normalY > 0.5 ? 0 : 1;
      assert.equal(
        group.materialIndex,
        expected,
        "Only upward cap gets new cement; underside and side keep original materials",
      );
      counts[expected]++;
    }
  }
  assert(
    coverage.every((v) => v === 1),
    "Every triangle covered exactly once",
  );
  assert(counts.every((n) => n > 0));
  const groups = structuredClone(geometry.groups);
  separateSlabUnderside(geometry, 2);
  assert.deepEqual(geometry.groups, groups, "Routing is idempotent");
  const mesh = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
  ]);
  mesh.updateMatrixWorld(true);
  for (const [origin, direction, index] of [
    [[0.3, 1, -0.3], [0, -1, 0], 0],
    [[0.3, -1, -0.3], [0, 1, 0], 2],
    [[-1, 0.08, -0.3], [1, 0, 0], 1],
  ]) {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(...origin),
      new THREE.Vector3(...direction),
    ).intersectObject(mesh)[0];
    assert(hit);
    assert.equal(hit.face.materialIndex, index);
  }
  assert.equal(
    new THREE.Raycaster(
      new THREE.Vector3(1, 1, -1),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh).length,
    0,
    "Structural opening stays open",
  );
  geometry.dispose();
  mesh.material.forEach((m) => m.dispose());
}
console.log(
  "PASS slab cap routing: indexed/nonindexed extrusion, exact geometry/UV preservation, upward cement, original underside/sides and open void",
);
