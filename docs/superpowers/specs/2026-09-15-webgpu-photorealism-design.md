# WebGPU photorealism

## Approved direction
The user approved WebGPU throughout, including path tracing, and requested a baseline Git commit followed by a feature branch. They also explicitly requested parallel agents. Baseline: `97507c6`; branch: `codex/webgpu-photorealism`.

## Experience
Keep the shared architectural model, floor controls, comparison views and walking tour. Provide responsive WebGPU exploration and a Photo mode that accumulates physically based path-traced samples when stationary. Motion resets accumulation; doors and fountain animation pause for a settled photo. Show actual rendering progress and allow PNG export. Use generated seamless architectural textures, physical surface scale, daylight environment illumination and transmission materials for glass and water.

## Architecture
- All live 3D rendering uses Three.js WebGPURenderer with an explicitly verified WebGPU backend. An unavailable adapter produces a clear message while drawings remain usable; no WebGL fallback.
- Integrate the upstream experimental WebGPU path tracer at a pinned revision if compatible; otherwise implement a focused WebGPU compute path tracer. Never label raster effects as path tracing.
- Separate rendering orchestration from scene construction. Rebuild path-tracer scene data after geometry, door, visibility or floor changes; reset only the accumulation when the camera changes.
- Replace WebGL-specific selection and clipping with WebGPU-compatible equivalents. Both comparison and roof views must use WebGPU.
- Generated texture assets live in the project, with generation prompts/provenance recorded. Base color, roughness and surface detail remain separate material inputs. Texture generation is not measurement of the real building.
- Preserve portable packaging where WebGPU is available; document browser/security requirements and avoid runtime network dependencies.

## Validation
Verify an actual WebGPU backend, path-traced sample accumulation, reset on scene/camera changes, resize, PNG export, unsupported-device handling, floor/cutaway/roof controls and tour behavior. Inspect exterior/interior screenshots and browser GPU errors. Run existing geometry checks and relevant browser checks. Disclose any remaining fidelity or experimental backend limitations.
