# 9 Glenn · Clean architectural vectors

Live viewer: **https://pomi-au.github.io/9glenn/**. GitHub Pages publishes the repository root from `codex/webgpu-photorealism`; `.nojekyll` serves the prebuilt files directly. `index.html` is the only viewer entry point. Rebuild the drawings and 3D bundle with `npm run build` before publishing updates. This web build does not generate the omitted offline package or audits.

Published source: committed WebGPU version `2d9631fee50bf929e633e045364a3662636793a6` from the local `codex/webgpu-photorealism` branch. Uncommitted development changes are excluded.

This web edition excludes the offline HTML duplicate, drawing-set ZIP, audit folder, comparison PDF and original reference scans. It retains all eight SVG drawings, the 3D model and SVG/3D comparison. PDF overlays and the PDF comparison pane are disabled. The historical audit and offline-package instructions below refer to the complete local project, not this reduced web edition.

Open **9-glenn-viewer.html** for the self-contained, offline viewer, or **index.html** in this folder. All view modes share a compact white-and-blue interface with a single header and toolbar. The canvas fills the workspace; drawing and floor selectors stay in the toolbar, while **Controls** opens floors, layers and display options in a dismissible panel. Drawing details appear on demand and can be closed with × or Escape. It includes ground, first and cellar plans, four elevations, section X–X, and an interactive 3D building mode.

The drawings are reconstructed from geometric SVG primitives: straight wall rectangles, window frames, door arcs, curved stairs, roof profiles, round façade arches, fixtures and editable text. No scan or pixel-contour tracing is used as the drawing. The original PDF images are included only for the explicitly enabled reference/overlay views and never enter the exported SVGs.

The swimming pool beside the east end of the house is reconstructed from the supplied aerial and two close-ups. Its estimated 4.0 × 8.3 m water envelope has two rounded entries: matching 1.3 m radius semicircles at both ends, as clarified by the user. A green bronze mermaid fountain sits inside the front rounded entry, reconstructed from the supplied sculpture reference with a curled scaled tail, broad fins, carved hair and face, raised arm and scalloped basin. Generated verdigris colour and roughness provide a non-uniform cast surface. Separate face/body height and normal maps add fine bronze grain, while overlapping tail scales use physically sized relief (28 scales around the tail, tapering toward the fin; 14 mm row spacing). Facial anatomy and smoothly tapered limbs are modeled in the mesh; restrained patina contrast keeps those forms readable. Both Explore and Photo use the matching normal maps. It is a modeled interpretation, not a scan of the original sculpture. The pool is beside the front portion of the side wall (Z 5.3–13.6 m), with an estimated 1.0 m wall-to-water gap. Water depth is 1.2 m, with the surface 160 mm below the surround (basin floor 1.36 m below coping). Each rounded end has one submerged step. Water exits the shell basin along a gravity-driven stream, thins as it accelerates and produces splash droplets on arrival. Its pulsed impact drives a damped wave field in the actual closed pool mesh, changing surface heights and normals; the decorative torus rings are removed. Wave amplitude stays within 6 cm and the water volume is conserved. The live stream uses reflective transparency; Photo traces its physical refraction. Shared ground-plan outlines drive SVG and 3D. Run `npm run test:pool` for geometry, shared edits and floor visibility checks, and `npm run test:fountain` for sculpture, flow, wave physics and native Photo checks. Fountain views and motion are in `audit/fountain/`; matched face/tail detail comparisons are in `audit/fountain-detail/`. Run `npm run test:fountain-detail` for relief continuity, Photo material preservation and native close-up captures.

The charcoal asphalt driveway, pale connecting paths, pedestrian pavement, lawn and photo-based planting share the editable ground plan and 3D model. The garage approach uses generated fine-aggregate asphalt at the existing −514 mm level; planting beds and porch planters use generated brown loam. Paths and pavement use varied pale stone, with 600 mm slabs and 2.5 mm recessed bevelled joints encoded in matching height and normal maps. Photo preserves the same surface detail. Use **Landscaping** to show or hide them. Plant sizes, site extents, grades and pavement widths are visual estimates from the front, garage, pool and aerial photos. The architectural PDF edge comparisons hide landscaping so the house remains visible. See `audit/landscape/comparison.html`. New surface comparisons and actual Photo exports are in `audit/site-surfaces/`; run `npm run test:site-surfaces`. Texture prompts and provenance are in `assets/textures/site-materials-manifest.json`.

