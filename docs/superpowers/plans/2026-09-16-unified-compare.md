# Unified Compare Implementation Plan

Goal: Merge Drawings and Compare into one Compare workspace with independent Model, SVG and PDF toggles.

Architecture: Reuse the existing synchronized comparison renderer and drawing/roof selector. Route legacy drawing hashes into Compare. Keep the separate 3D building/tour workspace. Persist visible panes locally, ensure one remains selected, derive navigation dimensions from the first visible pane, and let visible panes fill the layout.

- [x] Remove the Drawings tab and normalize legacy routes in model/viewer-3d.js.
- [x] Add accessible pane toggles in model/triple-view.js, shared layout sizing, hidden-model render suppression, and zoom controls independent of hidden panes.
- [x] Update styles.css for one/two/three panes on desktop/mobile.
- [x] Update browser regression for all seven combinations, route/reload persistence, pan/zoom without Model, roof comparison and narrow screens.
- [x] Build, inspect screenshots, run comparison regression, and package the offline viewer.

Validation: scripts/check_triple.cjs passed on native WebGPU, including all seven pane combinations at desktop/mobile sizes, navigation with the model hidden, persistence, legacy drawing links, eight drawing projections, roof modes and GPU-unavailable fallback. Desktop/mobile screenshots reviewed.
