import * as THREE from "three";
import { createFountainAnatomy } from "./fountain-anatomy.js";
import { createReferenceTail } from "./fountain-reference-tail.js";
import { createFountainHair } from "./fountain-hair.js";

function shellBasin() {
  // Continuous solid cross-section includes the inside, rolled rim and bottom.
  const profile = [
    [0.003, 0.335],
    [0.1, 0.327],
    [0.15, 0.319],
    [0.225, 0.354],
    [0.3, 0.409],
    [0.347, 0.476],
    [0.35, 0.491],
    [0.337, 0.494],
    [0.325, 0.479],
    [0.31, 0.447],
    [0.275, 0.41],
    [0.22, 0.385],
    [0.12, 0.367],
    [0.003, 0.36],
  ];
  const p = [],
    uv = [],
    indices = [],
    segments = 144;
  for (let j = 0; j < profile.length; j++)
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const [radius, y] = profile[j];
      const rib = 0.007 * Math.cos(angle * 12) * Math.min(1, radius / 0.25);
      const scallop =
        0.011 * Math.cos(angle * 12) * Math.max(0, (radius - 0.28) / 0.07);
      const front = Math.abs(
        Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI)),
      );
      // Lower the shell lip into a real pouring notch, fed by the basin water.
      const notch =
        0.043 *
        Math.exp(-((front / 0.075) ** 4)) *
        Math.max(0, (y - 0.425) / 0.069);
      p.push(
        (radius + rib) * Math.sin(angle) * 1.3,
        0.15 + (y + scallop - notch - 0.15) * 1.35,
        (radius + rib) * Math.cos(angle) * 1.3,
      );
      uv.push(
        (i / segments) * 2 * Math.PI * 0.35,
        (j / (profile.length - 1)) * 0.35,
      );
      if (j < profile.length - 1 && i < segments) {
        const a = j * (segments + 1) + i,
          b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  // Join the tiny center rings so the bowl is a closed bronze volume.
  for (let i = 0; i < segments; i++) {
    const a = i,
      b = (profile.length - 1) * (segments + 1) + i;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Reconstructed from the user's seated mermaid reference; unseen sides inferred. */
export function createFountainSculpture(add, stone, bronze) {
  bronze ||= new THREE.MeshStandardMaterial({
    color: 0x537867,
    metalness: 0.42,
    roughness: 0.55,
  });
  const parts = [];
  function sculpture(geometry, name, material = bronze) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = add(geometry, material, name);
    mesh.userData.sculptureStyle =
      "Reference seated mermaid with anatomical mesh";
    parts.push(mesh);
    return mesh;
  }
  const pedestal = new THREE.LatheGeometry(
    [
      [0.245, 0.15],
      [0.258, 0.165],
      [0.258, 0.19],
      [0.245, 0.205],
      [0.2, 0.22],
      [0.18, 0.25],
      [0.18, 0.29],
      [0.2, 0.335],
      [0.23, 0.425],
    ].map((p) => new THREE.Vector2(...p)),
    96,
  );
  sculpture(pedestal, "fountain pedestal");
  sculpture(shellBasin(), "fountain scalloped shell basin");
  // An open, water-filled channel at the scalloped front edge.
  const trough = new THREE.Shape();
  trough.moveTo(-0.029, 0.47);
  trough.lineTo(-0.029, 0.437);
  trough.lineTo(0.029, 0.437);
  trough.lineTo(0.029, 0.47);
  trough.lineTo(0.021, 0.47);
  trough.lineTo(0.021, 0.447);
  trough.lineTo(-0.021, 0.447);
  trough.lineTo(-0.021, 0.47);
  trough.closePath();
  const lip = new THREE.ExtrudeGeometry(trough, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSize: 0.0015,
    bevelThickness: 0.0015,
    bevelSegments: 2,
    steps: 1,
  });
  lip.translate(0, 0, -0.386);
  lip.scale(1.3, 1.35, 1.3);
  lip.translate(0, -0.0525, 0);
  sculpture(lip, "fountain shell pouring lip");

  const plinth = new THREE.LatheGeometry(
    [
      [0.002, 0.424],
      [0.17, 0.424],
      [0.2, 0.46],
      [0.218, 0.575],
      [0.23, 0.582],
      [0.248, 0.592],
      [0.25, 0.61],
      [0.241, 0.627],
      [0.002, 0.627],
    ].map((p) => new THREE.Vector2(...p)),
    96,
  );
  sculpture(plinth, "fountain sculpture circular plinth");
  const { tail, fin, rock } = createReferenceTail();
  sculpture(rock, "fountain mermaid rock seat");
  sculpture(tail, "fountain mermaid scaled curled tail");
  sculpture(fin, "fountain mermaid lobed fluted fin");
  const anatomy = createFountainAnatomy();
  sculpture(
    anatomy.body,
    "fountain mermaid sculpted torso, raised arm, arm across lap, carved hands and fingers, face with eyes nose and lips",
  );
  sculpture(anatomy.eyes, "fountain mermaid eyelids and eyes");
  const hair = createFountainHair(anatomy.scalp);
  sculpture(hair.crown, "fountain mermaid grooved hair crown");
  sculpture(hair.locks, "fountain mermaid flowing carved hair");
  return {
    nozzle: new THREE.Vector3(0, 0.56445, -0.5044),
    velocity: new THREE.Vector3(0, -0.06, -1.8),
    basinWater: { center: new THREE.Vector3(0, 0.5604, 0), radius: 0.3978 },
    parts,
  };
}
