import * as THREE from "three";
import anatomy from "../assets/models/mermaid-anatomy.json" with { type: "json" };

function geometry(data) {
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(data.position, 3),
  );
  result.setIndex(data.index);
  // Stone grain uses physical metres; sculptural facial detail is true geometry.
  const uv = [];
  for (let i = 0; i < data.position.length; i += 3)
    uv.push(data.position[i], data.position[i + 1]);
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Fresh owned geometries. The detailed face is continuous with the body. */
export function createFountainAnatomy() {
  return {
    body: geometry(anatomy.body),
    face: null,
    eyes: geometry(anatomy.eyes),
    scalp: geometry(anatomy.scalp),
    metadata: structuredClone(anatomy.metadata),
  };
}
