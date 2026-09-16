# Consistent View UI Implementation Plan

**Goal:** Apply the same interface styling and responsive shell to 2D, 3D and three-way comparison views.

**Architecture:** Reuse the drawing viewer's heading, toolbar, button and status-bar classes in the other modes. Replace duplicate 3D/comparison style rules with shared blue/white tokens and mode-specific layout only. Keep the pastel scene and drawing content intact.

- [x] Share heading, toolbar and status markup; standardize export icons and accessible names.
- [x] Unify accent colors, selection/focus states, sidebar spacing and control sizes.
- [x] Keep the header mode switcher stationary and use a common mobile header and breakpoint.
- [x] Rebuild offline files, check desktop/tablet/mobile mode switching and run existing viewer regressions.
