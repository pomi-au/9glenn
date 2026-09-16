# Soil, paving and garage asphalt

**Goal:** Refine the existing site finishes to match the user's request for realistic soil, pavement and a tar approach to the garage.

**Design:** Keep shared footprints, gradients, building levels and planting. Change the driveway's source material to asphalt in the shared drawing data. Generate new flat colour textures for dark compact asphalt, brown garden loam and pale stone. Apply physical-scale colour, height, tangent-normal and roughness maps in native WebGPU and Photo. Model recessed paving joints in matching height/normal fields rather than relying on lines painted in the albedo. Retain the existing pool paving.

User approval is provided by this refinement request and the previously approved generated-texture/WebGPU direction. Parallel work separates image assets, site materials and native visual verification.

## Implementation

- [x] Inspect site-area clipping, physical UVs, grade and garage connection.
- [x] Change `scripts/site_spec.py` driveway to asphalt, including plan colour; rebuild shared drawings.
- [x] Generate and inspect `site-asphalt.png`, `site-soil.png`, `site-paving.png`, with exact prompts in `assets/textures/site-materials-manifest.json`.
- [x] Add physical source maps in `model/generated-textures.js`, region finishes in `model/site-surface-material.js`, and integrate `model/site-mesh.js` without changing footprints.
- [x] Await paving texture preparation in main and comparison viewers.
- [x] Verify graded surfaces, asphalt exclusion from grass/soil, walkability, paving joints and Photo material preservation.
- [x] Capture matched native before/after surface views and actual Photo exports in `audit/site-surfaces/`.
- [x] Rebuild standalone viewer and archive, document limitations, and commit the verified result.

## Acceptance

Garage approach is visibly charcoal asphalt with fine aggregate, not pale concrete. Soil has varied organic texture rather than a flat colour. Paving has legible, restrained recessed joints at 600 mm spacing and varied stone colour. New relief appears in Photo as well as Explore. Driveway top stays at −514 mm, aligns with the garage, and does not overlap paths, planting or building footprint. Textures remain artistic material estimates, not measured scans.
