# WebGPU Photorealism Implementation Plan

**Goal:** Upgrade the architectural viewer to WebGPU throughout, including progressive path tracing and generated textures.

**Architecture:** Shared Three.js scene data feeds a WebGPU exploration renderer and WebGPU path tracer. Rendering state, physical materials and secondary views have separate owners, allowing the user-requested parallel implementation.

**Tech Stack:** Three.js WebGPU/TSL, upstream WebGPU path-tracer integration, esbuild, generated raster textures, browser regression tests.

## 1. Preserve baseline
- [x] Scan source files for secrets, commit the full current project and create `codex/webgpu-photorealism`.

## 2. Path tracing (rendering agent)
- [x] Inspect and pin an upstream WebGPU implementation; own dependency updates and `model/photo-renderer.js`.
- [x] Expose asynchronous creation and scene/camera invalidation, sample rendering, resize, progress and cleanup to the viewer.
- [x] Verify real WebGPU compute execution on a small scene before full-scene integration.

## 3. Materials (texture agent)
- [x] Generate project-bound seamless architectural textures with built-in image generation; record prompts and paths.
- [x] Own `model/finish-materials.js`, new material helpers, and material integration in `model/build-model.js`, `model/site-mesh.js`, `model/pool-mesh.js`.
- [x] Preserve physical UV scale and use realistic glass/water parameters; validate texture loading.

## 4. Secondary views (view agent)
- [x] Review the design for omissions, then migrate `model/triple-view.js` and `model/roof-comparison.js` to explicit WebGPU initialization.
- [x] Keep comparison alignment and clipping working; remove all live WebGL renderers from these paths.

## 5. Main viewer (primary agent)
- [x] Own `model/viewer-3d.js`, `model/selection-outline.js`, new shared WebGPU setup, styling and packaging integration.
- [x] Add Explore/Photo selection, progress, motion/reset handling, export and unsupported-device state.
- [x] Migrate clipping/selection; verify async initialization, route switching and tour behavior.

## 6. Verify and deliver
- [x] Build bundles; run geometry tests and focused browser tests using the native GPU.
- [x] Inspect exterior/interior captures and fix GPU/material errors.
- [x] Simplify changed code, update README, rebuild portable artifacts and report actual results.

The user authorized immediate implementation and parallel agents. Proceed in this task without another execution-choice prompt.

## Verified outcome

Native Apple/Metal WebGPU reached min/mean/max 128 samples with no browser or GPU errors. Photo camera reset, resize, export and return to cutaway passed. Main 3D, comparison, tour, pool, swimming and landscape regressions passed. Snapshot/lifecycle, roof, cornice and door-motion checks passed. Generated texture prompts and the experimental backend/performance limits are documented in the README and asset manifest.
