import assert from "node:assert/strict";
import clipping from "polygon-clipping";
import { floorFinishGaps } from "../model/floor-finish-gaps.js";

const rectangle = (x, z, w, d) => [
  [x, z],
  [x + w, z],
  [x + w, z + d],
  [x, z + d],
];
const polygon = (...args) => [rectangle(...args)];
const oak = {
  id: "living",
  category: "living",
  pointsMm: rectangle(0, 0, 2500, 4000),
};
const tile = {
  id: "kitchen",
  category: "wet",
  pointsMm: rectangle(3500, 0, 2500, 2000),
};
const carpet = {
  id: "bed1",
  category: "living",
  pointsMm: rectangle(3500, 2000, 2500, 2000),
};
const opening = rectangle(2600, 2400, 200, 200);
const hole = rectangle(2600, 1000, 200, 200);
const guard = rectangle(2700, 2600, 150, 200);
const lower = polygon(2500, 3500, 1000, 500);
const wall = {
  polygon: polygon(2900, 0, 200, 4000),
  bands: [
    {
      bottom: 0,
      top: 2100,
      polygons: [polygon(2900, 0, 200, 1200), polygon(2900, 2200, 200, 1800)],
    },
    { bottom: 2100, top: 2700, polygons: [polygon(2900, 0, 200, 4000)] },
  ],
};
const floor = {
  id: "ground",
  slab: [polygon(0, 0, 6000, 4000), polygon(8000, 0, 2000, 2000)],
  rooms: [oak, tile, carpet],
  walls: [wall],
  holes: [hole],
  stairs: [{ opening }],
  lowerSlabs: [{ polygons: [lower], top: -514 }],
  stairFloorPatch: [polygon(2500, 3000, 100, 300)],
  source: {
    geometry: [{ id: "stair-outer-guard", panels: [{ points: guard }] }],
  },
};
const porch = [polygon(2500, 0, 1000, 300)];
const before = JSON.stringify(floor);
const result = floorFinishGaps(floor, porch);
const all = [...result.stair, ...result.circulation];
assert(all.length > 0);
assert.equal(
  JSON.stringify(floor),
  before,
  "Finishing does not modify structural/source geometry",
);
const covers = (x, z) =>
  clipping.intersection(all, polygon(x - 1, z - 1, 2, 2)).length > 0;
assert(
  covers(2700, 700),
  "Broad unassigned interior floor next to oak is finished",
);
assert(
  covers(3000, 1700),
  "Doorway threshold remains finishable inside the full wall footprint",
);
assert(
  covers(3300, 700),
  "Circulation connected through the threshold gets continuous oak",
);
for (const [x, z, label] of [
  [1000, 1000, "existing oak"],
  [4500, 1000, "existing kitchen tile"],
  [4500, 3000, "existing bedroom carpet"],
  [3000, 700, "solid wall"],
  [2700, 1100, "floor void"],
  [2700, 2500, "stair opening"],
  [2775, 2700, "stair guard"],
  [3000, 3700, "lower garage slab"],
  [3000, 150, "terracotta porch"],
  [9000, 1000, "unconnected exposed cement"],
])
  assert(!covers(x, z), `Never replace or bridge ${label}`);
assert(
  result.stair.length > 0,
  "Legacy stair-connected finish metadata can be retained",
);
assert.equal(
  clipping.difference(all, floor.slab).length,
  0,
  "No finish outside structural slab",
);
for (const excluded of [
  polygon(...[0, 0, 2500, 4000]),
  polygon(3500, 0, 2500, 2000),
  polygon(3500, 2000, 2500, 2000),
  [hole],
  [opening],
  [guard],
  lower,
  ...porch,
])
  assert.equal(
    clipping.intersection(all, excluded).length,
    0,
    "Patch is disjoint from every protected region",
  );
const upper = { ...floor, id: "first", stairFloorPatch: [] };
assert(
  floorFinishGaps(upper, porch).circulation.length > 0,
  "Upper interior circulation gets matching finish",
);
assert.deepEqual(
  floorFinishGaps({ ...floor, id: "cellar" }),
  { stair: [], circulation: [] },
  "Cellar exposed slab stays cement",
);
assert.deepEqual(
  floorFinishGaps({ ...floor, rooms: [tile, carpet] }),
  { stair: [], circulation: [] },
  "No blanket wood fill beside non-wood rooms",
);
console.log(
  "PASS floor gaps: oak-connected broad gaps and door thresholds covered; rooms, walls, voids, stairs, garage, porch, cellar and floor geometry preserved",
);
