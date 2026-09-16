import clipping from "polygon-clipping";

const NON_OAK = new Set([
  "study",
  "garage",
  "kitchen",
  "laundry",
  "bath1",
  "bath2",
  "ensuite",
  "wc1",
  "powder",
]);

function oakRoom(room) {
  return (
    room.pointsMm?.length &&
    room.category !== "void" &&
    room.category !== "wet" &&
    !/^bed[1-5]$/.test(room.id) &&
    !NON_OAK.has(room.id)
  );
}

// Polygon intersections discard shared edges. A 1mm-wide edge strip recognizes
// adjacency without depending on vertex ordering or filling unrelated slab.
function boundaryStrips(ring) {
  return ring
    .map((a, i) => {
      const b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      if (length < 1e-6) return null;
      const nx = -dz / length,
        nz = dx / length;
      return [
        [
          [a[0] + nx, a[1] + nz],
          [b[0] + nx, b[1] + nz],
          [b[0] - nx, b[1] - nz],
          [a[0] - nx, a[1] - nz],
        ],
      ];
    })
    .filter(Boolean);
}

/** Find only unassigned circulation/threshold finishes connected to existing oak.
 * All coordinates remain source millimetres; structural slab geometry is untouched.
 */
export function floorFinishGaps(floor, porch = []) {
  if (!["ground", "first"].includes(floor.id))
    return { stair: [], circulation: [] };
  const rooms = floor.rooms.filter((room) => room.pointsMm?.length);
  const oak = rooms.filter(oakRoom);
  if (!oak.length) return { stair: [], circulation: [] };
  const occupiedWalls = floor.walls.flatMap((wall) =>
    wall.bands
      ? wall.bands
          .filter((band) => band.bottom < 4 && band.top > 1)
          .flatMap((band) => band.polygons)
      : [wall.polygon],
  );
  const guard = floor.source.geometry.find(
    (item) => item.id === "stair-outer-guard",
  );
  const excluded = [
    ...rooms.map((room) => [room.pointsMm]),
    ...porch,
    ...occupiedWalls,
    ...(floor.holes || []).map((ring) => [ring]),
    ...(floor.stairs || [])
      .filter((stair) => stair.opening?.length)
      .map((stair) => [stair.opening]),
    ...(guard?.panels || []).map((panel) => [panel.points]),
    ...(floor.lowerSlabs || []).flatMap((slab) => slab.polygons),
  ];
  const unassigned = clipping.difference(floor.slab, ...excluded);
  const edges = oak.flatMap((room) => boundaryStrips(room.pointsMm));
  const connected = unassigned.filter((polygon) =>
    edges.some((edge) => clipping.intersection([polygon], edge).length),
  );
  const result = { stair: [], circulation: [] };
  for (const polygon of connected) {
    const nearStair =
      floor.stairFloorPatch?.length &&
      clipping.intersection([polygon], floor.stairFloorPatch).length;
    result[nearStair ? "stair" : "circulation"].push(polygon);
  }
  return result;
}
