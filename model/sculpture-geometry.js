import * as THREE from "three";

const V = (p) => new THREE.Vector3(...p);
/** Anatomical elliptical loft: tapered sections follow a smooth sculpted spine. */
export function loft(
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
