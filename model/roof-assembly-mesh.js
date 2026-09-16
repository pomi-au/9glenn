import * as THREE from "three";

const names = {
  "main-hip": "Main hip roof",
  "central-hip": "Projecting central hip",
  "arch-gable": "25° gable above upper arch",
  "garage-hip": "Attached garage roof",
  "portico-deck": "1° portico metal deck",
  "bay-lean-to": "Rear kitchen bay roof",
};
export function geometryFor(rings, surface = false, underside = false) {
  const origin = new THREE.Vector3(...rings[0][0]);
  const u = new THREE.Vector3(...rings[0][1]).sub(origin).normalize();
  let normal;
  for (const p of rings[0].slice(2)) {
    normal = u.clone().cross(new THREE.Vector3(...p).sub(origin));
    if (normal.length() > 0.001) break;
  }
  normal.normalize();
  if (surface && normal.y < 0) normal.negate();
  if (underside) normal.negate();
  const v = normal.clone().cross(u).normalize();
  const flat = rings.map((r) =>
    r.map((p) => {
      const d = new THREE.Vector3(...p).sub(origin);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    }),
  );
  const triangles = THREE.ShapeUtils.triangulateShape(flat[0], flat.slice(1));
  const points = rings.flat(),
    xy = flat.flat(),
    positions = [],
    uv = [];
  // Texture courses stay level on each slope, including the smaller 25° gable.
  const across =
    Math.hypot(normal.x, normal.z) > 0.001
      ? new THREE.Vector3(normal.z, 0, -normal.x).normalize()
      : u;
  const along = normal.clone().cross(across).normalize();
  for (let triangle of triangles) {
    const [a, b, c] = triangle.map((i) => xy[i]);
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0)
      triangle = [...triangle].reverse();
    for (const i of triangle) {
      const p = points[i],
        vec = new THREE.Vector3(...p);
      positions.push(
        p[0] / 1000,
        (p[1] - (underside ? 110 : 0)) / 1000,
        p[2] / 1000,
      );
      uv.push(vec.dot(across) / 640, vec.dot(along) / 600);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
export function roofAssemblyMeshes(assembly, upper, lower, materials, tag) {
  const metal = new THREE.MeshStandardMaterial({
    color: 0x53595b,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  function add(geometry, material, info) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    tag(mesh, {
      kind: "roof",
      floor: info.level === "upper" ? "roof" : "ground",
      source: assembly.source,
      ...info,
    });
    (info.level === "upper" ? upper : lower).add(mesh);
    return mesh;
  }
  for (const face of assembly.faces) {
    const surface = face.kind === "surface";
    const material = surface
      ? face.material === "metal"
        ? metal
        : materials.roof
      : face.kind === "fascia"
        ? materials.fascia
        : materials.roofInfill;
    const info = {
      name: `${names[face.component]} · ${face.kind}`,
      roofFaceId: face.id,
      component: face.component,
      level: face.level,
    };
    add(geometryFor(face.rings, surface), material, info);
    if (surface)
      add(geometryFor(face.rings, true, true), materials.fascia, {
        ...info,
        name: `${names[face.component]} · soffit`,
        roofFaceId: `${face.id}-soffit`,
      });
  }
  for (const level of ["upper", "lower"]) {
    const matrices = [];
    for (const edge of assembly.edges.filter(
      (e) => e.level === level && e.kind === "ridge",
    )) {
      const a = new THREE.Vector3(...edge.a).multiplyScalar(0.001),
        b = new THREE.Vector3(...edge.b).multiplyScalar(0.001);
      a.y += 0.025;
      b.y += 0.025;
      const direction = b.clone().sub(a),
        length = direction.length(),
        count = Math.ceil(length / 0.3);
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
      for (let i = 0; i < count; i++)
        matrices.push(
          new THREE.Matrix4().compose(
            a.clone().lerp(b, (i + 0.5) / count),
            rotation,
            new THREE.Vector3(1, length / count - 0.006, 1),
          ),
        );
    }
    if (matrices.length) {
      const caps = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.075, 0.09, 1, 10),
        materials.roofCap,
        matrices.length,
      );
      matrices.forEach((m, i) => caps.setMatrixAt(i, m));
      caps.instanceMatrix.needsUpdate = true;
      caps.castShadow = caps.receiveShadow = true;
      tag(caps, {
        name: "Roof ridge and hip caps",
        kind: "roof",
        level,
        source: assembly.source,
      });
      (level === "upper" ? upper : lower).add(caps);
    }
  }
  // Concave intersections get a thin flashing strip, never a raised ridge cap.
  for (const edge of assembly.edges.filter((e) => e.kind === "valley")) {
    const a = new THREE.Vector3(...edge.a),
      b = new THREE.Vector3(...edge.b),
      d = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(35);
    const ring = [
      a.clone().add(side),
      b.clone().add(side),
      b.clone().sub(side),
      a.clone().sub(side),
    ].map((p) => [p.x, p.y + 5, p.z]);
    add(geometryFor([ring], true), metal, {
      name: "Roof valley flashing",
      level: edge.level,
      component: edge.component,
    });
  }
}
