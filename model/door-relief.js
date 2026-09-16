import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
  Vector3,
} from "three";

function dimensions({ width, height, thickness }) {
  if (
    ![width, height, thickness].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error("Carved door dimensions must be positive finite metres");
  return { width, height, thickness };
}

/** Shared physical panel bounds for matching UV1 carving/height textures. */
export function carvedDoorLayout(options) {
  const { width, height, thickness } = dimensions(options);
  const stile = Math.min(0.1, width * 0.16);
  const topRail = Math.min(0.12, height * 0.08);
  const bottomRail = Math.min(0.18, height * 0.1);
  const rail = Math.min(0.09, height * 0.05);
  const usableHeight = height - topRail - bottomRail - 2 * rail;
  let bottom = -height / 2 + bottomRail;
  const panels = [0.25, 0.32, 0.43].map((fraction) => {
    const panel = {
      left: -width / 2 + stile,
      right: width / 2 - stile,
      bottom,
      top: bottom + usableHeight * fraction,
    };
    bottom = panel.top + rail;
    const profileScale = Math.min(
      1,
      Math.min(panel.right - panel.left, panel.top - panel.bottom) / 0.22,
    );
    const depth = Math.min(0.008, thickness * 0.22);
    panel.profile = [
      { inset: 0, depth: 0 },
      { inset: 0.009 * profileScale, depth: depth * 0.5 },
      { inset: 0.012 * profileScale, depth },
      { inset: 0.019 * profileScale, depth },
      { inset: 0.027 * profileScale, depth: depth * 0.25 },
      { inset: 0.035 * profileScale, depth: depth * 0.25 },
    ];
    panel.fieldInset = panel.profile.at(-1).inset;
    panel.uvBounds = [
      panel.left / width + 0.5,
      panel.bottom / height + 0.5,
      panel.right / width + 0.5,
      panel.top / height + 0.5,
    ];
    return panel;
  });
  return { width, height, thickness, stile, topRail, bottomRail, rail, panels };
}

const rectangle = (left, bottom, right, top) => [
  new Vector2(left, bottom),
  new Vector2(right, bottom),
  new Vector2(right, top),
  new Vector2(left, top),
];

/**
 * One closed solid leaf centered on the same envelope as BoxGeometry(width,
 * height, thickness). Both faces have recessed grooves, mitred bevels and raised
 * fields. All relief lies inside the original slab; swing/collision bounds stay
 * unchanged. UV0 is physical wood metres; UV1 is normalized whole-leaf X/Y.
 */
export function createCarvedDoorGeometry(options) {
  const layout = carvedDoorLayout(options);
  const { width, height, thickness, panels } = layout;
  const positions = [],
    normals = [],
    uvs = [],
    uv1 = [];
  const outer = rectangle(-width / 2, -height / 2, width / 2, height / 2);
  const holes = panels.map((panel) =>
    rectangle(panel.left, panel.bottom, panel.right, panel.top),
  );
  const frameVertices = [...outer, ...holes.flat()];
  const triangles = ShapeUtils.triangulateShape(outer, holes);
  const a = new Vector3(),
    b = new Vector3(),
    normal = new Vector3();

  function triangle(p, q, r, side = 1) {
    if (side < 0) [q, r] = [r, q];
    normal.crossVectors(a.subVectors(q, p), b.subVectors(r, p)).normalize();
    const nx = Math.abs(normal.x),
      ny = Math.abs(normal.y),
      nz = Math.abs(normal.z);
    for (const v of [p, q, r]) {
      positions.push(v.x, v.y, v.z);
      normals.push(normal.x, normal.y, normal.z);
      // Match the model's metre-scale projection for broad faces and cut edges.
      if (nz >= nx && nz >= ny) uvs.push(v.x + width / 2, v.y + height / 2);
      else if (nx > ny) uvs.push(v.z + thickness / 2, v.y + height / 2);
      else uvs.push(v.x + width / 2, v.z + thickness / 2);
      uv1.push(v.x / width + 0.5, v.y / height + 0.5);
    }
  }
  function quad(p, q, r, s, side = 1) {
    triangle(p, q, r, side);
    triangle(p, r, s, side);
  }
  const atDepth = (points, z) => points.map((p) => new Vector3(p.x, p.y, z));

  for (const side of [1, -1]) {
    const front = atDepth(frameVertices, (side * thickness) / 2);
    for (const indices of triangles) {
      const vertices = indices.map((index) => front[index]);
      // Earcut winding is independent of the face being constructed.
      const cross = a
        .subVectors(vertices[1], vertices[0])
        .cross(b.subVectors(vertices[2], vertices[0])).z;
      triangle(...vertices, cross > 0 ? side : -side);
    }
    for (const panel of panels) {
      let previous;
      for (const { inset, depth } of panel.profile) {
        const ring = atDepth(
          rectangle(
            panel.left + inset,
            panel.bottom + inset,
            panel.right - inset,
            panel.top - inset,
          ),
          side * (thickness / 2 - depth),
        );
        if (previous)
          for (let edge = 0; edge < 4; edge++) {
            const next = (edge + 1) % 4;
            quad(previous[edge], previous[next], ring[next], ring[edge], side);
          }
        previous = ring;
      }
      quad(previous[0], previous[1], previous[2], previous[3], side);
    }
  }
  const front = atDepth(outer, thickness / 2),
    back = atDepth(outer, -thickness / 2);
  for (let edge = 0; edge < 4; edge++) {
    const next = (edge + 1) % 4;
    quad(front[edge], back[edge], back[next], front[next]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("uv1", new Float32BufferAttribute(uv1, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = "Carved timber leaf · three bevelled panels on both faces";
  geometry.userData.carvedDoor = layout;
  return geometry;
}
