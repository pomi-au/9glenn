# Roof Detail Implementation Plan

**Goal:** Give the pastel roof visible tile construction, capped hips/ridges and finished eaves.

**Architecture:** Extract the existing inferred hip envelope into `model/roof-mesh.js`; keep footprints, pitch, elevation and roof groups intact. Add surface-aligned procedural tile maps, shared-edge cap meshes and fascia strips in that module. The maps are generated locally for offline viewing.

- [x] Generate staggered tile color and relief maps with a consistent tile scale on every slope.
- [x] Retain the existing clipped roof faces; add upward normals, UVs, joint caps and fascia.
- [x] Rebuild and package the viewer; run geometry and browser regressions.
- [x] Inspect whole-building and close roof views; document the inferred detail dimensions.
