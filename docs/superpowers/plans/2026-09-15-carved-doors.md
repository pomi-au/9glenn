# Carved Doors Implementation Plan

**Goal:** Make solid doors read as crafted, panelled doors with visible relief, using bump and matching normal maps in native WebGPU and Photo.

**Design:** Three stacked panel fields, recessed bevelled surrounds and fine routed grooves on both faces. Keep the existing leaf envelope, pivot, swing and generated wood colour. Use real closed geometry for the main carving depth and a separate whole-leaf UV channel for the finer height/normal detail, leaving metre-scale wood grain and its per-door variation intact.

**Architecture:** `door-relief.js` builds one closed mesh per leaf; `door-relief-material.js` creates height and matching normal maps with shared generated timber albedo/roughness. `build-model.js` replaces solid slab geometry and finishes material setup after UV variation. Main and comparison startup await the maps before rendering. Glass doors and frames retain their existing construction.

## Work

- [x] Geometry agent: build dimension-preserving closed relief geometry and deterministic geometry checks.
- [x] Material agent: create bounded, nonrepeating carved height/normal maps on UV1, including generated wood microdetail.
- [x] Primary: integrate geometry/materials, await texture readiness, package and document.
- [x] Visual agent: capture actual entrance/interior doors in Explore and Photo, verify relief maps, selection and opening.
- [x] Primary: review, run appropriate geometry/motion/Photo/browser checks, inspect images and commit the tested result.

The user's request authorizes this door design and implementation; existing parallel-agent and feature-branch preferences apply.
