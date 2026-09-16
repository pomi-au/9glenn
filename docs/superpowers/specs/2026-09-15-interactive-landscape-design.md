# Interactive grass, foliage and water

## User direction
Add real grass and make grass, foliage and pool water respond to mouse movement, following its speed and direction. Preserve the existing WebGPU-only rendering/path tracing architecture, controls, shared building geometry and generated materials. Parallel agents remain authorized.

## Interaction
Moving the pointer over a visible surface applies a local impulse along its motion on that surface. Faster motion supplies more energy, with a bounded force. Hover is enough; camera drag, touch pan, UI interaction, inactive views and pointer-locked tours do not inject accidental strokes. First entry, leaving the canvas, target changes and camera changes reset pointer velocity so there is no jump impulse or force from camera motion. Occluding walls and roofs block interactions behind them.

## Vegetation
Actual tapered, curved grass blades grow only within the existing clipped lawn polygons, respecting paths, house, pool and sloped site grade. Render with instancing. Nearby blade clumps bend about fixed roots with damped spring inertia and recover smoothly. Existing generated leaf clusters sway about anchored stems using bounded damped springs. Constrained planter/roof vegetation must retain its original collision envelopes even under interaction.

## Water
A spatially sampled damped wave field drives a sufficiently subdivided pool surface, producing directional wakes and spreading ripples. The water remains a closed physical volume at the same mean level and depth. Boundaries prevent displacement into pool walls. No impulses or animation state changes shared drawing footprints or navigation surfaces.

## Rendering and lifecycle
Physics uses stable bounded time steps and frame-rate-independent damping. The rendered geometry is the same geometry captured by Photo mode, so no shader-only deformation disappears in exports. While interacting or settling, Photo mode shows the WebGPU preview and delays accumulation. Once motion ends it rebuilds one current snapshot and resumes tracing. Existing fountain animation stays frozen in Photo. Hidden or inactive environments do not keep the render loop busy or accumulate an elapsed-time explosion on return.

## Validation
Test grass containment and roots, speed/direction response, opposite directions, energy decay, timestep bounds, no stationary/entry/camera-drag impulses, occlusion, water boundaries and volume footprint, visibility/pause/resume, Photo accumulation invalidation and resumption. Exercise real pointer events in native WebGPU, inspect screenshots and record an interaction clip if available. Preserve existing landscape/pool/tour checks.
