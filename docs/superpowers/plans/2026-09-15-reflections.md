# Reflection Fix Implementation Plan

**Goal:** Correct pool/window live reflections and close physical glazing while preserving native WebGPU and path-traced Photo mode.

**Architecture:** Shared planar capture manager installed through selection rendering. Original physical materials remain in a WeakMap for Photo snapshots. Separate geometry work adds closed panes and optical metadata. User-approved parallel agents own independent files.

**Tech Stack:** Three.js r185 WebGPU, TSL node materials, mirrored-camera render targets, wavefront path tracer, native Chrome tests.

## Tasks

- [x] Optics agent: implement `model/planar-optics.js` with camera reflection, clipping, coplanar grouping, Fresnel transparent composition, wave-normal UV distortion, and full state restoration/disposal.
- [x] Geometry agent: fix glazing in `model/build-model.js`, tag optical planes and validate closure/thickness/outline preservation in `scripts/check_glazing.mjs`.
- [x] Primary: integrate manager in `model/selection-outline.js`; expose diagnostics and restore physical materials in every `model/photo-scene.js` cloning path. Add snapshot regression coverage for clear and clipped panes.
- [x] Visual agent: capture baseline and final controlled reflection tests in `scripts/check_reflections.cjs` and `audit/reflections/`, including offscreen reflected objects, both camera types, pool and windows, Photo and GPU errors.
- [x] Primary: review implementation, resolve browser findings, run geometry/physics/Photo/selection checks, document practical live approximation, rebuild portable viewer/package, scan changed text and commit.

The user's “fix them” approves the previously described fix; existing parallel-agent and feature-branch preferences remain active.