## WebGPU rendering and photography

All live 3D views now use **WebGPU**, including exploration, the tour, aligned comparisons and progressive path tracing. There is no WebGL fallback. The baseline before this upgrade is Git commit `97507c6`; implementation is on `codex/webgpu-photorealism`.

1. Open **3D**, then select **Street** for a lower perspective view, or choose any existing camera view.
2. Select **Photo · Path tracing**. The image accumulates light paths while stationary; the progress label reports sample counts measured on the GPU. Camera, floor, roof, cutaway and door changes restart the photo.
3. Allow the image to refine, then **Save 3D image**. The PNG contains the rendered scene. **Explore** returns to responsive movement and the animated fountain.

Photo mode traces up to 10 light bounces, supports physical glass/water transmission and soft daylight shadows, and targets 128 samples per pixel. It freezes fountain flow, splashes and the current pool waves while refining, preserving ripples in the exposure. Doors and interactive plants finish their animation before rebuilding the photo scene. A paused tour can also be photographed; the tour pause card is hidden in Photo mode and restored in Explore. A surrounding ground surface is added for whole-building photos with landscaping enabled.

Live pool and window reflections use native WebGPU mirrored-camera captures of actual scene objects, including objects outside the main view. Coplanar panes share a capture, reflection strength follows the viewing angle, and water normals distort the reflected image. Up to three captures refresh per frame; large new surfaces fill first and older captures receive fair refresh turns. Still views stop recapturing after the queue drains. Reflection images remain visible while queued, so crowded views can take several frames to catch up after movement. Live transparency directly reveals the basin/room to avoid ghost copies from screen-space refraction. Photo mode retains physical refraction through closed volumes: window and glazed-door panes are 6 mm thick, and shower screens are 10 mm. Live reflection captures omit other optical surfaces to avoid recursive feedback; Photo traces multiple bounces.

Run `npm run test:reflections` for glazing geometry, mirrored-camera/state checks, physical Photo materials and native browser visual checks. Before/after captures and results are in `audit/reflections/`.

Solid timber doors have three carved panels on each face, with real bevelled recesses and raised fields inside the original leaf thickness. Fine routed grooves and generated wood micrograin use a whole-leaf height map plus its matching normal map, so the carving stays aligned while the wood colour varies. Photo uses the normal map and the actual relief geometry. Door dimensions, hinges, paired opening and glass-door construction are preserved. Run `npm run test:door-relief`; captures and results are in `audit/door-relief/`.

Walls, door timber, oak floors, woven carpet, tree bark, terracotta porch tile, limestone paving, gray roof surfaces and leaf cutouts use ChatGPT-generated assets. Texture detail is mapped at physical scale, with deterministic UV offsets and restrained material variants to avoid identical surfaces. Normal, bump and roughness maps add tactile detail; these are artistic estimates, not measured material scans. Bedrooms and the study use carpet, while living and circulation areas retain oak. Exact prompts and generation provenance are in `assets/textures/manifest.json` and `assets/textures/material-upgrade-manifest.json`.

Photo mode smooths Monte Carlo grain with three native WebGPU filtering passes, guided by surface colour, normal and depth to retain material detail and object edges. Smoothing refreshes during refinement and uses the latest accumulated image when saving a PNG. Changing the camera, scene or rendering size discards the old guides and result. It runs offline without downloaded model weights. Very early previews and difficult reflections can still show noise; letting the photo reach **Photo ready** gives the best result.

Guide rendering sees through thin clear glazing to preserve the leaves and materials behind it; the actual light paths still trace the glass. These rasterized guides approximate reflected and refracted detail. Water, thick glass and frosted glass keep their surface guides.

