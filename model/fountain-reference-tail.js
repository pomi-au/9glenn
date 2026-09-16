import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function geometryOf(position, index, uv) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (index) geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function referenceTail() {
  // An implicit, overlapping solid avoids inverted inner sweep triangles at the
  // sharply bent knee. Surface detail comes from the separate scale normal map.
  const points = [
    [0.035, 0.99, 0.035, 0.087],
    [0.075, 1.005, -0.025, 0.088],
    [0.125, 1.015, -0.12, 0.083],
    [0.12, 0.918, -0.21, 0.06],
    [0.058, 0.813, -0.223, 0.039],
    [0.02, 0.79, -0.2, 0.034],
  ];
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p.slice(0, 3))),
  );
  const steps = 36,
    centers = [],
    radii = [],
    lengths = [0],
    tangents = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      k = Math.min(points.length - 2, Math.floor(t * (points.length - 1))),
      f = t * (points.length - 1) - k;
    centers.push(curve.getPoint(t));
    radii.push(THREE.MathUtils.lerp(points[k][3], points[k + 1][3], f));
    tangents.push(curve.getTangent(t).normalize());
    if (i) lengths.push(lengths[i - 1] + centers[i].distanceTo(centers[i - 1]));
  }
  const lower = new THREE.Vector3(-0.11, 0.704, -0.306),
    upper = new THREE.Vector3(0.235, 1.125, 0.16);
  const span = upper.clone().sub(lower),
    resolution = 58;
  const field = new MarchingCubes(resolution, undefined, false, false, 35000);
  field.isolation = 0;
  const p = new THREE.Vector3(),
    delta = new THREE.Vector3();
  function nearest(point) {
    let best = Infinity,
      bestIndex = 0,
      bestT = 0;
    for (let i = 0; i < steps; i++) {
      delta.copy(centers[i + 1]).sub(centers[i]);
      const t = THREE.MathUtils.clamp(
        point.clone().sub(centers[i]).dot(delta) / delta.lengthSq(),
        0,
        1,
      );
      const center = centers[i].clone().addScaledVector(delta, t);
      const d =
        point.distanceTo(center) -
        THREE.MathUtils.lerp(radii[i], radii[i + 1], t);
      if (d < best) {
        best = d;
        bestIndex = i;
        bestT = t;
      }
    }
    // Fill the anatomical waist cut with a broad seated hip mass. This is
    // smoothly joined into the thigh instead of touching it at a narrow cap.
    const hip = point.clone().sub(new THREE.Vector3(0.025, 0.963, 0.035));
    const hipRadii = new THREE.Vector3(0.1, 0.064, 0.086);
    const k0 = hip.clone().divide(hipRadii).length();
    const k1 = hip.clone().divide(hipRadii.clone().multiply(hipRadii)).length();
    const hipDistance = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -0.064;
    const blend = Math.max(0.014 - Math.abs(best - hipDistance), 0) / 0.014;
    best = Math.min(best, hipDistance) - blend * blend * 0.014 * 0.25;
    return { distance: best, index: bestIndex, t: bestT };
  }
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++) {
        p.set(
          lower.x + (x / resolution) * span.x,
          lower.y + (y / resolution) * span.y,
          lower.z + (z / resolution) * span.z,
        );
        // Positive inside is the convention used by Three's marching-cubes normals.
        field.field[z * resolution * resolution + y * resolution + x] =
          -nearest(p).distance;
      }
  field.update();
  const positions = [],
    uv = [],
    normals = [];
  const input = field.geometry.attributes.position;
  const sourceNormals = field.geometry.attributes.normal;
  for (let i = 0; i < field.count; i++) {
    p.fromBufferAttribute(input, i)
      .addScalar(1)
      .multiplyScalar(0.5)
      .multiply(span)
      .add(lower);
    positions.push(
      ...p.toArray().map((value) => Math.round(value * 1e7) / 1e7),
    );
    const normal = new THREE.Vector3()
      .fromBufferAttribute(sourceNormals, i)
      .divide(span)
      .normalize();
    normals.push(...normal.toArray());
    const hit = nearest(p),
      center = centers[hit.index].clone().lerp(centers[hit.index + 1], hit.t);
    const tangent = tangents[hit.index]
      .clone()
      .lerp(tangents[hit.index + 1], hit.t)
      .normalize();
    const depth = new THREE.Vector3(0, 0, 1)
      .addScaledVector(tangent, -tangent.z)
      .normalize();
    const across = tangent.clone().cross(depth),
      offset = p.clone().sub(center);
    const angle = Math.atan2(offset.dot(depth), offset.dot(across));
    uv.push(
      (angle / (Math.PI * 2) + 0.5) * 0.672,
      THREE.MathUtils.lerp(lengths[hit.index], lengths[hit.index + 1], hit.t),
    );
  }
  for (let i = 0; i < uv.length; i += 6) {
    const values = [uv[i], uv[i + 2], uv[i + 4]];
    if (Math.max(...values) - Math.min(...values) > 0.336)
      for (let j = 0; j < 3; j++)
        if (uv[i + j * 2] < 0.336) uv[i + j * 2] += 0.672;
  }
  // Grid-isosurface coincidences can emit zero-area triangles. Snap only below
  // a tenth of a micron, then discard collapsed triples without opening edges.
  const cleanPositions = [],
    cleanUV = [],
    cleanNormals = [];
  for (let i = 0; i < positions.length; i += 9) {
    const keys = [0, 3, 6].map((offset) =>
      positions.slice(i + offset, i + offset + 3).join(","),
    );
    if (new Set(keys).size < 3) continue;
    cleanPositions.push(...positions.slice(i, i + 9));
    cleanNormals.push(...normals.slice(i, i + 9));
    cleanUV.push(...uv.slice((i / 3) * 2, (i / 3) * 2 + 6));
  }
  const geometry = geometryOf(cleanPositions, null, cleanUV);
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(cleanNormals, 3),
  );
  // Marching-cubes produces duplicated vertices. Average normals by physical
  // position, retaining independent UV seam vertices and their exact phases.
  smoothNormals(geometry);
  field.geometry.dispose();
  field.material.dispose();
  geometry.userData.referencePart = "Raised knee and descending tapered tail";
  return geometry;
}

