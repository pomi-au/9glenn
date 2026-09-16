# Building Tour Implementation Plan

**Goal:** Walk through the building from the front door with WASD/mouse and highlighted clickable doors.

**Architecture:** Keep the overview camera and settings intact. Add a tour controller with its own perspective camera, collision/support helper, input lifecycle and target highlighting. Integrate with the existing scene renderer and hash router.

**Tech Stack:** Three.js, native DOM/pointer lock, esbuild, existing Playwright browser acceptance harness.

- [x] Add `model/tour-navigation.js`: support rays against slab/room/finish/stair meshes, capsule collision against static registered solids and animated doors, movement substeps and wall sliding.
- [x] Add `model/tour-controls.js`: spawn from front-entry leaf; perspective camera; WASD/mouse; pause/resume/blur; near, occluded door targeting and per-leaf material highlight.
- [x] Update `model/viewer-3d.js`, `model/model-rotation.js`, `viewer.js`, `styles.css`: tour route, controls and HUD, camera switching, overview save/restore, input isolation and resizing.
- [x] Add `scripts/check_tour.cjs` and `test:tour`: browser acceptance checks for real input, collision, interaction, lifecycle and offline mode; capture entrance/interior views.
- [x] Run `npm run build:3d`, `python3 scripts/package.py`, `npm run test:tour`, `node scripts/check_door_interaction.cjs`, `npm run test:3d`. Inspect screenshots, fix defects, update README and package contents.

Validation completed: build and portable packaging; `npm run test:tour` (native Metal on macOS); existing `check_3d.cjs` and `check_door_interaction.cjs` with the same native Chrome renderer. Tour checks cover both directions on garage, main and cellar stairs, mouse capture/failure, WASD, doors, transitions, restoration and offline routing. All passed with no browser errors. Initial software-renderer regression runs timed out; the native-renderer reruns passed. Door regressions exercised 86 clicks across 43 leaves and six extra shower-door clicks in cutaway.
