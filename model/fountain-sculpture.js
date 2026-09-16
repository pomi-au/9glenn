import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

const V = (p) => new THREE.Vector3(...p);
const gaussian = (x, y, cx, cy, sx, sy) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

/** Anatomical elliptical loft: tapered sections follow a smooth sculpted spine. */
function loft(
  sections,
  {
    steps = 48,
    sides = 28,
    relief = null,
    smoothRadii = false,
    fixedUVWidth = null,
    transportedFrames = false,
  } = {},
) {
  const curve = new THREE.CatmullRomCurve3(
    sections.map((s) => V(s.slice(0, 3))),
  );
  const position = [],
    uv = [],
    index = [];
  const length = curve.getLength();
  let previousTangent = null,
    previousDepth = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      section = t * (sections.length - 1);
    const j = Math.min(sections.length - 2, Math.floor(section)),
      f = section - j;
    const radius = (axis) => {
      const value = (k) => {
        const s = sections[Math.max(0, Math.min(sections.length - 1, k))];
        return s[axis] ?? s[3];
      };
      const a = value(j),
        b = value(j + 1);
      if (!smoothRadii) return THREE.MathUtils.lerp(a, b, f);
      // C1-continuous profile removes stacked bands from shoulders and arms.
      const m0 = (b - value(j - 1)) * 0.5;
      const m1 = (value(j + 2) - a) * 0.5;
      return Math.max(
        0.001,
        (2 * f ** 3 - 3 * f * f + 1) * a +
          (f ** 3 - 2 * f * f + f) * m0 +
          (-2 * f ** 3 + 3 * f * f) * b +
          (f ** 3 - f * f) * m1,
      );
    };
    const rx = radius(3),
      rz = radius(4);
    const center = curve.getPoint(t),
      tangent = curve.getTangent(t).normalize();
    const depth =
      transportedFrames && previousDepth
        ? previousDepth
            .clone()
            .applyQuaternion(
              new THREE.Quaternion().setFromUnitVectors(
                previousTangent,
                tangent,
              ),
            )
        : Math.abs(tangent.z) < 0.92
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(0, 1, 0);
    depth.addScaledVector(tangent, -depth.dot(tangent)).normalize();
    const across = tangent.clone().cross(depth).normalize();
    previousDepth = depth;
    previousTangent = tangent;
    for (let k = 0; k <= sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      const offset = relief ? relief(t, angle) : 0;
      const crossSection = across
        .clone()
        .multiplyScalar(Math.cos(angle) * (rx + offset))
        .addScaledVector(depth, Math.sin(angle) * (rz + offset));
      const point = center.clone().add(crossSection);
      position.push(...point.toArray());
      uv.push((k / sides) * (fixedUVWidth ?? Math.PI * (rx + rz)), t * length);
      if (i < steps && k < sides) {
        const a = i * (sides + 1) + k,
          b = a + sides + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  for (const end of [0, steps]) {
    const centerIndex = position.length / 3;
    position.push(...curve.getPoint(end / steps).toArray());
    uv.push(0, (end / steps) * length);
    for (let k = 0; k < sides; k++) {
      const a = end * (sides + 1) + k;
      if (end === 0) index.push(centerIndex, a, a + 1);
      else index.push(centerIndex, a + 1, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  if (transportedFrames) {
    const normals = geometry.attributes.normal;
    for (let i = 0; i <= steps; i++) {
      const first = i * (sides + 1),
        last = first + sides;
      const normal = new THREE.Vector3()
        .fromBufferAttribute(normals, first)
        .add(new THREE.Vector3().fromBufferAttribute(normals, last))
        .normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
  }
  return geometry;
}

function parametric(rows, columns, point, { southPole = true } = {}) {
  const p = [],
    uv = [],
    indices = [];
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      p.push(...point(x / columns, y / rows));
      uv.push((x / columns) * 0.45, (y / rows) * 0.35);
      if (y < rows && x < columns) {
        const a = y * (columns + 1) + x,
          b = a + columns + 1;
        if (y > 0 || !southPole) indices.push(a, a + 1, b);
        if (y < rows - 1) indices.push(a + 1, b + 1, b);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

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
      const rib = 0.004 * Math.cos(angle * 18) * Math.min(1, radius / 0.25);
      const scallop =
        0.005 * Math.cos(angle * 18) * Math.max(0, (radius - 0.28) / 0.07);
      const front = Math.abs(
        Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI)),
      );
      // Lower the shell lip into a real pouring notch, fed by the basin water.
      const notch =
        0.043 *
        Math.exp(-((front / 0.075) ** 4)) *
        Math.max(0, (y - 0.425) / 0.069);
      p.push(
        (radius + rib) * Math.sin(angle),
        y + scallop - notch,
        (radius + rib) * Math.cos(angle),
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

function headSurface() {
  const frontZ = (x, y) => {
    const jaw = y < -0.025 ? 1 - 0.25 * Math.min(1, (-y - 0.025) / 0.08) : 1;
    let z =
      -0.067 *
      Math.sqrt(Math.max(0, 1 - (x / (0.073 * jaw)) ** 2 - (y / 0.108) ** 2));
    // Separate the nasal bridge, rounded tip and alar wings rather than one ridge.
    z -= 0.014 * gaussian(x, y, 0, 0.017, 0.0085, 0.029);
    z -= 0.02 * gaussian(x, y, 0, -0.006, 0.01, 0.009);
    z -= 0.0045 * gaussian(x, y, 0, -0.071, 0.023, 0.014);
    z += 0.0025 * gaussian(x, y, 0, -0.058, 0.021, 0.006); // Lower lip/chin sulcus.
    for (const sign of [-1, 1]) {
      z += 0.0055 * gaussian(x, y, sign * 0.027, 0.025, 0.019, 0.012);
      z -= 0.0035 * gaussian(x, y, sign * 0.027, 0.043, 0.024, 0.007);
      z -= 0.0065 * gaussian(x, y, sign * 0.04, 0.002, 0.021, 0.017);
      z += 0.0023 * gaussian(x, y, sign * 0.046, -0.031, 0.016, 0.022);
      z -= 0.006 * gaussian(x, y, sign * 0.01, -0.011, 0.006, 0.006);
      z += 0.0032 * gaussian(x, y, sign * 0.01, -0.015, 0.0032, 0.0028);
      z -= 0.0014 * gaussian(x, y, sign * 0.003, -0.025, 0.002, 0.008); // Philtrum ridges.
    }
    const smile = -0.041 + 0.0035 * (x / 0.022) ** 2;
    const bow =
      0.0018 * Math.cos((x / 0.008) * Math.PI) * Math.exp(-((x / 0.018) ** 2));
    z += 0.0026 * gaussian(x, y, 0, smile, 0.022, 0.0016);
    z -= 0.0038 * gaussian(x, y, 0, smile + 0.0035 - bow, 0.021, 0.0032);
    z -= 0.005 * gaussian(x, y, 0, smile - 0.0045, 0.019, 0.004);
    return z;
  };
  const geometry = parametric(96, 128, (u, v) => {
    const lat = (v - 0.5) * Math.PI,
      angle = u * Math.PI * 2,
      y = Math.sin(lat) * 0.108;
    const jaw = y < -0.025 ? 1 - 0.25 * Math.min(1, (-y - 0.025) / 0.08) : 1;
    const x = Math.sin(angle) * Math.cos(lat) * 0.073 * jaw;
    const z = Math.cos(angle) * Math.cos(lat) * 0.067;
    return [x, y, z < 0 ? frontZ(x, y) : z];
  });
  return { geometry, frontZ };
}

/** Classical seated mermaid, built as genuine three-dimensional bronze relief. */
export function createFountainSculpture(add, stone, bronze) {
  bronze ||= new THREE.MeshStandardMaterial({
    color: 0x537867,
    metalness: 0.68,
    roughness: 0.55,
  });
  const parts = [];
  function sculpture(geometry, name, material = bronze) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = add(geometry, material, name);
    mesh.userData.sculptureStyle = "Classical seated mermaid";
    parts.push(mesh);
    return mesh;
  }
  const foot = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.235, 0.15),
      new THREE.Vector2(0.25, 0.165),
      new THREE.Vector2(0.25, 0.19),
      new THREE.Vector2(0.225, 0.21),
      new THREE.Vector2(0.17, 0.225),
      new THREE.Vector2(0.145, 0.255),
    ],
    64,
  );
  sculpture(foot, "fountain pedestal", stone);
  sculpture(
    loft(
      [
        [0, 0.235, 0, 0.145, 0.145],
        [0, 0.29, 0, 0.12, 0.12],
        [0, 0.335, 0, 0.16, 0.16],
      ],
      { steps: 16, sides: 64 },
    ),
    "fountain basin stem",
  );
  sculpture(shellBasin(), "fountain scalloped shell basin");
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
  sculpture(lip, "fountain shell pouring lip");
  let rock = new THREE.IcosahedronGeometry(1, 4);
  const rockPosition = rock.attributes.position;
  for (let i = 0; i < rockPosition.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(rockPosition, i);
    const rough =
      1 +
      0.085 * Math.sin(point.x * 11 + point.y * 8) +
      0.05 * Math.sin(point.z * 17 - point.y * 12);
    rockPosition.setXYZ(
      i,
      0.02 + point.x * 0.17 * rough,
      0.665 + point.y * 0.205 * rough,
      0.065 + point.z * 0.135 * rough,
    );
  }
  // Weld shared positions before averaging normals: cast rock has rounded ridges.
  rock.deleteAttribute("normal");
  rock = mergeVertices(rock);
  rock.computeVertexNormals();
  sculpture(rock, "fountain mermaid rock seat");

  // The single bent tail reads as a raised knee, then a tapering fish tail.
  sculpture(
    loft(
      [
        [0.04, 0.9, 0.005, 0.105, 0.095],
        [-0.12, 0.93, -0.085, 0.077, 0.075],
        [-0.2, 0.84, -0.16, 0.038, 0.044],
        [-0.13, 0.745, -0.2, 0.05, 0.054],
        [0.005, 0.685, -0.215, 0.029, 0.039],
      ],
      {
        steps: 168,
        sides: 64,
        // Fourteen complete 48mm scale tiles close exactly at the tail seam.
        // Scale widths naturally taper with the body toward the fin.
        fixedUVWidth: 0.672,
        smoothRadii: true,
        transportedFrames: true,
      },
    ),
    "fountain mermaid scaled curled tail",
  );
  const fin = new THREE.Shape();
  fin.moveTo(0.005, 0.565);
  fin.bezierCurveTo(-0.05, 0.535, -0.18, 0.575, -0.25, 0.485);
  fin.bezierCurveTo(-0.225, 0.418, -0.085, 0.43, 0.005, 0.495);
  fin.bezierCurveTo(0.09, 0.43, 0.23, 0.421, 0.25, 0.483);
  fin.bezierCurveTo(0.18, 0.573, 0.06, 0.535, 0.005, 0.565);
  const finGeometry = new THREE.ExtrudeGeometry(fin, {
    depth: 0.014,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 3,
    curveSegments: 40,
    steps: 1,
  });
  const finPositions = finGeometry.attributes.position;
  for (let i = 0; i < finPositions.count; i++) {
    const x = finPositions.getX(i),
      y = finPositions.getY(i);
    const a = Math.atan2(x - 0.005, 0.57 - y),
      distance = Math.hypot(x - 0.005, 0.57 - y);
    finPositions.setZ(
      i,
      finPositions.getZ(i) -
        0.24 +
        0.0025 * Math.sin(a * 34) * Math.min(1, distance / 0.15),
    );
  }
  finGeometry.translate(0, 0.14, 0);
  finGeometry.computeVertexNormals();
  sculpture(finGeometry, "fountain mermaid lobed fluted fin");

  const torso = loft(
    [
      [0.04, 0.865, 0.012, 0.105, 0.073],
      [0.042, 0.93, 0.005, 0.086, 0.065],
      [0.035, 1.015, 0.01, 0.074, 0.059],
      [0.025, 1.085, 0.015, 0.099, 0.067],
      [0.014, 1.16, 0.025, 0.112, 0.069],
      [0.005, 1.205, 0.024, 0.138, 0.056],
      [0.001, 1.235, 0.022, 0.106, 0.049],
      [-0.003, 1.26, 0.016, 0.059, 0.041],
      [-0.007, 1.285, 0.008, 0.037, 0.035],
      [-0.013, 1.322, 0.001, 0.038, 0.037],
    ],
    { steps: 112, sides: 64, smoothRadii: true },
  );
  const torsoPositions = torso.attributes.position;
  for (let i = 0; i < torsoPositions.count; i++) {
    const x = torsoPositions.getX(i),
      y = torsoPositions.getY(i),
      z = torsoPositions.getZ(i);
    if (z < 0.01) {
      const bust =
        0.026 *
        (gaussian(x, y, -0.041, 1.125, 0.041, 0.041) +
          gaussian(x, y, 0.063, 1.13, 0.04, 0.041));
      const abdomen = 0.007 * gaussian(x, y, 0.035, 1.005, 0.055, 0.05);
      const clavicle =
        0.003 * gaussian(x, y, 0.002, 1.235 - 0.1 * Math.abs(x), 0.105, 0.007);
      const sternum = 0.0018 * gaussian(x, y, 0.015, 1.17, 0.012, 0.048);
      const navel = 0.0022 * gaussian(x, y, 0.036, 0.997, 0.006, 0.006);
      const frontWeight = THREE.MathUtils.smoothstep(0.01 - z, 0, 0.025);
      torsoPositions.setZ(
        i,
        z + frontWeight * (-bust - abdomen - clavicle + sternum + navel),
      );
    }
  }
  torso.computeVertexNormals();
  sculpture(torso, "fountain mermaid sculpted torso");
  sculpture(
    loft(
      [
        [-0.085, 1.203, 0.023, 0.047, 0.041],
        [-0.132, 1.245, 0.028, 0.042, 0.039],
        [-0.2, 1.32, 0.046, 0.036, 0.034],
        [-0.237, 1.4, 0.04, 0.031, 0.03],
        [-0.17, 1.476, 0.012, 0.026, 0.024],
        [-0.08, 1.514, -0.021, 0.02, 0.018],
        [-0.035, 1.505, -0.04, 0.018, 0.014],
      ],
      { steps: 76, sides: 28, smoothRadii: true },
    ),
    "fountain mermaid raised arm",
  );
  sculpture(
    loft(
      [
        [0.088, 1.201, 0.024, 0.048, 0.041],
        [0.128, 1.177, 0.021, 0.041, 0.038],
        [0.153, 1.118, 0.009, 0.036, 0.034],
        [0.147, 1.028, -0.038, 0.03, 0.029],
        [0.075, 0.987, -0.087, 0.027, 0.025],
        [-0.035, 0.978, -0.115, 0.023, 0.02],
        [-0.132, 0.973, -0.137, 0.019, 0.016],
      ],
      { steps: 68, sides: 28, smoothRadii: true },
    ),
    "fountain mermaid arm across lap",
  );

  const handParts = [];
  handParts.push(
    loft(
      [
        [-0.128, 0.973, -0.137, 0.022, 0.014],
        [-0.172, 0.967, -0.151, 0.028, 0.012],
        [-0.207, 0.96, -0.153, 0.019, 0.01],
      ],
      { steps: 18, sides: 16 },
    ),
  );
  for (let finger = 0; finger < 4; finger++) {
    const offset = (finger - 1.5) * 0.012;
    handParts.push(
      loft(
        [
          [-0.188, 0.963 + offset, -0.153, 0.005, 0.005],
          [-0.218, 0.954 + offset, -0.156, 0.0045, 0.0045],
          [-0.23, 0.942 + offset, -0.146, 0.003, 0.003],
        ],
        { steps: 16, sides: 10 },
      ),
    );
  }
  handParts.push(
    loft(
      [
        [-0.155, 0.988, -0.15, 0.008, 0.006],
        [-0.189, 1.0, -0.163, 0.006, 0.005],
        [-0.201, 0.983, -0.169, 0.004, 0.004],
      ],
      { steps: 16, sides: 10 },
    ),
  );
  handParts.push(
    loft(
      [
        [-0.039, 1.504, -0.04, 0.022, 0.013],
        [-0.008, 1.488, -0.052, 0.026, 0.011],
        [0.017, 1.47, -0.058, 0.02, 0.009],
      ],
      { steps: 20, sides: 16 },
    ),
  );
  for (let finger = 0; finger < 4; finger++) {
    const offset = (finger - 1.5) * 0.012;
    handParts.push(
      loft(
        [
          [0.008 + offset, 1.483, -0.057, 0.0045, 0.0045],
          [0.025 + offset, 1.45, -0.062, 0.004, 0.004],
          [0.027 + offset, 1.425, -0.056, 0.0027, 0.0027],
        ],
        { steps: 18, sides: 10 },
      ),
    );
  }
  sculpture(
    mergeGeometries(handParts),
    "fountain mermaid carved hands and fingers",
  );

  const headMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.023, 1.365, -0.014),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.055, 0.1, 0.24)),
    new THREE.Vector3(1, 1, 1),
  );
  const { geometry: head, frontZ } = headSurface();
  head.applyMatrix4(headMatrix);
  sculpture(head, "fountain mermaid face with carved eyes nose and lips");
  const faceParts = [];
  for (const sign of [-1, 1]) {
    const cx = sign * 0.027;
    for (const upper of [true, false]) {
      const sections = [];
      for (let i = 0; i < 7; i++) {
        const x = cx + (i / 6 - 0.5) * 0.027,
          y = 0.025 + (upper ? 0.0045 : -0.003) * Math.sin((i / 6) * Math.PI);
        sections.push([x, y, frontZ(x, y) - 0.0015, 0.0016, 0.0013]);
      }
      faceParts.push(
        loft(sections, { steps: 24, sides: 8 }).applyMatrix4(headMatrix),
      );
    }
    const iris = new THREE.SphereGeometry(0.0027, 12, 8);
    iris.scale(1, 0.8, 0.5);
    iris.translate(cx, 0.025, frontZ(cx, 0.025) - 0.0016);
    iris.applyMatrix4(headMatrix);
    faceParts.push(iris);
  }
  sculpture(mergeGeometries(faceParts), "fountain mermaid eyelids and eyes");
  const hairCap = parametric(
    44,
    96,
    (u, v) => {
      const angle = u * Math.PI * 2;
      const lower = -0.015 + 0.071 * -Math.cos(angle);
      const start = Math.asin(lower / 0.113);
      const latitude = start + v * (Math.PI / 2 - start);
      const groove =
        0.0015 * Math.sin(angle * 32 + v * 7) * Math.sin(Math.PI * v);
      return [
        Math.sin(angle) * Math.cos(latitude) * (0.076 + groove),
        Math.sin(latitude) * 0.113,
        Math.cos(angle) * Math.cos(latitude) * (0.071 + groove),
      ];
    },
    { southPole: false },
  );
  hairCap.applyMatrix4(headMatrix);
  sculpture(hairCap, "fountain mermaid grooved hair crown");

  const hairParts = [];
  // Wavy locks overlap as a continuous mass, with individually carved grooves.
  for (let strand = 0; strand < 30; strand++) {
    const side = strand < 18 ? -1 : 1,
      k = (strand % (side < 0 ? 18 : 12)) / (side < 0 ? 17 : 11);
    const rootX = -0.025 + side * (0.01 + 0.04 * k);
    const front = -0.035 + 0.095 * k;
    const length = 0.26 + 0.13 * (0.5 + 0.5 * Math.sin(strand * 1.73));
    const endY = 1.39 - length;
    const radius = 0.007 + 0.004 * (0.5 + 0.5 * Math.sin(strand * 2.4));
    hairParts.push(
      loft(
        [
          [rootX, 1.465 - 0.018 * k, 0.008 + 0.02 * k, radius, 0.01],
          [-0.025 + side * 0.07, 1.407, front, radius, 0.011],
          [
            -0.02 + side * (0.082 + 0.015 * Math.sin(strand)),
            1.315,
            front - 0.008,
            radius * 0.95,
            0.01,
          ],
          [
            side * (0.09 + 0.022 * Math.sin(strand * 0.65)),
            1.23,
            front - 0.025,
            radius * 0.9,
            0.009,
          ],
          [
            side * (0.074 + 0.02 * Math.cos(strand)),
            endY,
            front - 0.028,
            0.0018,
            0.002,
          ],
        ],
        { steps: 52, sides: 10 },
      ),
    );
  }
  sculpture(mergeGeometries(hairParts), "fountain mermaid flowing carved hair");
  return {
    nozzle: new THREE.Vector3(0, 0.457, -0.388),
    velocity: new THREE.Vector3(0, -0.06, -1.8),
    basinWater: { center: new THREE.Vector3(0, 0.454, 0), radius: 0.306 },
    parts,
  };
}
