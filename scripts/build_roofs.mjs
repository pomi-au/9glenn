import fs from "node:fs";
import {
  buildRoofAssembly,
  projectRoofs,
  sectionRoofs,
} from "../model/roof-assembly.js";
const spec = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const assembly = buildRoofAssembly(spec);
const projections = Object.fromEntries(
  ["front", "rear", "left", "right", "plan"].map((v) => [
    v,
    projectRoofs(assembly, v),
  ]),
);
process.stdout.write(
  JSON.stringify({ assembly, projections, section: sectionRoofs(assembly) }),
);
