# Three-pane comparison

User requested a mode showing 3D, SVG and PDF with linked navigation. Add a dedicated view using the existing buildModel and DrawingModel data. One drawing-space camera controls all panes; projection adapters map plan and elevation coordinates into world coordinates. Aligned orthographic views give direct comparison; optional oblique plan view retains world centre and scale. Section uses the shared roof section X registration and a clipping plane. Keep original 2D/3D modes unchanged.

Implement model/triple-view.js; mount via the existing view-mode router. Reuse LinkedPanZoom for all three panes, with a transparent SVG input surface over the 3D canvas. Provide all eight drawings, Fit, zoom, and aligned/angled choices. Each drawing remembers its camera. Verify pan/zoom from each pane, projection landmarks, mode routing, independent floor visibility, resizing, offline loading and existing comparisons. Package the updated offline viewer.
