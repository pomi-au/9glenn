# Isometric Art Style Implementation Plan

**Goal:** Apply the supplied illustration's colorful, matte isometric presentation to the existing building viewer.

**Architecture:** Keep all source geometry and model interactions intact. Change the shared materials in `model/build-model.js` and the background, light and default camera in `model/viewer-3d.js`; rebuild the offline deliverables.

**Tech Stack:** Three.js, esbuild, existing browser acceptance checks.

- [x] Set peach walls, coral roofs, cream floors, turquoise wet areas and glazing, deep teal frames and golden doors. Use matte materials with no metallic highlights.
- [x] Set a blush background gradient, balanced ambient light, soft directional shadows and a true isometric default direction `[1, 1, 1]`.
- [x] Update README presentation notes, build the 3D bundle and repackage the offline HTML/ZIP.
- [x] Run the existing 3D acceptance suite and inspect its whole-building, cutaway and mobile screenshots. Refine only presentation if required.
