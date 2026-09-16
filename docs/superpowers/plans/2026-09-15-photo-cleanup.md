# Photo noise and missing foliage

## Design

Keep native WebGPU path tracing and its 128-sample target. Add a native GPU spatial denoiser guided by the current Photo scene's surface colour, normal and depth. Smooth during refinement in bounded sample milestones and refresh the latest accumulation for PNG export. Preserve material texture and object edges; invalidate guides and output on camera, scene and size changes. No downloaded model weights or prior-frame history.

Trace foliage from the visible model through the Photo snapshot and upstream material packing. Correct the actual missing-leaf cause while preserving leaf cutouts and live vegetation motion.

## Work and validation

1. Parallel agents implement the denoiser, diagnose foliage, and capture immutable baseline evidence.
2. Integrate smoothing and current-view export in the Photo wrapper.
3. Compare raw and smoothed images from exactly the same accumulation; inspect wall noise, window edges, wood texture and leaves in native Chrome offline.
4. Add focused foliage and denoiser regressions; run renderer lifecycle checks.
5. Update documentation, build the standalone viewer and package, inspect changes, and commit on the existing feature branch.
