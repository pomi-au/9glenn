# Tactile Materials Implementation Plan

**Goal:** Make interaction clearly visible and provide taller dense grass plus nonuniform generated architectural surfaces.

**Architecture:** Retain CPU-updated shared geometry for WebGPU exploration and path-traced snapshots. Strengthen existing damped spring/wave controllers, replace/extend the generated material catalog and apply bounded deterministic material/UV variants at object creation.

**Tech Stack:** Three.js native WebGPU, wavefront path tracing, built-in image generation, instanced grass, physical materials and native Chrome acceptance checks.

## Work
- [x] Primary: generate plaster-v2.png, door-oak-v2.png and floor-oak-v2.png, preserve originals and prompt provenance; integrate documentation/package/commit.
- [x] Materials agent: generate bark-v2.png and carpet-v2.png; update generated-textures.js, finish-variation.js and site/build material hooks; add physical relief and nonuniform variants.
- [x] Physics agent: raise/fill grass and strengthen grass/foliage/water response, preserving anchored roots, bounds and rest; update geometric/physics assertions.
- [x] Validation agent: add check_material_upgrade.cjs and current audit captures; measure visible strokes, loaded material maps, variant diversity and Photo resumption.
- [x] Primary: inspect closeups and live movement, resolve findings, run relevant existing regressions, rebuild portable assets, scan and commit on codex/webgpu-photorealism.

The user's detailed instruction authorizes implementation and parallel agents; no new execution approval is needed for this continuation.