Photo's texture-atlas compatibility fix keeps leaf cutouts visible when door relief maps use a second UV coordinate set. It changes only the temporary atlas-copy coordinates; door mapping and leaf transparency remain intact. Run `npm run test:photo-cleanup` for native filtering, foliage masks and rendered comparisons. Evidence is in `audit/photo-cleanup/`.

The path tracer is the experimental upstream WebGPU implementation pinned to revision `010d21099bc9a998364f0f698f5aa2865782130e`, paired with Three.js `0.185.1`. Rendering is capped at one million pixels to limit memory and refinement time; PNG export uses the current canvas dimensions with that photo buffer upscaled as necessary. Geometry still follows the reconstructed building model rather than a photographic scan.

WebGPU requires a compatible browser/device and a secure context. The offline single HTML was verified in desktop Chrome on this Mac using native Apple/Metal WebGPU. If a browser blocks WebGPU for local files, serve the folder on localhost or HTTPS. When WebGPU is unavailable, the viewer explains the requirement and the 2D drawings remain usable; Compare retains the SVG and PDF panes.

Run `node scripts/check_photo_scene.mjs` for snapshot/clipping checks, `node scripts/check_render_quality.mjs` for rendering lifecycle checks, and `npm run test:webgpu` for actual backend detection, path-traced samples, camera changes, resize, export and cutaway checks. Existing 3D, tour and comparison browser checks use native WebGPU rather than a software WebGL backend.

### Interactive landscaping

Move the mouse across visible grass, leaves or pool water to brush them. Faster strokes apply stronger force in the direction of movement. Grass bends at fixed roots, leaf clusters sway and recover, and the pool develops spreading ripples with a directional wake. Dragging still rotates the building; mouse movement over controls, hidden surfaces or during a walking tour does not brush the landscape.

The lawns use dense clumps of 64 real tapered blades, with varied heights around 18–32 cm, placed within the clipped lawn boundaries and following the sloped ground. A broader brush and stronger forces make strokes clearly visible; grass and tree leaves recover slowly, while water wakes can reach 6 cm. Vegetation uses damped springs; water uses a damped wave simulation with fixed edges and a conserved mean water level. These are bounded physical approximations. Geometry and instance transforms update directly, so WebGPU exploration and path-traced photos use the same shapes. Photo mode shows the moving preview, then resumes tracing after motion settles.

Run `npm run test:environment:physics` for geometry, force, recovery and pointer-input checks, and `npm run test:environment` for native WebGPU mouse interaction and Photo-mode checks. Screenshots and results are in `audit/interaction/`. Run `npm run test:materials` for current texture/variation checks and visible motion comparisons; see `audit/material-upgrade/` for closeups and the current demonstration.

## Measurements and limits

One SVG coordinate equals one millimetre. The exported physical dimensions use a nominal 1:100 print scale. The ruler calculates distances from geometry. Snapping includes wall corners, openings and checked dimension endpoints. Free point placement is rounded to 1 mm; dimensioned spans are displayed without that rounding.

The current audit verifies 73 selected dimension spans, 25 unchanged PDF window controls, 8 upper-front opening projections, and 4 photo-based front opening envelopes. All those numerical checks pass. This is **not** verification of every feature or a 100% match to the PDF image. Undimensioned door setbacks, stair winder angles, fixtures and façade profiles remain reconstructed interpretations of the scan.

Corrections include the 5,858 mm games depth, 2,860 mm upstairs bathroom depth, 1,570 mm feature window, glazed front sidelights, gallery return, open connection from living to entry, garage piers and steps, angled WIR doors, curved stairs, double ensuite basins and round façade arches.

The door audit now checks 43 shared leaves, all 40 printed door-width labels, 11 corrected hinge/swing orientations and eight meeting pairs. The fixes also restore door jambs, the dimensioned 2,770 mm dining glazing assembly and the single laundry-door elevation symbol. See [the corrected door comparisons](audit/doors/index.html), with the original audit preserved alongside them. Exact undimensioned setbacks and shower sizes remain scan-derived. Door transforms and aperture cuts are shared by the 2D and 3D views, including the three shower doors.

