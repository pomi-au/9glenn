# Taller interactive landscape and tactile materials

## Direction
The user explicitly requests more visible physics, denser and taller grass, and generated photoreal textures with bumps and nonuniform appearance on trees, walls, doors, carpets and floors. This continues the authorized WebGPU-only feature branch and parallel-agent workflow.

## Visual design
Keep the established warm residential palette. Grass becomes a full varied meadow-like lawn around 18–32 cm tall, with 64 blades per shared clump and bounded instance count. Normal pointer strokes should create conspicuous direction-dependent grass bending, tree-leaf swaying and water wakes, followed by slower damped recovery. Preserve fixed roots, collision clearances, clipped planting boundaries and pool geometry fixes.

Five separate built-in generated images supply plaster, continuous oak door timber, oak plank floors, woven carpet and bark. Keep originals in assets/textures and save every prompt/source in a manifest. Derive restrained multiscale normal/bump/roughness detail in the material pipeline. Use physically sized UVs, deterministic per-object offsets and subtle tint/roughness differences. Existing leaf cutouts, roof, terracotta and paving remain available. Carpet belongs in bedrooms/study; retain oak circulation/living floors.

## Validation
Judge movement by real mouse strokes and visible image changes at useful viewing distances, not merely nonzero transforms. Verify every requested surface actually consumes its new texture and relief maps, different objects have varied appearance, all pixels are finite, and Photo accumulation resumes after settling. Preserve pool/swimming/landscape/door checks. Capture current native-WebGPU material closeups and a short movement demonstration; rebuild portable deliverables and commit.
