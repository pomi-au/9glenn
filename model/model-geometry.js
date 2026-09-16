/* Converts the actual SVG/manifest used by the 2D viewer into a shared mm model. */
import polygonClipping from "polygon-clipping";
import { segmentalRadius } from "./segmental-arch.js";

export function pointsOf(node) {
  return (node.getAttribute("points") || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.split(",").map(Number));
}
export function rectangle(x, z, width, depth) {
  return [
    [x, z],
    [x + width, z],
    [x + width, z + depth],
    [x, z + depth],
  ];
}
export function bounds(points) {
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}
function area(points) {
  return (
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
export function offsetRing(points, inset) {
  const sign = Math.sign(area(points));
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % points.length],
      dx = q[0] - p[0],
      dz = q[1] - p[1],
      length = Math.hypot(dx, dz);
    return {
      p: [
        p[0] - ((sign * dz) / length) * inset,
        p[1] + ((sign * dx) / length) * inset,
      ],
      d: [dx, dz],
    };
  });
  return lines.map((b, i) => {
    const a = lines[(i + lines.length - 1) % lines.length];
    const cross = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    if (Math.abs(cross) < 1e-7) return b.p;
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / cross;
    return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t];
  });
}
function transformedRect(node) {
  const ancestry = [];
  let parent = node;
  while (parent?.tagName !== "svg" && parent) {
    ancestry.unshift(parent);
    parent = parent.parentElement;
  }
  let matrix = new DOMMatrix();
  for (const ancestor of ancestry) {
    const transform = ancestor.getAttribute("transform") || "";
    for (const match of transform.matchAll(
      /(translate|rotate|scale|matrix)\(([^)]+)\)/g,
    )) {
      const a = match[2].trim().split(/[ ,]+/).map(Number);
      if (match[1] === "translate") matrix = matrix.translate(a[0], a[1] || 0);
      if (match[1] === "rotate") matrix = matrix.rotate(a[0]);
      if (match[1] === "scale") matrix = matrix.scale(a[0], a[1] ?? a[0]);
      if (match[1] === "matrix") matrix = matrix.multiply(new DOMMatrix(a));
    }
  }
  const ring = rectangle(
    +node.getAttribute("x"),
    +node.getAttribute("y"),
    +node.getAttribute("width"),
    +node.getAttribute("height"),
  );
  return ring.map(([x, z]) => {
    const p = new DOMPoint(x, z).matrixTransform(matrix);
    return [p.x, p.y];
  });
}
function elevationOpening(window, floor, drawings) {
  const first = floor.id === "first";
  const spec = globalThis.BUILDING_SPEC;
  const fullHeight = spec.groundCeiling + spec.floorZone + spec.upperCeiling;
  const photoOpening = drawings
    .find((d) => d.id === "elevation-1")
    .geometry.find((g) => g.photoOpeningId === window.id);
  if (photoOpening && floor.id === "ground")
    return {
      sill: fullHeight - photoOpening.y - photoOpening.height,
      head: fullHeight - photoOpening.y,
      arch: true,
      segmentRise: photoOpening.segmentRise,
      archTrim: false,
      heightSource: "Photographed shallow arch; PDF outer opening envelope",
    };
  if (window.assembly) {
    const elevation = drawings.find((d) =>
      d.geometry.some(
        (g) => g.type === "elevation-window" && g.assembly === window.assembly,
      ),
    );
    const panes = elevation?.geometry.filter(
      (g) => g.type === "elevation-window" && g.assembly === window.assembly,
    );
    if (panes?.length) {
      const min = Math.min(...panes.map((p) => p.x));
      const max = Math.max(...panes.map((p) => p.x + p.width));
      const mirrored = ["elevation-3", "elevation-4"].includes(elevation.id);
      const scale = window.length / (max - min);
      const parts = panes.map((pane) => ({
        offset: (mirrored ? max - pane.x - pane.width : pane.x - min) * scale,
        length: pane.width * scale,
        sill: Math.max(0, fullHeight - pane.y - pane.height),
        head: fullHeight - pane.y,
        paneKind: pane.kind,
        heightSource: elevation.id,
      }));
      return {
        sill: Math.min(...parts.map((p) => p.sill)),
        head: Math.max(...parts.map((p) => p.head)),
        heightSource: elevation.id,
        parts,
      };
    }
  }
  const feature = drawings
    .find((d) => d.id === "elevation-1")
    .geometry.find(
      (g) =>
        g.type === "arch" && Math.abs(g.x - window.x - floor.offset[0]) < 1,
    );
  if (feature && first)
    return {
      sill: floor.height - feature.bottom,
      head: floor.height - feature.spring + feature.radius,
      arch: true,
      archProfile: feature,
      heightSource: "Shared front elevation arch",
    };
  if (floor.id === "ground" && window.id === "entry-glazing") {
    const entrance = drawings
      .find((d) => d.id === "elevation-1")
      .geometry.find((g) => g.type === "arch" && g.bottom > 5000);
    return {
      sill: 0,
      head: fullHeight - entrance.spring + entrance.radius,
      arch: true,
      archProfile: entrance,
      archTrim: false,
      heightSource: "Front elevation arched entry fanlight",
    };
  }
  const wx = window.x + floor.offset[0],
    wz = window.y + floor.offset[1];
  let elevation, projected;
  if (window.axis === "h" && window.y > floor.bounds.maxZ * 0.65) {
    elevation = "elevation-1";
    projected = wx;
  } else if (window.axis === "h" && window.y < 1500) {
    elevation = "elevation-3";
    projected = floor.referenceWidth - wx - window.length;
  } else if (window.axis === "v" && window.x > floor.bounds.maxX - 250) {
    elevation = "elevation-4";
    projected = floor.referenceDepth - wz - window.length;
  } else if (
    window.axis === "v" &&
    (window.x < 250 || window.id === "bay-west")
  ) {
    elevation = "elevation-2";
    projected = wz - 600;
  } else if (window.id === "bay-east") {
    elevation = "elevation-4";
    projected = floor.referenceDepth - wz - window.length;
  }
  // Recessed rear openings (garage/gallery/bathroom) do not sit on the
  // global rear boundary. Resolve their registered elevation rectangle too,
  // rather than falling back to a generic head height because of plan depth.
  const candidates =
    window.axis === "h"
      ? [
          ["elevation-1", wx],
          ["elevation-3", floor.referenceWidth - wx - window.length],
        ]
      : [
          ["elevation-2", wz - 600],
          ["elevation-4", floor.referenceDepth - wz - window.length],
        ];
  if (elevation) candidates.unshift([elevation, projected]);
  let match;
  for (const [id, position] of candidates) {
    match = drawings
      .find((d) => d.id === id)
      ?.geometry.find(
        (g) =>
          g.type === "elevation-window" &&
          Math.abs(g.x - position) < 5 &&
          Math.abs(g.width - window.length) < 5 &&
          (first
            ? g.y < floor.height
            : g.y > spec.upperCeiling + spec.floorZone),
      );
    if (match) {
      elevation = id;
      break;
    }
  }
  if (match) {
    const head = (first ? floor.height : fullHeight) - match.y;
    return {
      sill: Math.max(0, head - match.height),
      head,
      heightSource: elevation,
    };
  }
  if (window.length >= 2600)
    return {
      sill: 0,
      head: spec.openingHead,
      heightSource: "inferred glazing profile",
    };
  const courses = Number(window.code?.match(/^\d+/)?.[0]);
  const height = Math.min(
    spec.openingHead,
    ((courses || 16) * spec.groundCeiling) / 36,
  );
  return {
    sill: spec.openingHead - height,
    head: spec.openingHead,
    heightSource: "window notation / inferred sill",
  };
}
function intersects(a, b) {
  return (
    a.minX < b.maxX - 0.01 &&
    a.maxX > b.minX + 0.01 &&
    a.minZ < b.maxZ - 0.01 &&
    a.maxZ > b.minZ + 0.01
  );
}
function rectWindowDistance(mask, window) {
  const centre =
    window.axis === "h"
      ? [window.x + window.length / 2, window.y]
      : [window.x, window.y + window.length / 2];
  const box = bounds(mask);
  return Math.hypot(
    (box.minX + box.maxX) / 2 - centre[0],
    (box.minZ + box.maxZ) / 2 - centre[1],
  );
}
export function parseBuilding(drawings) {
  drawings = drawings.map((d) => window.DrawingModel.resolve(d));
  const spec = globalThis.BUILDING_SPEC;
  const ground = drawings.find((d) => d.id === "ground"),
    first = drawings.find((d) => d.id === "first");
  const rearG = ground.geometry.find((g) => g.id === "rear-main"),
    rearF = first.geometry.find((g) => g.id === "rear");
  const section = drawings.find((d) => d.id === "section");
  const height = (name) => section.checks.find((c) => c.name === name).actual;
  const groundHeight = height("Ground ceiling"),
    floorZone = height("Floor zone"),
    firstHeight = height("Upper ceiling"),
    cellarHeight = height("Cellar clearance");
  const parsed = drawings
    .filter((d) => d.kind === "plan")
    .map((d) => {
      const svg = d.document;
      const outline = pointsOf(svg.querySelector('[data-layer="base"] .shell'));
      return {
        id: d.id,
        title: d.title,
        source: d,
        svg,
        outline,
        bounds: bounds(outline),
        offset: [0, 0],
        base: 0,
        height: groundHeight,
        walls: [],
        cuts: [],
        rooms: d.rooms,
      };
    });
  const floorG = parsed.find((f) => f.id === "ground"),
    floorF = parsed.find((f) => f.id === "first"),
    floorC = parsed.find((f) => f.id === "cellar");
  floorF.offset = [rearG.x - rearF.x, rearG.y - rearF.y];
  floorF.base = groundHeight + floorZone;
  floorF.height = firstHeight;
  const stair = ground.geometry.find((g) => g.type === "stair");
  const recess = floorC.source.geometry.find((g) => g.id === "stair-recess");
  const cellarStair = floorC.source.geometry.find(
    (g) => g.id === "cellar-stair",
  );
  const accessWall = ground.geometry.find((g) => g.id === "under-stair-north");
  floorC.offset = [
    stair.x - recess.x,
    accessWall.y - cellarStair.registration.landingStart[1],
  ];
  floorC.base = -cellarHeight - floorZone;
  floorC.height = cellarHeight;
  // Resolve every route from section floor datums, independently of plan labels.
  for (const floor of parsed) {
    floor.stairs = floor.source.geometry
      .filter((g) => g.type === "stair" || g.type === "stair-treads")
      .filter((g) => g.fromFloor === floor.id || g.fromFloor === "garage")
      .map((g) => {
        const from = g.fromFloor === "garage" ? -spec.garageDrop : floor.base;
        const to = parsed.find((f) => f.id === g.toFloor).base;
        const rise = (to - from) / g.risers;
        return {
          ...g,
          bottom: from - floor.base,
          top: to - floor.base,
          rise,
          treads: g.treads.map((t) => ({
            ...t,
            elevation: from - floor.base + t.level * rise,
          })),
        };
      });
  }
  for (const floor of parsed) {
    floor.referenceWidth = floorG.bounds.maxX;
    floor.referenceDepth = floorF.bounds.maxZ + floorF.offset[1];
    for (const rect of floor.svg.querySelectorAll(
      '[data-layer="walls"] rect[data-wall]',
    )) {
      const ring = transformedRect(rect);
      const id = rect.getAttribute("data-wall");
      floor.walls.push({
        id,
        polygon: [ring],
        bounds: bounds(ring),
        height: id.startsWith("portico-")
          ? spec.porticoSideEaves
          : id.startsWith("garage-")
            ? spec.garageEaves
            : ["void-north", "void-east"].includes(id)
              ? spec.inferredGuardHeight
              : floor.height,
        source: "SVG wall rectangle",
      });
    }
    for (const polygon of floor.svg.querySelectorAll(
      '[data-layer="walls"] polygon.wall-solid',
    )) {
      const ring = pointsOf(polygon);
      floor.walls.push({
        id: "chamfer",
        polygon: [ring],
        bounds: bounds(ring),
        height: floor.height,
        source: "SVG wall polygon",
      });
    }
    const shell = floor.svg.querySelector('[data-layer="walls"] polygon.walls');
    if (shell) {
      const ring = pointsOf(shell),
        thickness = +shell.getAttribute("stroke-width") / 2;
      floor.walls.push({
        id: "perimeter",
        polygon: [ring, offsetRing(ring, thickness)],
        bounds: bounds(ring),
        height: floor.height,
        source: "SVG clipped perimeter stroke",
      });
    }
    const windows = floor.source.geometry.filter((g) => g.type === "window");
    let maskIndex = 0;
    for (const rect of floor.svg.querySelectorAll(
      '[data-layer="openings"] rect[fill="#fff"]',
    )) {
      const ring = transformedRect(rect),
        box = bounds(ring);
      const window = windows.find((w) => rectWindowDistance(ring, w) < 2);
      const cut = {
        id: `mask-${maskIndex++}`,
        ring,
        bounds: box,
        sill: 0,
        head: spec.openingHead,
        kind: "passage",
      };
      if (floor.id === "ground" && box.maxX < 6231 && box.minZ > 13000)
        cut.sill = -spec.garageDrop;
      if (window) {
        Object.assign(cut, elevationOpening(window, floor, drawings));
        cut.kind = "window";
        cut.window = window;
        cut.id = window.id;
        if (cut.parts) {
          cut.parts = cut.parts.map((part, index) => {
            const horizontal = window.axis === "h";
            const ring = rectangle(
              box.minX + (horizontal ? part.offset : 0),
              box.minZ + (horizontal ? 0 : part.offset),
              horizontal ? part.length : box.maxX - box.minX,
              horizontal ? box.maxZ - box.minZ : part.length,
            );
            return {
              ...part,
              id: `${cut.id}-pane-${index}`,
              ring,
              bounds: bounds(ring),
            };
          });
        }
      }
      const doorId = rect.parentElement.getAttribute("data-door");
      if (doorId) {
        cut.kind = "door";
        cut.door = floor.source.geometry.find(
          (g) => g.type === "door" && g.id === doorId,
        );
        if (cut.door) cut.id = cut.door.id;
      }
      const porticoWall = floor.walls.find(
        (w) => w.id.startsWith("portico-") && intersects(w.bounds, box),
      );
      if (porticoWall && cut.kind === "passage") {
        const elevation = drawings.find(
          (d) =>
            d.id ===
            (porticoWall.id === "portico-front"
              ? "elevation-1"
              : "elevation-2"),
        );
        const arch = elevation.geometry.find(
          (g) => g.type === "arch" && g.bottom > 5000,
        );
        if (arch) {
          cut.arch = true;
          cut.archProfile = arch;
          cut.head =
            groundHeight + floorZone + firstHeight - arch.spring + arch.radius;
        }
      }
      floor.cuts.push(cut);
    }
    // Subtract the exact SVG opening footprints at each height band. Windows leave
    // their real sill/lintel; doors and open passages start at floor level.
    for (const wall of floor.walls) {
      wall.cuts = floor.cuts
        .flatMap((c) => c.parts || [c])
        .filter((c) => intersects(c.bounds, wall.bounds));
      const bands = [
        0,
        wall.height,
        ...wall.cuts.flatMap((c) => [
          Math.max(0, c.sill),
          Math.min(wall.height, c.head),
        ]),
      ].filter((y) => y >= 0 && y <= wall.height);
      const levels = [...new Set(bands)].sort((a, b) => a - b);
      wall.bands = [];
      for (let i = 0; i < levels.length - 1; i++) {
        const bottom = levels[i],
          top = levels[i + 1];
        if (top - bottom < 0.01) continue;
        const active = wall.cuts.filter(
          (c) => c.sill < top - 0.01 && c.head > bottom + 0.01,
        );
        const polygons = active.length
          ? polygonClipping.difference(
              wall.polygon,
              ...active.map((c) => [c.ring]),
            )
          : [wall.polygon];
        if (polygons.length) wall.bands.push({ bottom, top, polygons });
      }
    }
    floor.holes = [];
    if (floor.id === "first") {
      const voidRoom = floor.rooms.find((r) => r.id === "void");
      if (voidRoom) floor.holes.push(voidRoom.pointsMm);
    }
    if (floor.id === "first")
      floor.holes.push(
        floor.source.geometry.find((g) => g.id === "stair").opening,
      );
    if (floor.id === "ground") {
      // Only the descending cellar route penetrates the ground slab. Its upper
      // landing remains part of the ground floor behind the access door.
      for (const tread of floorC.stairs[0].treads) {
        const clearance = -floorZone - (floorC.base + tread.elevation);
        if (clearance < spec.inferredStairHeadroom)
          floor.holes.push(
            tread.points.map(([x, z]) => [
              x + floorC.offset[0],
              z + floorC.offset[1],
            ]),
          );
      }
      // The room floor must meet the outside face of the curved stair wall.
      // The old rectangular cellar cut left exposed wedges outside that wall.
      const main = floor.stairs.find((s) => s.id === "stair");
      const outerGuard = floor.source.geometry.find(
        (g) => g.id === "stair-outer-guard",
      );
      const enclosure = polygonClipping.union(
        [main.opening],
        ...outerGuard.panels.map((p) => [p.points]),
      );
      const originalOpening = polygonClipping.union(
        ...floor.holes.map((r) => [r]),
      );
      const opening = polygonClipping.intersection(originalOpening, enclosure);
      floor.stairFloorPatch = polygonClipping.difference(
        originalOpening,
        opening,
      );
      floor.holes = opening.map((polygon) => polygon[0]);
    }
    floor.slab = polygonClipping.difference(
      [floor.outline],
      ...floor.holes.map((r) => [r]),
    );
    floor.lowerSlabs = [];
    if (floor.id === "ground") {
      const garage = floor.rooms.find((r) => r.id === "garage");
      const gb = bounds(garage.pointsMm);
      const footprint = rectangle(
        gb.minX - 90,
        gb.minZ - 230,
        gb.maxX - gb.minX + 180,
        gb.maxZ - gb.minZ + 460,
      );
      // Preserve the gallery-level vestibule beyond the last tread.
      const vestibule = rectangle(gb.maxX, gb.minZ - 230, 90, 1410);
      const region = polygonClipping.difference([footprint], [vestibule]);
      const polygons = polygonClipping.intersection(floor.slab, region);
      floor.lowerSlabs.push({ id: "garage", polygons, top: -spec.garageDrop });
      floor.slab = polygonClipping.difference(floor.slab, region);
      for (const wall of floor.walls) {
        const lower = polygonClipping.intersection(wall.polygon, region);
        const cuts = wall.cuts.filter((c) => c.sill < 0).map((c) => [c.ring]);
        if (lower.length)
          wall.bands.unshift({
            bottom: -spec.garageDrop,
            top: 0,
            polygons: cuts.length
              ? polygonClipping.difference(lower, ...cuts)
              : lower,
          });
      }
    }
  }
  // The ground slab already closes the floor zone above the cellar walls.
  // Extend walls only where the stair opening removes that slab; overlapping
  // the solid slab creates coplanar wall caps visible through the ground floor.
  const groundSlabInCellar = floorG.slab.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, z]) => [x - floorC.offset[0], z - floorC.offset[1]]),
    ),
  );
  for (const wall of floorC.walls) {
    const exposed = polygonClipping.difference(
      wall.polygon,
      groundSlabInCellar,
    );
    if (exposed.length) {
      wall.bands.push({
        bottom: floorC.height,
        top: -floorC.base,
        polygons: exposed,
      });
      wall.height = -floorC.base;
    }
  }
  // Above ground, the inner return meets the underside of the main stair.
  // Clip each closure to its actual overhead tread so it cannot obstruct that
  // stair or become an invented full-height partition across the ground floor.
  const mainRoute = floorG.stairs.find((s) => s.id === "stair");
  for (const wall of floorC.walls.filter((w) =>
    w.id.startsWith("cellar-stair-inner-"),
  )) {
    const worldPolygon = wall.polygon.map((ring) =>
      ring.map(([x, z]) => [x + floorC.offset[0], z + floorC.offset[1]]),
    );
    const bands = mainRoute.treads.flatMap((tread) => {
      const top = Math.max(
        0,
        tread.elevation - mainRoute.rise - spec.inferredStairThickness,
      );
      const polygons = polygonClipping.intersection(worldPolygon, [
        tread.points,
      ]);
      return top > 0 && polygons.length ? [{ bottom: 0, top, polygons }] : [];
    });
    if (bands.length)
      floorG.walls.push({
        id: wall.id + "-closure",
        polygon: worldPolygon,
        bounds: bounds(worldPolygon[0]),
        height: Math.max(...bands.map((b) => b.top)),
        cuts: [],
        bands,
        source: "Shared cellar SVG enclosure, closed to main stair underside",
      });
  }
  return {
    floors: parsed,
    width: floorG.bounds.maxX - floorG.bounds.minX,
    depth: floorG.bounds.maxZ - floorG.bounds.minZ,
    groundHeight,
    firstHeight,
    floorZone,
    cellarHeight,
    roofHeight: floorF.base + floorF.height,
    roofPitch: spec.roofPitch,
    spec,
    drawings,
  };
}
export function wallContains(wall, x, z, height) {
  function inRing(ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > z !== b[1] > z &&
        x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  }
  if (wall.cuts.some((c) => c.arch)) {
    if (
      height <= 0 ||
      height >= wall.height ||
      !inRing(wall.polygon[0]) ||
      wall.polygon.slice(1).some(inRing)
    )
      return false;
    return !wall.cuts.some((c) => {
      if (height <= c.sill || height >= c.head || !inRing(c.ring)) return false;
      if (!c.arch) return true;
      const horizontal =
        c.bounds.maxX - c.bounds.minX > c.bounds.maxZ - c.bounds.minZ;
      if (c.segmentRise) {
        const width = horizontal
          ? c.bounds.maxX - c.bounds.minX
          : c.bounds.maxZ - c.bounds.minZ;
        const centre = horizontal
          ? (c.bounds.minX + c.bounds.maxX) / 2
          : (c.bounds.minZ + c.bounds.maxZ) / 2;
        const radius = segmentalRadius(width, c.segmentRise),
          u = horizontal ? x : z;
        return (
          height <
          c.head -
            radius +
            Math.sqrt(Math.max(0, radius * radius - (u - centre) ** 2))
        );
      }
      const radius =
        c.archProfile?.radius ??
        (horizontal
          ? c.bounds.maxX - c.bounds.minX
          : c.bounds.maxZ - c.bounds.minZ) / 2;
      const spring = c.head - radius;
      if (height <= spring) return true;
      const u = horizontal ? x : z,
        centre = horizontal
          ? (c.bounds.minX + c.bounds.maxX) / 2
          : (c.bounds.minZ + c.bounds.maxZ) / 2;
      return (u - centre) ** 2 + (height - spring) ** 2 < radius ** 2;
    });
  }
  return wall.bands.some(
    (b) =>
      height > b.bottom &&
      height < b.top &&
      b.polygons.some((p) => inRing(p[0]) && !p.slice(1).some(inRing)),
  );
}