Fixture corrections now use typed shared footprints instead of extruding every plan rectangle. Wardrobe and linen tops follow the side walls around open room centres; kitchen tops, vanities, appliances, baths, shower trays and fixed shower glass are distinct types. The three shower doors have six stationary glass panels. Door slabs mount behind the hinge edge, and four junction anchors align with wall faces. All 43 doors clear modelled walls and fixtures at 1-degree steps through their 70-degree swing (1 mm² intersection tolerance). Fixture depths, vertical dimensions and small mounting gaps remain inferred; closed bottom covers extend from the floor to the underside of wardrobe, linen, kitchen and vanity tops, following the same footprints. See [the fixture and shower corrections](audit/fixture-fixes/index.html), or run `npm run test:fixtures`.

The source is a raster scan. Its ink edges, text positions and local distortion differ from clean architectural geometry. No pixel-match percentage is asserted. Consult the viewer's **Dimension audit**, `audit/dimension-audit.json` and `audit/comparison.html` for the exact verification scope. The source describes Glenn Avenue although the supplied PDF filename says Glenn street.

The staircase corrections now share actual tread polygons between the plans and 3D model: 19 main-stair increments, 16 cellar risers with 15 walking treads, and three garage steps. The main landing aligns with the first floor and remains visible in its isolated view. The cellar ascends toward the under-stair door, with an open main-stair underside and coordinated ground-slab openings. The garage slab, perimeter walls and vehicle threshold extend to −514 mm, using the drop printed on elevations 1 and 3; the plan’s −6c annotation conflicts and is recorded as a source discrepancy. Exact winders, structural thickness and cellar registration remain reconstruction assumptions. See [the corrected stair audit](audit/stairs/index.html) and run `npm run test:stairs` for endpoint, shared-geometry, visibility and clearance checks. The sampled minimum cellar headroom in this model is 2,078.5 mm; this is a model measurement, not construction certification.

## Viewer controls

- In 3D, all 43 door leaves start closed. Click a door to swing it open or closed with a smooth 0.45-second animation; clicking mid-swing reverses it. Either leaf of each of the eight double-door pairs moves both leaves together. Glazed and shower doors work the same way. Door state survives floor/view changes and resets when the page reloads.
- Select rooms, pan, zoom, fit; `M` measures, `V` selects, `F` fits.
- Choose mm, metres or feet/inches; Shift constrains a measurement to an axis.
- Toggle dimensions, walls, openings, fixtures, labels and room selection independently.
- Compare source shows the original sheet; Overlay PDF blends the unwarped reference over the vector.
- Download SVG exports the current view with editable geometry/text and the current layer visibility.

## 3D walk-through tour

From **3D building**, select **Start tour →**. The camera glides from the current model view to the porch facing the front door, then hands over to walking controls. Directly opening `#tour` shows a click-to-start panel because the browser requires a user gesture to capture the mouse.

- **W / A / S / D** walk forward, left, backward and right; **mouse** looks around.
- Aim the centre crosshair at a nearby door: a blue silhouette outlines the door (both leaves for a double door) and an **open/close** prompt appears. Original surface colours and glass transparency are preserved. **Left-click** toggles it. Walls block targeting and the interaction range is 2.5 m.
- Walls, fixtures, windows and closed doors block walking. Open doors retain their actual swing clearance. Walk around an opened leaf; floors and stair treads set your height, with unsupported drops blocked.
- **Esc** pauses and releases the cursor. **Resume tour** continues; **Front door ↺** returns to the entrance. **Exit tour** animates back to the previous model view and restores its floor/display settings, keeping door states.

Walk out of the porch and around the house to reach the pool paving. Either rounded pool entry lets you wade in, then **WASD** automatically switches to slower surface swimming in deeper water. Your eye level lowers smoothly to just above the water. Swim back to either rounded entry to stand up and get out; the deep walls and fountain remain solid. The on-screen badge identifies swimming or wading. The tour-only surrounding ground is a navigation surface inferred from the house/pool envelopes, not a surveyed landscape plan. Run `npm run test:swimming` for the continuous front-door-to-pool route, both entries/exits, buoyancy, collisions and cleanup.

