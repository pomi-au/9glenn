# Interactive Landscape Implementation Plan

**Goal:** Add physical grass and speed/direction-sensitive pointer interaction to grass, foliage and water.

**Architecture:** The main viewer maps pointer motion onto visible world surfaces. A scene-owned environment controller distributes impulses to grass/foliage spring states and the water wave field, updates real mesh transforms/vertices, and reports whether motion is still settling. Shared geometry supports both WebGPU exploration and path-traced snapshots.

**Tech Stack:** Three.js WebGPU, instanced geometry, stable damped spring and wave integration, native Chrome regression tests.

## Work
- [x] Grass agent: create grass-mesh.js with clipped lawn placement, graded roots, instancing, local spring response and diagnostics. Do not edit shared site-mesh.js; root integrates the helper.
- [x] Water/foliage agent: implement water-motion.js and foliage-motion.js with real geometry/instance updates; modify pool-mesh.js only where needed for the subdivided closed water volume.
- [x] Validation agent: review requirements, write independent physics/browser tests and test data, coordinate interfaces.
- [x] Primary: integrate build-model/site/viewer hooks, pointer raycasting and speed estimation, Photo settling/reset lifecycle and UI hint.
- [x] Run physical containment and native browser tests, inspect motion, update docs, build portable artifacts and commit on the existing feature branch.

The user supplied concrete behavior and has authorized ongoing implementation and parallel agents. The visual and interaction design above applies that request directly without a new execution-approval gate.

Final validation also corrected two water rendering defects: backfaces of the closed volume caused live refraction bands, and an exact water-bottom/basin-floor contact caused path-traced material-hit ties. Front-face live rendering and a hidden 2 mm overlap resolve them without changing the visible water level or swimming depth. Swimming navigation uses the explicit resting water level.
