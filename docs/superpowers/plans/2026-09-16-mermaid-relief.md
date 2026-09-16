# Mermaid relief refinement

**Goal:** Improve the approved green-bronze mermaid's face, body and scales in live WebGPU and Photo.

**Design:** Retain the reference pose and fountain hydraulics. Geometry supplies anatomical silhouette, cheeks, nose, lips, clavicles and smoothly tapering limbs. Region-specific height fields supply fine cast-bronze grain on the face/body and staggered overlapping scales on the tail. Matching tangent normal maps carry this relief into the path tracer, which does not consume bump maps alone. The existing ChatGPT-generated bronze supplies restrained nonuniform colour; colour noise must not define anatomy.

The user requested this refinement to the approved sculpture, authorizing implementation. Continue parallel geometry, material and native visual verification work on the current feature branch.

## Work

- [x] Refine `model/fountain-sculpture.js`: facial planes and smoother torso/limb profiles; remove conflicting sinusoidal tail bumps.
- [x] Add `model/fountain-relief.js`: periodic physically scaled height and normal maps, mipmapped and shared by region.
- [x] Route face/body/tail materials through `model/fountain-material.js` and `model/pool-mesh.js`.
- [x] Reduce bronze albedo contrast in `model/generated-textures.js` so highlights reveal anatomical form.
- [x] Check periodic seams, normal vectors, regional material routing and Photo preservation.
- [x] Capture matched before/after face, tail and full sculpture in native WebGPU; check Photo accumulation and runtime errors.
- [x] Rebuild the standalone viewer and portable archive, document results and commit.

## Acceptance

Scale borders must respond to light in both modes. Face and torso must stay smooth at normal viewing distance while retaining subtle cast grain close up. All maps must have finite bounded normals and repeat without discontinuities. Pose, pedestal, shell outlet and stream contact stay fixed. Be explicit that this is procedural sculpture, not a scanned anatomical asset.