A broad, warm light follows your position and viewing direction, with a soft nearby fill. It stays on while paused and fades with the camera transition. The eye height is 1.65 m. Tour mode assembles all floors, roofs and full walls. It is designed for a desktop keyboard and mouse and works in the offline viewer. `npm run test:tour` checks camera movement, the main, cellar and garage stairs in both directions, WASD/mouse input, door interaction/collision, pause/reset, routing and offline operation. See `audit/tour/` for screenshots and check results. The tour browser check uses native WebGPU on macOS.

## 3D building

Select **3D building** in the header (or open the viewer with `#3d`). Drag to rotate the building about its centre while the camera and lighting stay fixed. Horizontal turning is unrestricted; vertical rotation stops between a near-level view (2.7° above the horizon) and a top view, without rolling or flipping. A daylight environment supplies reflections and illumination. The default camera uses an equal-axis isometric view. Scroll/pinch to zoom, and right-drag/two-finger drag to pan. Camera buttons show the top and four sides; `R` resets the camera. Isolate a floor, separate the levels, remove the roof, cut walls at 1.2 m, and display room names or overall dimensions. Click a component to outline it and see its source and dimensions. Selected rooms in the floor plan also use an outline without replacing their fill colour. **Save 3D image** exports the rendered scene as PNG.

The rendering uses physical materials, generated surface textures, clear glazing and daylight illumination. The building geometry comes from this drawing set. The interface stays white.

Section levels are ground 0, first +3,258 mm and cellar −2,572 mm. The 3D model preserves the plan footprints and opening widths; section heights determine extrusion. Roof intersections, some opening heights, fixtures and cellar registration remain inferred. The front arch now distinguishes the 2,410 mm clear pier spacing from the recessed 1,640 mm arched glazing. Its continuous impost band, shouldered aperture, fanlight and stepped pier caps follow the PDF detail; see `audit/arches/comparison.html`. The roof now combines the main hip, central projecting hip, 25° gable above the upper arch, attached garage hip, 1° portico deck and rear bay lean-to. The 4,080 mm rear setback and 1,080 mm front projection are registered in X/Z; four elevations and section X–X use the same roof faces as 3D. See `audit/roofs/comparison.html` for source comparisons and the roof plan. Intersections are reconstructed from the elevations; 160 mm main overhang, 130 mm eave build-up, 110 mm fascia, tile exposure (320 × 300 mm), cap sizes and undimensioned section registration remain inferred. Ridge/hip caps and valley flashing follow the joined surfaces. Run `node scripts/check_roof_assembly.mjs` for shared geometry, coverage, pitches, intersections and projection checks; `node scripts/check_roof_views.cjs` verifies rendering and captures all six camera views.

## Single source of data

`assets/drawing-data.json` contains the shared millimetre primitive tree plus semantic entity references, room metadata, dimensions and source checks. There is no separately stored SVG string or 3D wall coordinate list. `assets/building-spec.json` holds shared vertical parameters and explicitly named inferred values.

- `model/drawing-model.js` resolves wall, window and door coordinates from referenced primitives and room boundaries from their polygons. It also serializes the same tree to SVG.
- `model/model-geometry.js` takes those resolved components, subtracts opening footprints, registers the floors and derives vertical profiles from the elevation/section data.
- `model/build-model.js` builds meshes from that resolved model. Stair footprints come from shared stair records. It contains rendering/material construction, not another hand-coded floor plan.
- `model/roof-assembly.js` builds the registered roof planes and their intersections, depth-aware elevations and section cuts. `scripts/roof_spec.py` includes those faces in the shared building spec and SVG authoring; `model/roof-assembly-mesh.js` renders the same faces in 3D.
- `model/viewer-3d.js` handles the camera, selection and view controls.

