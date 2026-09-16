# Door Corrections Implementation Plan

**Goal:** Correct the door audit findings through the existing shared drawing data and verify both renderers.

**Architecture:** Edit the Python authoring definitions, which generate the canonical primitive tree. Resolve doors by stable IDs in both renderers. Keep common exterior assembly dimensions in one authoring definition shared by plans and elevations. Preserve the original audit as before-fix evidence.

**Tech Stack:** Python, SVG, shared JavaScript primitive model, Three.js, Playwright.

The user approved the concrete fixes in the preceding door audit with “fix them”, and requires shared data. Execute these corrections directly in this workspace; no new product design or separate geometry store is required.

- [x] Preserve the audit and authoring baseline.
- [x] Correct the 11 leaf orientations, positions, wall junctions, dining glazing and laundry elevation symbol in the authoring source.
- [x] Register shower doors in the shared primitive model, and use stable door IDs when resolving 3D openings.
- [x] Add source-derived orientation, leaf-count, meeting-edge, aperture and cross-renderer regression checks.
- [x] Rebuild the SVGs, shared data, 3D bundle and portable viewer; inspect revised PDF/SVG comparisons.
- [x] Run dimensional and browser checks, then update and package the resolved door audit.

Validation commands: `npm run build`, `python3 scripts/check_doors.py`, `node scripts/check_viewer.cjs`, and `node scripts/check_3d.cjs`. Visual checks cover every changed region. Numeric source checks certify the printed widths and corrected orientations; undimensioned setbacks remain scan-derived.

Completed: all 73 existing dimension checks, 33 window controls, 16 front-elevation projections, door controls, 2D and 3D browser checks passed. The resolved audit passed desktop/mobile inspection. Packaged files and report hashes match the delivered shared data. Browser tests required running Chrome outside the filesystem sandbox.
