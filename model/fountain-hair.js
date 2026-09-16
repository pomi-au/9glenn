import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loft } from "./sculpture-geometry.js";

/** Broad, tapered carved locks over an anatomically fitted scalp. */
export function createFountainHair(scalp) {
  scalp.computeBoundingBox();
  const bounds = scalp.boundingBox;
  const top = bounds.max.y;
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const width = (bounds.max.x - bounds.min.x) / 2;
  const pieces = [];
  // Side and back locks join the crown and flow onto the left shoulder.
  // Their broad grooved sections read as carved hair rather than separate cords.
  for (let i = 0; i < 36; i++) {
    const angle = -0.2 + (i / 35) * (Math.PI + 0.4);
    const x = Math.cos(angle),
      z = Math.sin(angle);
    const side = x >= 0 ? 1 : -1;
    const front = z < 0.35;
    const curl = 0.011 * Math.sin(i * 1.71);
    const endY = side > 0 ? 1.17 + 0.05 * z : 1.25 + 0.015 * z;
    const sections = [
      [cx + x * width * 0.45, top - 0.005, cz + z * 0.041, 0.008, 0.006],
      [cx + x * width * 0.9, top - 0.045, cz + z * 0.064, 0.009, 0.007],
      [
        cx + side * (0.066 + 0.006 * z),
        top - 0.13,
        cz + z * 0.075,
        0.009,
        0.007,
      ],
      [
        cx + side * (0.082 + curl),
        1.29,
        front ? -0.015 : 0.07 + z * 0.025,
        0.01,
        0.007,
      ],
      [
        cx + side * (0.067 - curl),
        endY + 0.035,
        front ? -0.066 : 0.072,
        0.007,
        0.005,
      ],
      [cx + side * (0.037 + curl), endY, front ? -0.074 : 0.06, 0.002, 0.002],
    ];
    pieces.push(
      loft(sections, {
        steps: 48,
        sides: 12,
        smoothRadii: true,
        transportedFrames: true,
        relief: (t, a) =>
          0.0007 * Math.cos(a * 5 + t * 3) * Math.sin(Math.PI * t),
      }),
    );
  }
  // Narrow swept locks frame the forehead without covering the eyes.
  for (let i = 0; i < 10; i++) {
    const k = i / 9;
    pieces.push(
      loft(
        [
          [cx - 0.005 + 0.025 * k, top + 0.004, cz - 0.02, 0.006, 0.005],
          [cx + 0.022 + 0.022 * k, top - 0.02, cz - 0.047, 0.007, 0.005],
          [cx + 0.06 + 0.015 * k, top - 0.065, cz - 0.067, 0.008, 0.006],
          [cx + 0.072 + 0.015 * k, top - 0.125, cz - 0.04, 0.007, 0.006],
          [
            cx + 0.1 + 0.007 * Math.sin(i),
            top - 0.2 - 0.03 * k,
            cz - 0.04,
            0.005,
            0.004,
          ],
          [
            cx + 0.055 + 0.024 * k,
            top - 0.28 - 0.03 * k,
            cz - 0.085,
            0.0015,
            0.0015,
          ],
        ],
        {
          steps: 48,
          sides: 12,
          smoothRadii: true,
          transportedFrames: true,
          relief: (t, a) =>
            0.0006 * Math.cos(a * 4 + t * 5) * Math.sin(Math.PI * t),
        },
      ),
    );
  }
  // Fine combed channels across the fitted crown are actual relief geometry.
  const positions = scalp.attributes.position,
    normals = scalp.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const h =
      0.0008 * Math.cos(Math.atan2(x - cx, z - cz) * 36 + (top - y) * 24);
    positions.setXYZ(
      i,
      x + normals.getX(i) * h,
      y + normals.getY(i) * h,
      z + normals.getZ(i) * h,
    );
  }
  scalp.computeVertexNormals();
  return { crown: scalp, locks: mergeGeometries(pieces) };
}
