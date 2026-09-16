# Guard corrections implementation plan

User authorization: fix the findings in audit/guards. Preserve concurrent stair/door corrections and all dimensions.

- Add guard_spec.py: explicit SVG polygons for a U-shaped rising centre guard inside the 320 mm separator, and the upper curved enclosure outside the 2900 mm opening. Keep 1100 mm height and 40/90 mm thickness identified as inferred.
- Resolve guard polygons and riser indices from SVG elements in drawing-model.js. Store no duplicate footprint coordinates in entity metadata.
- Add guard-mesh.js: slope opaque extrusions using the shared segment endpoints and section-derived riser heights. Attach the centre guard to the existing main stair group so isolation and explosion remain correct. Render the upper enclosure on the upper floor.
- Remove the obsolete horizontal centre block and the independent void metal rails; preserve the shared solid void walls.
- Rebuild and verify guard-to-tread relationships, closed front-facing meshes, source-edit propagation, upper-floor isolation, existing stair/arch/door tests, and PDF/model close-ups. Update the guard audit with completed results and retained assumptions.
