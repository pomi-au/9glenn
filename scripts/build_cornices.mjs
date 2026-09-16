import fs from "node:fs";
import { buildCorniceAssembly } from "../model/cornice-assembly.js";
import { projectRoofs } from "../model/roof-assembly.js";
const { roofs, photo } = JSON.parse(fs.readFileSync(0, "utf8"));
const assembly = buildCorniceAssembly(photo);
const combined = {
  ...assembly,
  faces: [
    ...assembly.faces,
    ...roofs.faces.map((f) => ({ ...f, kind: "blocker" })),
  ],
};
process.stdout.write(
  JSON.stringify({
    assembly,
    projections: Object.fromEntries(
      ["front", "rear", "left", "right"].map((v) => [
        v,
        projectRoofs(combined, v),
      ]),
    ),
  }),
);
