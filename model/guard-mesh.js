import * as THREE from "three";

// Positive-height deformation of an extrusion preserves its outward winding.
export function guardGeometry(
  shape,
  panel,
  rise,
  height,
  footing = 0,
  base = null,
) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) * 1000,
      z = positions.getZ(i) * 1000;
    // Corresponding vertices at each mitred end share exactly one elevation.
    const [a, b, c, d] = panel.points;
    const distanceToEnd = (p, q) =>
      Math.abs((q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])) /
      Math.hypot(q[0] - p[0], q[1] - p[1]);
    const startDistance = distanceToEnd(a, d),
      endDistance = distanceToEnd(b, c);
    const t = startDistance / (startDistance + endDistance);
    const bottom = (panel.start + (panel.end - panel.start) * t) * rise;
    const low = base ?? bottom - footing;
    positions.setY(
      i,
      (low + positions.getY(i) * (bottom + height - low)) / 1000,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}
