# Roof depth correction

User authorization: recheck every PDF roof drawing and update drawings and 3D together.

Source: original seven-sheet PDF, sheets 2/4 (registered plans), 5/6 (four elevations), 7 (section), rendered again in audit/roofs. World coordinates are millimetres, X across frontage, Z rear to front, Y height above ground floor.

Replace the single bounding hip with the upper envelope of intersecting planar roofs: main hip X5520..26630/Z600..12710, clipped at rear-west setback X9600/Z4680; central projecting hip X9600..22550/Z600..13790. Both use printed 20°49′. The central ridge is higher and at another Z, producing the front triangle, rear ridge bump and offset side slopes. Include a 25° gable centred X16075 at the upper arch/front wall Z13790, extending back only until it intersects the main roof. Roof shapes above the arch are triangular, not curved. Use inferred 160 mm main overhang and 130 mm eave build-up above upper ceiling.

Lower roofs: attached three-plane garage hip (ridge extends east to house, no false eastern falling hip), genuine 1° portico deck across its 2280 mm depth, rear kitchen bay lean-to. Preserve stairs, doors, openings and guards.

One serializable roof assembly carries planar polygons, face IDs, thickness, level and source metadata. The 3D mesh consumes those polygons. Four elevation projections perform depth-aware visibility using those same polygons and upper wall occluders. Section X–X intersects the assembly at its plan cut position. The first-floor drawing retains exposed lower roof outlines derived from the assembly; a roof plan audit shows all upper/lower face edges and offsets. Do not hand-draw independent roof silhouettes.

Tests: polygon coverage/no overlapping visible top surfaces; printed slopes; main/central ridge separation; gable aligned to upper arch; rear setback and real garage/portico/bay depth; shared coordinates in 2D/3D; section intersections; browser rendering and existing stairs/door/arch checks. Inspect all four projected roof silhouettes against PDF crops. Rebuild and package deliverables, provide comparison artifact. Undimensioned intersections/overhang/trim remain documented assumptions, not asserted surveyed values.

Review clarifications incorporated: close the rear-west clipped edges vertically down to the wall/eave. Gable roof width 3,790 mm (3,590 mm pier width plus 100 mm each side), at main eave level 6,171 mm; width and build-up inferred. Bay rear rectangle is the projection of its lean-to surface, not a separate parapet: rechecked against the rear and side sheets.
