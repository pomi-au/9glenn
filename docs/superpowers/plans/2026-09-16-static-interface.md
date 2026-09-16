# Static interface implementation plan

**Goal:** Render the current interface from the first paint, remove the old-layout conversion, and keep Drawings independent of the WebGPU download.

**Architecture:** `index.html` owns the finished header, popover, drawing toolbar, model controls and comparison panes. `app.js` binds lightweight navigation and loads the existing WebGPU engine on demand. Engine modules bind controls to the existing markup; they no longer create or rearrange the interface.

**Tech stack:** Static HTML/CSS, plain JavaScript, esbuild, Three.js WebGPU, Playwright.

- [x] Replace the legacy HTML scaffold with the current static layout; remove unused hidden legacy elements.
- [x] Add lightweight routing/loading in `app.js`, including route-safe loading failures and retry.
- [x] Remove `model/compact-ui.js`, markup factories and duplicate mode routing from the rendering code.
- [x] Consolidate current layout styles and remove obsolete layout selectors.
- [x] Add startup regression checks with the WebGPU request held or failed: first paint, functional 2D, navigation during load, retry and mobile layout.
- [x] Run the existing three-pane regression and 3D checks against `index.html`.
- [x] Verify the published branch diff, push it, wait for Pages, and verify the public page.
