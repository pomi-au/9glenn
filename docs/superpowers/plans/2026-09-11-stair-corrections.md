# Stair Corrections Implementation Plan

**Goal:** Correct all six audited staircase findings in shared plans, live model and portable exports.
**Architecture:** Shared stair polygon authoring; resolved inter-floor connections and slab elevations; dedicated stair mesh groups. User has authorized execution of the audited corrections.
**Tech Stack:** Python SVG/data generation, Three.js, polygon-clipping, Playwright.

- [x] Add scripts/stair_spec.py with common main, cellar and garage tread polygons. Render fixtures directly from those records, using negative cellar labels independently from ascending height indices. Preserve dimensioned widths. Update clean_plans.py and explicitly label source assumptions.
- [x] Resolve main and cellar landings in model/model-geometry.js; replace rectangular bounding-box slab openings with actual outlines/flight polygons. Split garage slab/finish using room boundary plus landing strip, with 514 mm vertical drop from building_spec.py.
- [x] In model/build-model.js render explicit from/to elevations, treads with an open underside and landing surfaces; extend garage exterior wall bottoms to its lower slab. In model/viewer-3d.js show the main flight when isolating the first floor, with no duplication in assembled/exploded views.
- [x] Add scripts/check_stairs.cjs for actual browser-resolved geometry/mesh assertions and visual captures. Verify direction, riser sequence, endpoints, clear passage, landing joins, garage slab, source boundary parity, and isolated/exploded visibility. Run the test against the old model first and expect failure.
- [x] Rebuild all exports and run existing geometry, doors, arches, 3D and viewer regressions. Inspect screenshots and compare with PDF crops. Update audit/stairs and README; preserve original findings under before-fix; package corrected artifacts.
