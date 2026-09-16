# Fixture interpretation implementation plan

Goal: Apply the approved door-overlap report: represent side-wall fixtures correctly, complete shower glass, then verify clearances.

Architecture: Store footprint polygons and glass lines once in the shared vector tree, referenced by typed fixture entities. Resolve them through DrawingModel for 3D; remove automatic rectangle extrusion. Preserve source door locations and existing animation.

- [x] Interpret the Sheet 2 thin outlines as inner fixture edges: WIR 3 west/south, WIR 2 south/east, WIR 4 north/east, linen south/east, master wraparound. Use scan-derived 600 mm runs and label undimensioned depths and vertical assumptions.
- [x] Add scripts/fixture_spec.py for typed fixture authoring and shared profiles in scripts/building_spec.py. Explicitly classify kitchen/laundry/appliance/vanity/bath shapes rather than retaining a rectangle fallback.
- [x] Add fixture resolution to model/drawing-model.js and typed fixture rendering to model/build-model.js. Counter/shelf tops remain thin surfaces; no unverified cabinet bodies or supports.
- [x] Add shallow trays and six fixed glass panels around the three shower doors; preserve the shared enclosure outline and leaf positions.
- [x] Rebuild shared drawings, 3D bundle and offline viewer. Verify shared-source edits propagate, room centres are clear, glass is present and stationary while doors animate, and door sweeps against actual meshes.
- [x] Inspect corrected screenshots, run existing door/3D checks, and publish corrected evidence alongside the earlier report without overwriting historical samples.

Approval: User requested “fix them” after reviewing the rewritten report. Execute in this workspace; no additional approval gate needed.

Verified hinge follow-up: offset slab thickness behind the swing-facing hinge with 3 mm edge joints; align laundry lobby and Bedroom 2/3/5 anchors with wall faces. Final actual-slab checks pass at every degree from 0 to 70 against all modelled walls and typed fixtures.