The authoring definitions in `scripts/clean_plans.py`, `scripts/clean_elevations.py` , `scripts/building_spec.py` and `model/roof-assembly.js` generate the shared data, standalone SVG exports and offline viewer. Change these definitions, then rebuild. SVG files, `assets/drawings.js`, the bundled 3D script and the standalone HTML are generated outputs. The browser regression test edits a canonical wall/window and checks that both SVG and 3D receive the same new dimension.

`scripts/door_spec.py` holds the common dining and laundry assembly dimensions used by plan and elevation authoring. The browser regression also edits a shared door transform and verifies its SVG/3D position, orientation and aperture.

## Files

- `drawings/*.svg`: eight standalone clean drawings.
- `assets/drawing-data.json`: geometry, dimension provenance and checks.
- `9-glenn-viewer.html`: single-file offline viewer.
- `9-glenn-drawing-set.zip`: portable viewer, drawings and audit.
- `audit/comparison.html`: self-contained side-by-side source review.

## Rebuild and check

With Python 3 and Node.js installed:

```sh
npm ci
npm run build
```

This rebuilds the shared data, all eight SVGs, local 3D bundle, dimensional audit, source comparison and portable HTML/ZIP. No runtime CDN or network connection is needed. WebGPU is required for 3D; the 2D drawing viewer remains available without it. Three.js, polygon-clipping, three-mesh-bvh and three-gpu-pathtracer license notices are included under `assets/licenses/`.

`node scripts/check_viewer.cjs` and `node scripts/check_3d.cjs` run the browser acceptance checks with Playwright/Chrome. Their Playwright import currently points to the local bundled runtime; adjust it if using another machine. The ZIP includes source and build files as well as the offline deliverables.

Earlier rejected schematic/contour experiments are retained only under the audit/reference scripts for history; they are not used by the clean drawing builder or included as delivered drawings.

## Three-pane comparison

Choose **Compare all** to inspect the 3D model, SVG and calibrated PDF together. All eight drawings share linked pan/zoom; drag, scroll or pinch in any pane. **Aligned** uses the matching orthographic projection. **Angled 3D** is available for floor plans and retains the same plan location and scale while showing depth. **Outlines** adds shape edges and is enabled by default. **Fit all** resets the selected drawing; each drawing remembers its view. The section uses the shared section-X registration for a live 3D cut; its cut surfaces are not filled with section hatching.

The mode works offline at `9-glenn-viewer.html#compare/first`. Run `node scripts/check_triple.cjs` for projection, linked navigation, outlines, mode switching, mobile and offline checks.

## Four-face black-and-white acceptance report

Open `audit/elevation-match/comparison.html` for the original-PDF/model pairs, wipe slider and difference images. The printable report is `output/pdf/9-glenn-four-face-comparison.pdf`. The current result is **0/4 views passing the required 100% match**. Cornices and sill bands have been added; roof junctions, glazing, wall returns and drafting conventions still differ; ordinary dimensional regression checks do not establish complete elevation equality. The rear garage window was corrected by 622 mm during this audit.

After rebuilding the model, run `npm run audit:elevations`, then `npm run test:elevations`. The strict test checks input hashes and compares the independent binary images with zero tolerance; it intentionally fails while any face differs. The capture requires local Chrome/Playwright; analysis/PDF generation uses Python NumPy, SciPy, Pillow and ReportLab. Raw depth/normal buffers stay under `tmp/elevation-match` and are not packaged.


### Cornices and original-PDF comparison

The model now includes solid eave/head cornices, stepped paired front sill bands, garage frieze and lintel mouldings, portico entablature and side plinths, and rear bay trim. `model/cornice-assembly.js` is shared by the 3D renderer and four SVG elevations. Heights follow the course labels on original PDF sheets 5–6; 35–100 mm projection depths are inferred.

`audit/elevation-match/comparison.html` and `output/pdf/9-glenn-four-face-comparison.pdf` now compare the actual model directly against freshly rendered original PDF pages, with updated SVGs as supplementary outputs. The PDF reference is registered using fixed printed datums; scan grain, symbols, labels and skew are retained. No 100% match is claimed. The report describes remaining differences. `npm run audit:elevations` refreshes the report; `npm run test:elevations` intentionally fails while any reference/model pixels differ. This raw raster check is not a dimensional certificate.

