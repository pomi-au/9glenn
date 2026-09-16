import assert from "node:assert/strict";
import * as THREE from "three";
import { shapeOf } from "../model/build-model.js";

const outer = [
  [0, 0],
  [4000, 0],
  [4000, 3000],
  [0, 3000],
];
const inner = [
  [300, 300],
  [3700, 300],
  [3700, 2700],
  [300, 2700],
];
for (const reverseOuter of [false, true]) {
  for (const reverseInner of [false, true]) {
    const polygon = [
      reverseOuter ? outer.toReversed() : outer,
      reverseInner ? inner.toReversed() : inner,
    ];
    const original = JSON.stringify(polygon);
    const geometry = new THREE.ExtrudeGeometry(shapeOf(polygon), {
      depth: 2.4,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    assert.equal(
      JSON.stringify(polygon),
      original,
      "Source geometry is unchanged",
    );
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const origin = new THREE.Vector3(2, 1.2, 1.5);
    for (const [direction, distance] of [
      [[1, 0, 0], 1.7],
      [[-1, 0, 0], 1.7],
      [[0, 0, 1], 1.2],
      [[0, 0, -1], 1.2],
    ]) {
      const hit = new THREE.Raycaster(
        origin,
        new THREE.Vector3(...direction),
      ).intersectObject(mesh)[0];
      assert.ok(hit, "Interior face must be visible with front-face rendering");
      assert.ok(Math.abs(hit.distance - distance) < 1e-6);
    }
    const positions = geometry.attributes.position;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    let volume = 0;
    for (let index = 0; index < positions.count; index += 3) {
      a.fromBufferAttribute(positions, index);
      b.fromBufferAttribute(positions, index + 1);
      c.fromBufferAttribute(positions, index + 2);
      volume += a.dot(b.cross(c)) / 6;
    }
    assert.ok(
      Math.abs(volume - (4 * 3 - 3.4 * 2.4) * 2.4) < 1e-5,
      "Signed volume must exclude the room void",
    );
    geometry.dispose();
    mesh.material.dispose();
  }
}
console.log(
  "Wall faces: all four ring orientations pass interior raycasts and signed-volume checks.",
);
