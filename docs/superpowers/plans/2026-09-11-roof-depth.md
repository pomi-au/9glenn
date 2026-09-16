# Roof Depth Implementation Plan

**Goal:** Correct every roof's shape, depth and projection against the PDF in the drawings and 3D model.

**Architecture:** Shared polygon assembly with planar height functions, clipped intersections, orthographic visibility and section cuts. Python drawing generation reads the Node-produced assembly; Three.js renders its exact faces.

**Tech Stack:** Python SVG authoring, polygon-clipping, Three.js, Playwright.

- [x] Add model/roof-assembly.js for candidate planes, upper envelope, edge classification, finishes and depth-aware projections; scripts/build_roofs.mjs serializes the shared result.
- [x] Replace hand-drawn roof polygons in scripts/clean_elevations.py with assembly projections. Register data in building spec and add plan audit/section cut.
- [x] Add roof assembly mesh renderer using existing tiles and material palette, keeping all roofs under roof visibility controls.
- [x] Verify source pitches, registered offsets, coverage, gable/roof junctions, depth projection and render all elevations. Run existing browser regressions.
- [x] Update source assumptions, comparison artifact and packaged offline viewer.
