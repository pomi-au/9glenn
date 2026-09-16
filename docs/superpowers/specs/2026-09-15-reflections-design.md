# Pool and window reflections

The user approved fixing live pool/window reflections and physical glass thickness after the diagnosis that Explore only reflected its environment and screen-space transmission duplicated above-water objects.

## Design

Use a shared native WebGPU planar optics manager for Explore, tours and comparison views. Render the actual scene with a camera mirrored across each visible optical plane. Clip the capture to the correct side, hide optical surfaces during capture to prevent recursive feedback, and share captures across coplanar panes. Composite reflection using angle-dependent Fresnel reflectance over the directly visible room or basin. Wave normals distort the pool reflection. A maximum of three capture passes per update bounds the cost; largest new surfaces fill first, oldest captures refresh fairly, camera-specific images remain visible between updates, and idle render queues drain before stopping. This removes the screen-space transmission source of ghost objects; live transmission remains a clear-surface approximation. Photo keeps the original physical materials and traces reflection/refraction through closed volumes.

All glazing receives physical closed thickness: 6 mm window/door panes and the specified 10 mm shower screens. Preserve curved outlines, door holes, frames, selection and navigation dimensions.

Screen-space reflections were rejected because objects outside the main camera disappear. Always-on full path tracing was rejected for interactive movement latency; settled Photo retains it. Planar captures are appropriate for the flat panes and the pool's mean surface, with bounded ripple distortion.

## Acceptance

- Native WebGPU only; reflected objects can originate outside the main view.
- Pool statue/furniture appear at mirrored positions without extra refracted upright copies.
- Glass stays transparent, with reflection increasing at grazing angles, from inside and outside.
- Perspective/orthographic, pivot transforms, cutaways, tours and separate renderer instances retain correct cameras and renderer state.
- Photo snapshots use original physical materials and closed panes, never live capture textures.
- Meaningful geometry and browser checks, before/after captures, no GPU errors; preserve historical audit directories.
