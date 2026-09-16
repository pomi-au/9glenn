# Main Consolidation Implementation Plan

**Goal:** Finish static startup, preserve all latest model and comparison changes, and publish one main branch.

**Architecture:** index.html contains the final interface. app.js owns routing and renderer loading. Integrate the latest working source into the clean GitHub publication history, excluding local audits and archive files. Preserve local history in a Git bundle before aligning the working checkout with main.

**Tech Stack:** HTML/CSS, JavaScript, Three.js WebGPU, esbuild, GitHub Pages.

- [x] Resolve the comparison navigation regression and verify static startup and pane controls.
- [x] Copy the latest model, source, assets and necessary build scripts into the publication checkout; preserve excluded local artifacts.
- [x] Build and verify the release, including 3D/Compare navigation and mobile panes.
- [x] Commit and merge onto main; configure Pages to main and verify deployment.
- [x] Back up local Git history, align the working checkout with main, and remove merged branches.

Validation: static first paint with scripts blocked, loading/retry routing, all seven pane combinations, all drawing and roof projections, mobile layouts, 3D interactions and tour exit passed. Latest fountain anatomy and tail geometry checks passed.

Release completed: main published successfully, live comparison verified, and old branch names removed locally and remotely. Original local development history is preserved under archive/latest-local-webgpu-2026-09-16; local audits, output and ZIP remain on disk and are ignored.