Bathroom floor presentation uses an inferred warm ivory porcelain finish: 600 mm square tiles, 3 mm grout, subtle colour variation, recessed joints and varied roughness. Procedural maps share a metre-based scale in Bath 1, Bath 2, ensuite, WC and powder room, and remain fully offline. This finish is a visual choice, not a tile specification transcribed from the PDF.

The two first-floor front piers beside the arched window are now solid applied pilasters, shared between the model and elevation SVGs. Each has a 590 mm face aligned with the portico piers; the 230 mm projection is estimated from the supplied PDF side detail. Stepped eave caps and head bands return around the shafts, with the gable roof extending over them. Exterior render, trim, roof tiles, frames, entrance timber and porch colours now approximate the actual-house photos in neutral daylight; they are not measured paint specifications.

The garage roof front return now includes its east hip and a sloping rendered wall apron at the house abutment, replacing the stepped notch. The main garage ridge is preserved. SVG elevations and 3D use the same corrected faces; see [junction images](audit/garage-junction/report.md).


### Approved front appearance from photographs

`BUILDING['frontPhoto']` in `scripts/building_spec.py` records the front photo revision. Four ground-front window groups combine the PDF pairs within their unchanged outer envelopes and use shallow circular heads and solid projecting surrounds. Ground-plan and front-elevation SVGs are updated with the same grouped widths. Rise (180 mm), surround width (220 mm), projection (55 mm) and glazing division remain inferred. `model/segmental-arch.js` supplies the real apertures and trim profiles.

The front storey band, stepped solid portico bases and plain garage fascia/dark gutter follow the supplied photographs. Side/rear and obscured upper details remain PDF-based; corner transitions and the fourth-bay repetition are unverified. The report explicitly distinguishes these approved changes from the unchanged PDF comparison reference. `audit/photo-reference/` preserves the supplied images, observations and live aperture checks.

The garage stair and wall recheck corrects audit items 1–4: diagonal/rounded step returns, rear-wall contact, the gallery-level third rise, two garage-facing study piers and removal of the extra rear pier. The shared SVG/3D polygons and wall solids are checked by `scripts/check_stairs.cjs`. Undimensioned goings, return radius and pier sizes are scan-derived. See [corrected comparison](audit/garage-review/index.html). The [roof comparison](audit/garage-review/roof.html) identifies the ground SVG’s separately authored dashed roof lines; the actual roof assembly is unchanged by these stair/wall corrections.

**Roof comparison mode:** under **Compare all**, choose **Roof comparison · ground floor** or **Roof comparison · first floor**. The first-floor view defaults to the complete upper roof. The roof dropdown includes All roofs, First-floor roof (all upper), Ground-floor roofs (all lower), and every individual component: main upper hip, projecting upper hip, front gable, garage, portico and rear bay. Both SVG and PDF overlays project the shared 3D surface edges; the obsolete orange roof layer has been removed. Ground-floor drawing dashes also use the shared roof projection. Pan/zoom, PDF overlays, outlines and angled views remain available. Routes are `#compare/roof-ground` and `#compare/roof-first`.

Service-area geometry corrections join the two 620 mm cupboard leaves into a continuous 1,240 mm opening with no centre wall (equal 55 mm end reveals are inferred), close the linen corner, trim the pantry passage stub and remove the 120 mm FZ/FR wall overhang. The rounded laundry bench is shared counter geometry; its radius/depth and 900 mm height remain inferred. See [corrected PDF comparison](audit/service-walls/index.html). `scripts/check_fixtures.cjs` checks these wall contacts, apertures and bench meshes as well as door clearances.

## Curved stair floor finish

The grey circulation gaps beside the curved stair were exposed structural slab: the original straight room-finish polygons did not cover the curved surround. The connected missing areas now receive the existing oak finish at the same elevation, with the stair opening, wall footprints and finished rooms excluded. Run `npm run test:stair-floor-finish`; before/after images and native ray checks are in `audit/stair-floor-finish/`.
