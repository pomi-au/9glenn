# Building walk-through

The requested interaction is a dedicated first-person Tour mode using the existing building and animated doors. Enter from the 3D toolbar or `#tour`; begin on the porch facing the front entry, derived from its shared door mesh. A perspective camera at 1.65 m uses WASD and pointer-locked mouse look. Esc pauses and releases the cursor; click Resume to continue. Front door resets the position; Exit tour restores the previous overview and floor settings.

A centre ray chooses only the nearest visible surface within 2.5 m. Door leaves under this ray receive a blue highlight and an Open/Close prompt. Clicking toggles the existing animation; walls and other surfaces occlude interactions. Highlight materials are isolated and restored on pause/exit.

Walking uses a compact capsule against static building triangles and current door transforms, short movement substeps, and floor/stair rays for supported steps. Floors, roofs and full walls remain assembled during tours. No unsupported flying or jumping. Clear held keys on pause, blur, hidden document and route changes. Handle pointer-lock failure with a visible retry message. Retain offline operation and the existing overview/comparison modes.

Alternatives considered: adapting the orthographic orbit camera would not give natural interior perspective; unrestricted free flight would miss the requested walking experience. A separate controller and perspective camera reuse the scene without disturbing overview state.

Validation: browser checks for spawn, pointer lock, WASD/mouse, occlusion/reach/highlight restoration, door collision/toggle/passage, stair following, pause/reset/exit and offline rendering; existing door and 3D regressions. Inspect screenshots of the entrance and interior.

The user additionally requires a seamless camera transition. Use a 1.8-second eased flight with a perspective lens that starts by matching the overview framing and ends at eye level. Animate the model rotation back to upright and separated floors back into place during arrival. Capture the mouse from the Start tour button gesture so the flight ends directly in walking; direct URLs and capture failure retain the resume panel. Exit reverses the flight from the current walking pose to the saved overview. Maintain a tight camera depth range during the narrow-lens portion to avoid depth flicker.

Tour illumination: a broad warm spotlight and low nearby point fill are children of the tour camera, so position and aim follow walking and mouse look. Their intensity fades with the existing transition; pause retains illumination and exit/route cleanup removes it. No extra shadow-map passes are added.
