# 9 Glenn drawing viewer implementation plan

**Goal:** Recreate the scanned residential drawings as editable SVG geometry and provide an offline, white HTML viewer.

**Architecture:** A Python generator creates SVG files and a drawing manifest. A dependency-free browser viewer embeds these drawings, and a packaging script makes a single HTML file with embedded reference scans. All drawing coordinates are millimetres; printed dimensions and scan-derived geometry have separate provenance.

**Tech stack:** Python standard library, SVG, HTML, CSS, JavaScript.

- [x] Digitise ground, first and cellar plans; recreate four elevations and section X–X. Retain source page references, room names, openings, fixtures and readable dimensions.
- [x] Constrain overall plan dimensions and key wall positions to printed dimensions. Label inferred detail and do not claim survey accuracy. Preserve original pages for comparison.
- [x] Implement white viewer with view navigation, zoom, pan, room selection, layers, calibrated measuring with snapping, source comparison, unit selection and SVG export.
- [x] Generate standalone HTML and individual SVG deliverables, with a short measurement/provenance guide.
- [x] Validate SVG XML, dimension constraints, browser JavaScript and offline asset completeness. Render drawings for visual comparison with the PDF.

The user approved implementation directly and requested a white page with no dark theme. No deployment is needed for the offline deliverable.

Validation completed: eight XML/geometry/scale checks passed. Offline browser checks passed for all views, source image loading, room selection, printed and approximate ruler spans, units, layers, SVG export and mobile layout. Desktop/mobile renders were visually inspected.

## Revision 2: source comparison after user-reported errors

The original schematic linework failed fidelity review despite its runtime and overall-span checks. Preserved it in audit/before. Replaced production geometry with deterministic source-ink paths in all eight views. Added an aligned PDF overlay, corrected WC metadata and changed ruler provenance to distinguish printed quotations from approximate scan lengths. Created audit/comparison.html with six before / PDF / revised examples. Validation now rasterises the SVGs and compares against the monochrome source. Browser checks cover the revised controls and export.

## Revision 3 — clean geometric reconstruction (supersedes revision 2)

- Replaced the contour-tracing output with semantic mm geometry in `clean_plans.py` and `clean_elevations.py`.
- Rebuilt the three plans, four elevations and section using straight walls, window rectangles, door arcs, curved stairs, round façade arches and editable text.
- Corrected source transcriptions and opening positions; reconciled gallery dimensions using the courtyard return wall faces.
- Replaced pixel-fidelity scoring with a bounded dimensional audit: 73 spans, 33 independent opening controls and 16 front-elevation projections.
- Restored separate viewer layers, added the per-view dimensional audit, kept the white UI and isolated the optional original PDF overlay from SVG exports.
- Rebuilt and tested the offline bundle. All eight views, room selection, ruler, units, zoom, layers, source comparison, export and mobile layout pass.
- Remaining limit: not every undimensioned detail is verified. Do not describe this revision as a 100% match to the PDF image.
