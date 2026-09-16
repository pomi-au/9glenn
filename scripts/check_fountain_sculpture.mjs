import assert from "node:assert/strict";
import * as THREE from "three";
import { createFountainSculpture } from "../model/fountain-sculpture.js";
const root = new THREE.Group();
const stone = new THREE.MeshStandardMaterial();
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
  stone,
  bronze,
);
const bounds = new THREE.Box3().setFromObject(root);
assert(bounds.min.y >= 0.149 && bounds.max.y > 1.49 && bounds.max.y < 1.57);
assert(bounds.max.x - bounds.min.x <= 0.72);
assert(bounds.min.z >= -0.4 && bounds.max.z <= 0.37);
assert(
  sculpture.nozzle.z < bounds.min.z,
  "Stream starts beyond the bronze lip",
);
assert(Math.abs(sculpture.nozzle.y - sculpture.basinWater.center.y) < 0.01);
assert.equal(sculpture.velocity.z, -1.8);
assert(
  sculpture.basinWater.radius > 0.29 && sculpture.basinWater.radius < 0.32,
);
let triangles = 0;
for (const mesh of root.children) {
  assert.equal(
    mesh.material,
    mesh.name === "fountain pedestal" ? stone : bronze,
    "All sculpture parts use supplied green-bronze finish",
  );
  const geometry = mesh.geometry;
  triangles +=
    (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  for (const attribute of ["position", "normal", "uv"])
    assert(
      Array.from(geometry.attributes[attribute].array).every(Number.isFinite),
      `${mesh.name} has finite ${attribute}`,
    );
}
assert(
  triangles > 70000 && triangles < 150000,
  `Bounded detailed sculpture budget: ${triangles}`,
);
assert(
  root.children.length < 25,
  "Merge small facial/hair/finger details into a few meshes",
);
for (const phrase of [
  "scaled curled tail",
  "lobed fluted fin",
  "sculpted torso",
  "raised arm",
  "arm across lap",
  "carved hands",
  "eyes nose and lips",
  "eyelids and eyes",
  "grooved hair crown",
  "flowing carved hair",
  "rock seat",
  "scalloped shell basin",
])
  assert(
    root.children.some((mesh) => mesh.name.includes(phrase)),
    `Required sculptural feature: ${phrase}`,
  );
// The tapered tail must remain an outward sweep, not fold back through itself
// at the knee. Also weld the shading normals across its duplicated UV seam.
const tail = root.children.find((mesh) =>
  mesh.name.includes("scaled curled tail"),
);
const tailPositions = tail.geometry.attributes.position;
const tailNormals = tail.geometry.attributes.normal;
const centers = [];
for (let row = 0; row <= 168; row++) {
  const center = new THREE.Vector3();
  for (let column = 0; column < 64; column++)
    center.add(
      new THREE.Vector3().fromBufferAttribute(tailPositions, row * 65 + column),
    );
  centers.push(center.multiplyScalar(1 / 64));
  for (let axis = 0; axis < 3; axis++)
    assert.equal(
      tailNormals.getComponent(row * 65, axis),
      tailNormals.getComponent(row * 65 + 64, axis),
      "Tail seam normals agree",
    );
}
for (let row = 0; row < 168; row++)
  for (let column = 0; column < 64; column++) {
    const corner = row * 65 + column;
    for (const [indices, blend] of [
      [[corner, corner + 65, corner + 1], 1 / 3],
      [[corner + 1, corner + 65, corner + 66], 2 / 3],
    ]) {
      const [a, b, c] = indices.map((index) =>
        new THREE.Vector3().fromBufferAttribute(tailPositions, index),
      );
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const radial = a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3)
        .sub(centers[row].clone().lerp(centers[row + 1], blend))
        .normalize();
      assert(
        normal.dot(radial) > 0,
        "Tail side triangles do not fold inward at the bend",
      );
    }
  }
const fin = root.children.find((mesh) =>
  mesh.name.includes("lobed fluted fin"),
);
assert(
  fin.geometry.boundingBox.min.y > 0.55,
  "Broad fin remains visibly above the shell basin",
);
assert(fin.geometry.boundingBox.max.x - fin.geometry.boundingBox.min.x > 0.45);
const bowl = root.children.find((mesh) =>
  mesh.name.includes("scalloped shell basin"),
);
const position = bowl.geometry.attributes.position,
  index = bowl.geometry.index;
let volume = 0;
const a = new THREE.Vector3(),
  b = new THREE.Vector3(),
  c = new THREE.Vector3();
for (let i = 0; i < index.count; i += 3) {
  a.fromBufferAttribute(position, index.getX(i));
  b.fromBufferAttribute(position, index.getX(i + 1));
  c.fromBufferAttribute(position, index.getX(i + 2));
  volume += a.dot(b.cross(c)) / 6;
}
assert(volume > 0, "The bronze shell is outward wound");
const ray = new THREE.Raycaster(
  new THREE.Vector3(0, sculpture.nozzle.y, -0.42),
  new THREE.Vector3(0, 0, 1),
  0,
  0.1,
);
const lip = root.children.find((mesh) => mesh.name.includes("pouring lip"));
assert.equal(
  ray.intersectObject(lip).length,
  0,
  "The pouring channel is open, not a solid black-sticker spout",
);
console.log(
  `PASS mermaid sculpture: ${root.children.length} merged parts, ${triangles} triangles, detailed face/hair/pose, raised broad fin, outward shell and open water outlet`,
);
