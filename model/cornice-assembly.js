// Solid mouldings registered to the original PDF's course levels and stepped plans.
import { upperFootprint } from "./roof-assembly.js";
import { segmentalOpening } from "./segmental-arch.js";
export function buildCorniceAssembly(photo) {
  const ceiling = 6041,
    faces = [],
    bands = [];
  const source =
    "Original PDF sheets 5 and 6: 68c/66c eaves, 63c/61c upper band, 25c/23c lower band, paired 44c/41c and 06c/03c sills";
  function face(id, ring, level, component) {
    faces.push({
      id,
      rings: [ring],
      kind: "cornice",
      material: "cornice",
      level,
      component,
    });
  }
  function sweep(id, ring, contour, level, select = () => true) {
    const n = ring.length;
    const normals = ring.map((p, i) => {
      const q = ring[(i + 1) % n],
        dx = q[0] - p[0],
        dz = q[1] - p[1],
        l = Math.hypot(dx, dz);
      return [dz / l, -dx / l];
    });
    const miters = normals.map((b, i) => {
      const a = normals[(i + n - 1) % n],
        den = 1 + a[0] * b[0] + a[1] * b[1];
      return [(a[0] + b[0]) / den, (a[1] + b[1]) / den];
    });
    for (let i = 0; i < n; i++) {
      const a = ring[i],
        b = ring[(i + 1) % n],
        ranges = select(a, b, i);
      if (!ranges) continue;
      for (const [start, end] of ranges === true ? [[0, 1]] : ranges) {
        const at = (t, [v, depth]) => {
          let m = normals[i];
          if (t === 0) m = miters[i];
          if (t === 1) m = miters[(i + 1) % n];
          return [
            a[0] + (b[0] - a[0]) * t + m[0] * depth,
            ceiling - v,
            a[1] + (b[1] - a[1]) * t + m[1] * depth,
          ];
        };
        const section = [
          ...contour,
          [contour.at(-1)[0], -5],
          [contour[0][0], -5],
        ];
        const aa = section.map((c) => at(start, c)),
          bb = section.map((c) => at(end, c));
        const key = `${id}-${i}-${start}`;
        section.forEach((_, j) => {
          let k = (j + 1) % section.length;
          face(`${key}-${j}`, [aa[j], bb[j], bb[k], aa[k]], level, id);
        });
        face(`${key}-end-a`, aa, level, id);
        face(`${key}-end-b`, [...bb].reverse(), level, id);
        bands.push({
          id: key,
          component: id,
          level,
          start: a,
          end: b,
          range: [start, end],
          contour,
        });
      }
    }
  }
  function archGap(lo, hi) {
    return (a, b) =>
      a[1] === 13790 && b[1] === 13790
        ? [
            [0, (a[0] - hi) / (a[0] - b[0])],
            [(a[0] - lo) / (a[0] - b[0]), 1],
          ]
        : true;
  }
  sweep(
    "upper-eave",
    upperFootprint,
    [
      [-130, 100],
      [-60, 100],
      [-60, 70],
      [0, 55],
      [172, 55],
    ],
    "upper",
    archGap(14280, 17870),
  );
  sweep(
    "upper-head",
    upperFootprint,
    [
      [468, 65],
      [538, 65],
      [640, 35],
    ],
    "upper",
    archGap(14280, 17870),
  );
  const ground = [
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
  ];
  sweep(
    "ground-head",
    ground,
    [
      [3726, 65],
      [3796, 65],
      [3898, 35],
    ],
    "lower",
    (a, b, i) =>
      ![0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].includes(i),
  );
  sweep(
    "photo-front-storey",
    upperFootprint,
    [
      [2783, 85],
      [2923, 85],
      [2923, 45],
      [2995, 45],
    ],
    "upper",
    (a, b, i) =>
      i === 4 ? archGap(14280, 17870)(a, b) : [2, 3, 5, 6].includes(i),
  );
  const garage = [
    [0, 6480],
    [6810, 6480],
    [6810, 12710],
    [6230, 12710],
    [6230, 13310],
    [0, 13310],
  ];
  const garageVisible = (a, b, i) => [0, 5].includes(i);
  sweep(
    "garage-eave",
    garage,
    [
      [3650, 100],
      [3720, 100],
      [3720, 70],
      [3822, 50],
    ],
    "lower",
    garageVisible,
  );
  sweep(
    "garage-frieze",
    garage,
    [
      [3822, 5],
      [4248, 5],
    ],
    "lower",
    garageVisible,
  );
  sweep(
    "garage-lintel",
    garage,
    [
      [4248, 65],
      [4318, 65],
      [4420, 35],
    ],
    "lower",
    garageVisible,
  );
  sweep(
    "photo-garage-fascia",
    garage,
    [
      [3650, 20],
      [3810, 20],
      [3810, 10],
      [4420, 10],
    ],
    "lower",
    (a, b, i) => i === 4,
  );
  const gutterRing = [
    [-120, 13430],
    [6350, 13430],
    [6350, 13490],
    [-120, 13490],
  ];
  const gutterStart = faces.length;
  sweep(
    "photo-garage-gutter",
    gutterRing,
    [
      [3630, 0],
      [3770, 0],
    ],
    "lower",
  );
  for (const face of faces.slice(gutterStart)) face.material = "gutter";
  const portico = [
    [14280, 13790],
    [17870, 13790],
    [17870, 16070],
    [14280, 16070],
  ];
  sweep(
    "portico-entablature",
    portico,
    [
      [2183, 65],
      [2253, 65],
      [2355, 35],
    ],
    "lower",
    (a, b, i) => i !== 0,
  );
  // Solid widened bases wrap all four portico piers, including the returns.
  for (const x of [14280, 17280])
    for (const z of [13790, 15480]) {
      const ring = [
        [x, z],
        [x + 590, z],
        [x + 590, z + 590],
        [x, z + 590],
      ];
      sweep(
        `photo-pier-base-${x}-${z}`,
        ring,
        [
          [5441, 70],
          [5591, 70],
          [5591, 40],
          [5621, 40],
          [5621, 50],
          [6041, 50],
        ],
        "lower",
      );
    }
  const bay = [
    [18720, 0],
    [22910, 0],
    [22910, 600],
    [18720, 600],
  ];
  sweep(
    "bay-eave",
    bay,
    [
      [2955, 70],
      [3025, 70],
      [3127, 35],
    ],
    "lower",
    (a, b, i) => i !== 2,
  );
  // Front paired sills are a stepped solid, recessed below each pane of glass.
  for (const [x1, x2, w1, w2, z] of [
    [6230, 9600, 6470, 8150, 12710],
    [10340, 13910, 10550, 12470, 13790],
    [18250, 21820, 18470, 20390, 13790],
    [22680, 26030, 22910, 24590, 12710],
  ]) {
    for (const y of [2183]) {
      const ring = [
        [x1, y - 85],
        [w1 - 20, y - 85],
        [w1 - 20, y + 20],
        [w1 + 1230, y + 20],
        [w1 + 1230, y - 85],
        [w2 - 20, y - 85],
        [w2 - 20, y + 20],
        [w2 + 1230, y + 20],
        [w2 + 1230, y - 85],
        [x2, y - 85],
        [x2, y + 170],
        [x1, y + 170],
      ];
      const id = `paired-sill-${x1}-${y}`,
        level = y < 3000 ? "upper" : "lower";
      const a = ring.map(([x, v]) => [x, ceiling - v, z - 5]),
        b = ring.map(([x, v]) => [x, ceiling - v, z + 70]);
      face(`${id}-front`, b, level, "paired-sill");
      face(`${id}-back`, [...a].reverse(), level, "paired-sill");
      ring.forEach((_, i) => {
        const j = (i + 1) % ring.length;
        face(`${id}-${i}`, [a[i], a[j], b[j], b[i]], level, "paired-sill");
      });
      bands.push({
        id,
        component: "paired-sill",
        level,
        ring,
        planeZ: z,
        projection: 70,
      });
    }
  }
  const photoOpenings = [];
  for (const w of photo.windows) {
    const inner = segmentalOpening(
      w.x,
      w.width,
      photo.sill,
      photo.head,
      photo.rise,
    );
    const t = photo.surroundWidth;
    const outer = segmentalOpening(
      w.x - t,
      w.width + 2 * t,
      photo.sill - 90,
      photo.head + t,
      photo.rise,
    );
    const rings = [outer, [...inner].reverse()];
    const z0 = w.z - 5,
      z1 = w.z + photo.surroundProjection;
    const id = `${w.id}-surround`;
    faces.push({
      id: `${id}-front`,
      rings: rings.map((r) => r.map(([x, y]) => [x, y, z1])),
      kind: "surround",
      material: "cornice",
      level: "lower",
      component: id,
    });
    faces.push({
      id: `${id}-back`,
      rings: rings.map((r) => [...r].reverse().map(([x, y]) => [x, y, z0])),
      kind: "surround",
      material: "cornice",
      level: "lower",
      component: id,
    });
    rings.forEach((r, ri) =>
      r.forEach(([x, y], i) => {
        const [xx, yy] = r[(i + 1) % r.length];
        face(
          `${id}-${ri}-${i}`,
          [
            [x, y, z0],
            [xx, yy, z0],
            [xx, yy, z1],
            [x, y, z1],
          ],
          "lower",
          id,
        );
      }),
    );
    photoOpenings.push({
      ...w,
      rise: photo.rise,
      head: photo.head,
      sill: photo.sill,
      ring: inner,
    });
  }
  // Sheet 5: two applied piers carry the upper arch's projecting eave caps.
  // The supplied side detail establishes a projecting shaft and returning bands.
  // 230 mm relief is estimated from the scan, not a dimensioned survey value.
  const pilasters = [14280, 17280].map((x, i) => ({
    id: `front-first-pilaster-${i === 0 ? "left" : "right"}`,
    x,
    z: 13790,
    width: 590,
    projection: photo.upperPierProjection,
    bottom: 3858,
    top: 5869,
    source:
      "Original PDF sheet 5, elevation 1: paired piers beside upper arched window; 230 mm relief estimated from supplied side-detail reference",
  }));
  for (const pier of pilasters) {
    const { x, z, width, projection, bottom, top, id } = pier;
    const perimeter = [
      [x, z],
      [x + width, z],
      [x + width, z + projection],
      [x, z + projection],
    ];
    const returns = (a, b, i) => i !== 0;
    sweep(
      `${id}-cap`,
      perimeter,
      [
        [-130, 100],
        [-60, 100],
        [-60, 70],
        [0, 55],
        [172, 55],
      ],
      "upper",
      returns,
    );
    sweep(
      `${id}-head-band`,
      perimeter,
      [
        [468, 65],
        [538, 65],
        [640, 35],
      ],
      "upper",
      returns,
    );

    const a = [
      [x, bottom, z - 5],
      [x + width, bottom, z - 5],
      [x + width, top, z - 5],
      [x, top, z - 5],
    ];
    const b = a.map(([xx, y]) => [xx, y, z + projection]);
    const rings = [[...a].reverse(), b];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      rings.push([a[i], a[j], b[j], b[i]]);
    }
    rings.forEach((ring, i) =>
      faces.push({
        id: `${id}-${i}`,
        rings: [ring],
        kind: "pilaster",
        material: "cornice",
        level: "upper",
        component: "upper-arch-pilasters",
        pilasterId: id,
      }),
    );
  }
  return {
    ceiling,
    upperFootprint,
    faces,
    bands,
    pilasters,
    photoOpenings,
    source: source + "; " + photo.source,
    assumptions:
      "Unchanged bands follow PDF courses. Upper pier relief estimated at 230 mm from the supplied side detail; caps and head bands return around the shafts. " +
      photo.assumptions,
  };
}