function smoothNormals(geometry) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((v) => Math.round(v * 1e6))
      .join(",");
    let group = groups.get(key);
    if (!group) {
      group = { normal: new THREE.Vector3(), vertices: [] };
      groups.set(key, group);
    }
    group.normal.add(new THREE.Vector3().fromBufferAttribute(n, i));
    group.vertices.push(i);
  }
  for (const group of groups.values()) {
    group.normal.normalize();
    for (const i of group.vertices)
      n.setXYZ(i, group.normal.x, group.normal.y, group.normal.z);
  }
}

function finLobe(side) {
  const rows = 48,
    sides = 80,
    position = [],
    uv = [],
    index = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows,
      spread = Math.sin(Math.PI * t) ** 0.7;
    const cx = 0.02 + side * (0.006 + 0.165 * t),
      cy = 0.8 - 0.176 * t;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2,
        w = Math.cos(a);
      const flute =
        0.003 *
        Math.cos(w * 9 * Math.PI + t * 1.4) *
        Math.sin(Math.PI * t) *
        Math.sin(a) ** 2;
      position.push(
        cx + w * 0.09 * spread,
        cy - 0.009 * spread * (1 - w * w),
        -0.2 -
          0.016 * t -
          0.024 * Math.sin(Math.PI * t) +
          Math.sin(a) * (0.009 * spread + flute),
      );
      uv.push((w + 1) * 0.09, t * 0.2);
      if (r < rows && k < sides) {
        const p = r * (sides + 1) + k,
          q = p + sides + 1;
        // The last/first rings collapse to poles; emit only their valid faces.
        if (r > 0) index.push(p, p + 1, q);
        if (r < rows - 1) index.push(p + 1, q + 1, q);
      }
    }
  }
  const geometry = geometryOf(position, index, uv);
  smoothNormals(geometry);
  return geometry;
}

function referenceRock() {
  const profile = [
    [0.608, 0.09],
    [0.62, 0.145],
    [0.636, 0.154],
    [0.664, 0.123],
    [0.679, 0.109],
    [0.71, 0.139],
    [0.728, 0.143],
    [0.751, 0.116],
    [0.778, 0.107],
    [0.805, 0.146],
    [0.824, 0.128],
    [0.851, 0.104],
    [0.88, 0.128],
    [0.902, 0.136],
    [0.934, 0.109],
    [0.959, 0.084],
    [0.981, 0.002],
  ];
  const rows = 70,
    sides = 72,
    position = [],
    uv = [],
    index = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows,
      s = t * (profile.length - 1),
      j = Math.min(profile.length - 2, Math.floor(s)),
      f = s - j;
    const y = THREE.MathUtils.lerp(profile[j][0], profile[j + 1][0], f);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const shifted = THREE.MathUtils.clamp(
        s + Math.sin(a * 2 + 0.6) * 0.6 + Math.cos(a * 3 - t * 2) * 0.3,
        0,
        profile.length - 1,
      );
      const section = Math.min(profile.length - 2, Math.floor(shifted));
      const rockRadius = THREE.MathUtils.lerp(
        profile[section][1],
        profile[section + 1][1],
        shifted - section,
      );
      const ridge =
        1 + 0.12 * Math.sin(a * 5 + t * 9) + 0.075 * Math.cos(a * 3 - t * 5);
      position.push(
        -0.025 + Math.cos(a) * rockRadius * ridge,
        y + 0.019 * Math.sin(a + 1.3) * Math.sin(Math.PI * t),
        0.065 + Math.sin(a) * rockRadius * 0.78 * ridge,
      );
      uv.push((k / sides) * 0.9, t * 0.4);
      if (r < rows && k < sides) {
        const p = r * (sides + 1) + k,
          q = p + sides + 1;
        index.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
  }
  for (const end of [0, rows]) {
    const center = position.length / 3;
    position.push(-0.025, profile[end ? profile.length - 1 : 0][0], 0.065);
    uv.push(0, end ? 0.4 : 0);
    for (let k = 0; k < sides; k++) {
      const p = end * (sides + 1) + k;
      if (end) index.push(center, p + 1, p);
      else index.push(center, p, p + 1);
    }
  }
  const geometry = geometryOf(position, index, uv);
  smoothNormals(geometry);
  geometry.userData.referencePart = "Tilted layered rock seat";
  return geometry;
}

/** Local metres; the -Z side faces the pool. These are full three-dimensional
 * solids inferred from the supplied single photograph, including the unseen back. */
export function createReferenceTail() {
  const left = finLobe(-1),
    right = finLobe(1);
  const fin = mergeGeometries([left, right]);
  left.dispose();
  right.dispose();
  fin.computeBoundingBox();
  fin.computeBoundingSphere();
  fin.userData.referencePart = "Broad draping twin-lobed fluted fin";
  return { tail: referenceTail(), fin, rock: referenceRock() };
}
