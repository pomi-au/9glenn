# Swimming pool

**Goal:** Add the photographed pool beside the east end of the house, opposite the garage.

**Design:** Estimate a 4,200 mm wide rectangular basin, 6,600 mm long with a 1,200 mm radius rounded entry extension (7,800 mm overall). Leave a 1,400 mm walkway at the house. Add pale stone coping and paving, a closed recessed basin, turquoise water and submerged entry steps. Pool depth and offsets are inferred from the supplied photographs. Keep geometry in the shared ground-plan vector tree so the plan and 3D model agree.

- [x] Author shared pool outlines and vertical dimensions; update the plan bounds.
- [x] Build basin, surround, water and steps in the ground-floor group.
- [x] Rebuild and inspect close-up and whole-house views; check geometry and floor controls.
- [x] Run the offline 3D regression checks and refresh the portable bundle.

Validation: full build passed; pool geometry and shared-edit checks passed; floor isolation and exploded placement passed; close-up and whole-house renders inspected; offline 3D regression checks passed.


## Superseding photo correction

The user supplied a clearer aerial and close-up and specified two equal rounded entries and a fountain statue. The earlier dimensions and single-entry layout above are superseded: 4.0 × 8.3 m water envelope, 1.0 m house-to-water gap, X 27.63–31.63 m / Z 5.3–13.6 m. Both entries have 1.3 m radius. Approximate fountain sculpture and water jet added at the front end. See audit/pool/comparison.html for current references, renders and limitations.


Latest user corrections: fountain pedestal is inside the pool, on the front entry step. Each equal rounded entry has one broad submerged step. Water depth is 1.2 m; basin floor is 1.36 m below coping with the retained 160 mm water drop. Water surface, fountain droplets and expanding/fading ripples animate while the pool is visible. Geometry and live animation checks passed.

Surface-wave revision: removed the animated colour and bump textures from the pool water at the user’s request. Fountain flow and local impact ripples remain animated.
