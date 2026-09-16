# Compact Workspace Implementation Plan

**Goal:** Give the canvas most of the screen in every mode.

**Architecture:** Keep a single compact header and one toolbar per mode. Move existing headings/selection into the toolbars, turn the sidebar into a native Controls popover, and show drawing details only on demand. Preserve current geometry, rendering and tour behavior.

- [x] Add accessible drawing/floor/camera shortcuts and a dismissible Controls panel.
- [x] Collapse duplicate headings, metadata and default details; compact shared spacing on desktop/mobile.
- [x] Update affected browser acceptance flows for on-demand controls, and verify mode switching, keyboard dismissal, controls and canvas area.
- [x] Rebuild offline viewer and inspect desktop/mobile output.
