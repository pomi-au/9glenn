import polygonClipping from "polygon-clipping";

// Snap sub-micron intersections so coincident half-planes share exact vertices.
const snap = (value) =>
  Array.isArray(value) ? value.map(snap) : Math.round(value * 1e4) / 1e4;
const clipping = Object.fromEntries(
  ["intersection", "difference", "union"].map((op) => [
    op,
    (...args) => snap(polygonClipping[op](...args.map(snap))),
  ]),
);

// Coordinates are X / height / Z in mm. All views consume these same faces.
export const upperFootprint = [
  [9600, 600],
  [26630, 600],
  [26630, 12710],
  [22550, 12710],
  [22550, 13790],
  [9600, 13790],
  [9600, 12710],
  [5520, 12710],
  [5520, 4680],
  [9600, 4680],
];
const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const area = (ring) =>
  Math.abs(
    ring.reduce((s, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return s + p[0] * q[1] - p[1] * q[0];
    }, 0) / 2,
  );
const open = (ring) =>
  ring.length > 1 &&
  Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 0.001
    ? ring.slice(0, -1)
    : ring;
const value = (p, x, z) => p[0] * x + p[1] * z + p[2];
function halfPlane([a, b, c]) {
  let ring = rect(-100000, -100000, 100000, 100000),
    out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length],
      u = value([a, b, c], ...p),
      v = value([a, b, c], ...q);
    if (u >= 0) out.push(p);
    if (u >= 0 !== v >= 0)
      out.push(p.map((n, j) => n + ((q[j] - n) * u) / (u - v)));
  }
  return out.length >= 3 ? [out] : [];
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
function restrict(polygons, plane) {
  const hp = halfPlane(plane);
  return hp.length && polygons.length
    ? clipping.intersection(polygons, hp)
    : [];
}
function candidates(id, domain, planes, level, eave, material = "tile") {
  return planes.flatMap((plane, i) => {
    let polygons = typeof domain[0][0] === "number" ? [[domain]] : [domain];
    for (let j = 0; j < planes.length; j++)
      if (i !== j) polygons = restrict(polygons, sub(planes[j], plane));
    return polygons.map((rings, n) => ({
      id: `${id}-${i}-${n}`,
      component: id,
      level,
      eave,
      material,
      plane,
      rings,
    }));
  });
}
function hip(id, domain, box, eave, pitch, level, eastHip = true) {
  const [x0, z0, x1, z1] = box,
    t = Math.tan((pitch * Math.PI) / 180);
  const planes = [
    [t, 0, eave - t * x0],
    [0, t, eave - t * z0],
    [0, -t, eave + t * z1],
  ];
  if (eastHip) planes.push([-t, 0, eave + t * x1]);
  return candidates(id, domain, planes, level, eave);
}
function envelope(faces) {
  return faces.flatMap((face, i) => {
    let polygons = [face.rings];
    for (let j = 0; j < faces.length && polygons.length; j++) {
      if (i === j) continue;
      const other = faces[j],
        delta = sub(other.plane, face.plane);
      if (Math.hypot(...delta) < 1e-7) {
        if (j < i) polygons = clipping.difference(polygons, [other.rings]);
        continue;
      }
      // A positive difference means the other plane conceals this one from above.
      const higher = restrict([other.rings], delta);
      if (higher.length) polygons = clipping.difference(polygons, higher);
    }
    return polygons
      .filter((rings) => area(rings[0]) > 1)
      .map((rings, n) => ({
        ...face,
        id: `${face.id}-${n}`,
        rings: rings.map(open),
      }));
  });
}
function at(face, p) {
  return [p[0], value(face.plane, ...p), p[1]];
}
function surfaceEdges(faces) {
  const edges = [];
  for (const f of faces)
    for (const ring of f.rings)
      for (let i = 0; i < ring.length; i++)
        edges.push({
          a: at(f, ring[i]),
          b: at(f, ring[(i + 1) % ring.length]),
          face: f,
        });
  const vertices = edges.flatMap((e) => [e.a, e.b]);
  const result = new Map();
  // Split collinear segments before matching: intersections often add T vertices.
  for (const e of edges) {
    const d = e.b.map((v, i) => v - e.a[i]),
      len2 = d.reduce((s, v) => s + v * v, 0);
    if (len2 < 1) continue;
    const ts = [0, 1];
    for (const v of vertices) {
      const t = d.reduce((s, n, i) => s + n * (v[i] - e.a[i]), 0) / len2;
      if (
        t > 1e-7 &&
        t < 1 - 1e-7 &&
        Math.hypot(...v.map((n, i) => n - e.a[i] - t * d[i])) < 0.02
      )
        ts.push(t);
    }
    ts.sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) {
      if ((ts[i] - ts[i - 1]) * Math.sqrt(len2) < 0.05) continue;
      const a = e.a.map((v, j) => v + ts[i - 1] * d[j]),
        b = e.a.map((v, j) => v + ts[i] * d[j]);
      const key = [a, b]
        .map((p) => p.map((v) => v.toFixed(2)).join(","))
        .sort()
        .join("|");
      if (result.has(key)) result.get(key).faces.push(e.face);
      else result.set(key, { a, b, faces: [e.face] });
    }
  }
  return [...result.values()].map((e) => {
    let kind = "eave";
    if (e.faces.length > 1) {
      const [a, b] = e.faces;
      if (Math.hypot(...sub(a.plane, b.plane)) < 0.001) kind = "seam";
      else {
        const dx = e.b[0] - e.a[0],
          dz = e.b[2] - e.a[2],
          length = Math.hypot(dx, dz);
        const inside = [
          (e.a[0] + e.b[0]) / 2 - dz / length,
          (e.a[2] + e.b[2]) / 2 + dx / length,
        ];
        kind =
          value(a.plane, ...inside) > value(b.plane, ...inside) + 0.001
            ? "valley"
            : "ridge";
      }
    }
    return {
      a: e.a,
      b: e.b,
      kind,
      faceIds: e.faces.map((f) => f.id),
      component: e.faces[0].component,
      level: e.faces[0].level,
      eave: e.faces[0].eave,
    };
  });
}
export function buildRoofAssembly(spec = {}) {
  const ceiling =
    (spec.groundCeiling ?? 3086) +
    (spec.floorZone ?? 172) +
    (spec.upperCeiling ?? 2783);
  const eave = ceiling + 130,
    pitch = spec.roofPitch ?? 20 + 49 / 60,
    overhang = spec.inferredRoofOverhang ?? 160;
  const o = overhang;
  const main = hip(
    "main-hip",
    [
      [9600 - o, 600 - o],
      [26630 + o, 600 - o],
      [26630 + o, 12710 + o],
      [5520 - o, 12710 + o],
      [5520 - o, 4680 - o],
      [9600 - o, 4680 - o],
    ],
    [5520 - o, 600 - o, 26630 + o, 12710 + o],
    eave,
    pitch,
    "upper",
  );
  const central = hip(
    "central-hip",
    rect(9600 - o, 600 - o, 22550 + o, 13790 + o),
    [9600 - o, 600 - o, 22550 + o, 13790 + o],
    eave,
    pitch,
    "upper",
  );
  const gableX = 16075,
    gableHalf = 1895,
    gablePitch = 25,
    t = Math.tan((gablePitch * Math.PI) / 180);
  const gable = candidates(
    "arch-gable",
    rect(
      gableX - gableHalf,
      11000,
      gableX + gableHalf,
      13790 + (spec.frontPhoto?.upperPierProjection ?? 230) + o,
    ),
    [
      [t, 0, eave - t * (gableX - gableHalf)],
      [-t, 0, eave + t * (gableX + gableHalf)],
    ],
    "upper",
    eave,
  );
  const upper = envelope([...main, ...central, ...gable]);
  // The main ridge runs into the house. Only the narrow front return has an
  // east hip: applying it to the whole garage would shorten the main ridge.
  const garageEave = spec.garageEaves ?? 2391;
  const garagePitch = Math.tan((pitch * Math.PI) / 180);
  const garage = [
    ...hip(
      "garage-hip",
      rect(-120, 6360, 5520, 13430),
      [-120, 6360, 6950, 13430],
      garageEave,
      pitch,
      "lower",
      false,
    ),
    // Sheet 6: the rear eave continues beneath the upper floor to the
    // gallery return. This low roof patch stays below the house slab.
    ...candidates(
      "garage-hip",
      rect(5520, 6360, 6950, 7890),
      [[0, garagePitch, garageEave - garagePitch * 6360]],
      "lower",
      garageEave,
    ).map((face) => ({ ...face, id: `garage-rear-return-${face.id}` })),
    ...candidates(
      "garage-hip",
      rect(5520, 12710, 6350, 13430),
      [
        [0, -garagePitch, garageEave + garagePitch * 13430],
        [-garagePitch, 0, garageEave + garagePitch * 6350],
      ],
      "lower",
      garageEave,
    ).map((face) => ({ ...face, id: `garage-return-${face.id}` })),
  ];
  const porticoBase = spec.porticoSideEaves ?? 3858,
    p = Math.tan(Math.PI / 180);
  const portico = candidates(
    "portico-deck",
    rect(14180, 13790, 17970, 16170),
    [[0, p, porticoBase - p * 13790]],
    "lower",
    porticoBase,
    "metal",
  );
  const bay = candidates(
    "bay-lean-to",
    rect(18600, -100, 23030, 600),
    [[0, Math.tan((pitch * Math.PI) / 180), 3288]],
    "lower",
    3288,
  );
  const topFaces = [...upper, ...garage, ...portico, ...bay];
  const edges = surfaceEdges(topFaces);
  for (const edge of edges) {
    if (edge.component !== "garage-hip" || edge.kind !== "eave") continue;
    const againstHouse = upperFootprint.some((a, index) => {
      const b = upperFootprint[(index + 1) % upperFootprint.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      return [edge.a, edge.b].every((p) => {
        const along = ((p[0] - a[0]) * dx + (p[2] - a[1]) * dz) / length;
        return (
          Math.abs((p[0] - a[0]) * dz - (p[2] - a[1]) * dx) / length < 0.01 &&
          along >= -0.01 &&
          along <= length + 0.01
        );
      });
    });
    if (againstHouse) edge.kind = "abutment";
  }
  const faces = topFaces.map((f) => ({
    ...f,
    kind: "surface",
    rings: f.rings.map((r) => r.map((p) => at(f, p))),
  }));
  const add = (id, component, level, kind, ring) => {
    if (Math.hypot(...ring[0].map((v, i) => v - ring.at(-1)[i])) > 0.01)
      faces.push({ id, component, level, kind, rings: [ring] });
  };
  for (const [i, e] of edges.entries()) {
    if (e.kind === "abutment") {
      // Continue the house render down to the sloping roof. Without this apron,
      // the slab underside and the ground-floor wall make a staircase notch.
      const top = spec.groundCeiling ?? 3086;
      let a = [...e.a],
        b = [...e.b];
      if (Math.min(a[1], b[1]) >= top) continue;
      if (Math.max(a[1], b[1]) > top) {
        const t = (top - a[1]) / (b[1] - a[1]);
        const crossing = a.map((v, axis) => v + t * (b[axis] - v));
        if (a[1] > top) a = crossing;
        else b = crossing;
      }
      const ring = [a, b, [b[0], top, b[2]], [a[0], top, a[2]]].filter(
        (p, index, points) =>
          !index ||
          Math.hypot(...p.map((v, axis) => v - points[index - 1][axis])) > 0.01,
      );
      if (Math.hypot(...ring[0].map((v, axis) => v - ring.at(-1)[axis])) < 0.01)
        ring.pop();
      if (ring.length >= 3)
        faces.push({
          id: `garage-abutment-${i}`,
          component: "garage-hip",
          level: "lower",
          kind: "infill",
          rings: [ring],
        });
      continue;
    }
    if (e.kind !== "eave") continue;
    const bottom = (p) => [p[0], p[1] - 110, p[2]];
    add(`fascia-${i}`, e.component, e.level, "fascia", [
      e.a,
      e.b,
      bottom(e.b),
      bottom(e.a),
    ]);
    // Small soffit/plate closure and vertical infill at the recessed cut edges.
    const closureBase =
      e.component === "bay-lean-to"
        ? (spec.groundCeiling ?? 3086)
        : e.eave - 130;
    if (
      e.component !== "arch-gable" &&
      Math.max(e.a[1], e.b[1]) - 110 > closureBase + 0.1
    )
      add(`infill-${i}`, e.component, e.level, "infill", [
        bottom(e.a),
        bottom(e.b),
        [e.b[0], closureBase, e.b[2]],
        [e.a[0], closureBase, e.a[2]],
      ]);
  }
  // Gable masonry is on the upper front wall, behind the projecting pier caps and their 160 mm roof overhang.
  // Preserve the portion of the upper semicircular glazing above ceiling level.
  const gableTop = (x) => eave + (gableHalf - Math.abs(x - gableX)) * t - 110;
  const gableRing = [
    [14280, ceiling],
    [17870, ceiling],
    [17870, gableTop(17870)],
    [gableX, gableTop(gableX)],
    [14280, gableTop(14280)],
  ];
  const opening = [
    [15290, 5401],
    [16860, 5401],
    ...Array.from({ length: 65 }, (_, i) => {
      const a = (i * Math.PI) / 64;
      return [gableX + 785 * Math.cos(a), 5401 + 785 * Math.sin(a)];
    }),
  ];
  for (const [i, rings] of clipping
    .difference([gableRing], [opening])
    .entries())
    faces.push({
      id: `arch-gable-infill-${i}`,
      component: "arch-gable",
      level: "upper",
      kind: "infill",
      rings: rings.map((r) => open(r).map(([x, y]) => [x, y, 13790])),
    });
  return {
    version: 1,
    units: "mm",
    ceiling,
    pitch,
    faces,
    edges,
    upperFootprint,
    sectionX: 21300,
    source:
      "PDF sheets 2, 4, 5, 6, 7; registered plan dimensions and printed 20°49′ / 25° / 1° pitches",
    assumptions:
      "Roof junctions reconstructed jointly from four elevations; overhangs, 130 mm eave build-up, 110 mm fascia, bay fall and section X registration are inferred.",
  };
}

const views = {
  front: (p) => [p[0], p[1], p[2]],
  rear: (p) => [26630 - p[0], p[1], -p[2]],
  left: (p) => [p[2] - 600, p[1], -p[0]],
  right: (p) => [13790 - p[2], p[1], p[0]],
  plan: (p) => [p[0], p[2], p[1]],
};
function projection(face, view) {
  const rings = face.rings.map((r) => r.map(views[view]));
  const pts = rings[0];
  let plane;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[0], pts[i], pts[i + 1]],
      det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < 0.01) continue;
    const u =
      ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / det;
    const v =
      ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / det;
    plane = [u, v, a[2] - u * a[0] - v * a[1]];
    break;
  }
  return plane
    ? { ...face, plane, rings: rings.map((r) => r.map((p) => p.slice(0, 2))) }
    : null;
}
export function projectRoofs(assembly, view) {
  const blockers = [];
  if (view !== "plan") {
    const wallRings = [
      {
        ring: assembly.upperFootprint,
        bottom: 3086,
        top: assembly.ceiling,
        id: "upper",
      },
      {
        ring: [
          [0, 6480],
          [6720, 6480],
          [6720, 5640],
          [9600, 5640],
          [9600, 600],
          [18720, 600],
          [18720, 0],
          [22910, 0],
          [22910, 600],
          [26630, 600],
          [26630, 12710],
          [22550, 12710],
          [22550, 13790],
          [17870, 13790],
          [17870, 16070],
          [14280, 16070],
          [14280, 13790],
          [9600, 13790],
          [9600, 12710],
          [6230, 12710],
          [6230, 13310],
          [0, 13310],
        ],
        bottom: 0,
        top: 3086,
        id: "ground",
      },
    ];
    for (const wall of wallRings)
      for (let i = 0; i < wall.ring.length; i++) {
        const a = wall.ring[i],
          b = wall.ring[(i + 1) % wall.ring.length];
        let top = wall.top;
        if (
          wall.id === "ground" &&
          Math.max(a[0], b[0]) <= 6720 &&
          Math.min(a[1], b[1]) >= 6480
        )
          top = 2391;
        blockers.push({
          id: `${wall.id}-wall-${i}`,
          kind: "blocker",
          rings: [
            [
              [a[0], wall.bottom, a[1]],
              [b[0], wall.bottom, b[1]],
              [b[0], top, b[1]],
              [a[0], top, a[1]],
            ],
          ],
        });
      }
  }
  const projected = [...assembly.faces, ...blockers]
    .map((f) => projection(f, view))
    .filter(Boolean);
  const visible = envelope(projected).filter((f) => f.kind !== "blocker");
  // Coplanar roof patches have no physical crease. Suppress the artificial
  // horizontal line under the rear ridge bump after resolving visibility.
  const groups = [];
  for (const face of visible) {
    let group = groups.find(
      (g) =>
        g.kind === face.kind &&
        g.material === face.material &&
        Math.hypot(...sub(g.plane, face.plane)) < 0.0001,
    );
    if (!group) {
      group = { ...face, polygons: [], sourceFaceIds: [] };
      groups.push(group);
    }
    group.polygons.push(face.rings);
    group.sourceFaceIds.push(face.id);
  }
  return groups.flatMap((g) =>
    clipping.union(...g.polygons).map((rings, i) => {
      const { polygons, ...face } = g;
      return {
        ...face,
        id: `${g.id}-view-${i}`,
        rings: rings.map((r) =>
          open(r).map(([x, y]) => [
            x,
            view === "plan" ? y : assembly.ceiling - y,
          ]),
        ),
      };
    }),
  );
}
export function sectionRoofs(assembly, x = assembly.sectionX) {
  const cuts = [];
  for (const face of assembly.faces.filter((f) => f.kind === "surface")) {
    const pts = [];
    for (const ring of face.rings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) {
          const t = (x - a[0]) / (b[0] - a[0]);
          pts.push([
            a[2] + t * (b[2] - a[2]) - 600,
            assembly.ceiling - a[1] - t * (b[1] - a[1]),
          ]);
        }
      }
    pts.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i + 1 < pts.length; i += 2)
      cuts.push({
        faceId: face.id,
        points: [
          pts[i],
          pts[i + 1],
          [pts[i + 1][0], pts[i + 1][1] + 110],
          [pts[i][0], pts[i][1] + 110],
        ],
      });
  }
  return cuts;
}
