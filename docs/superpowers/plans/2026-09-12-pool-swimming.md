# Pool walking and swimming

Add tour-only ground derived from the house outline and pool paving envelope, excluding the house and pool to retain all voids and stair access. Extend support to existing paving and coping. Determine water entry, depth and shallow platforms from the rendered pool meshes; use a shorter body and surface eye level while swimming, walking eye level while wading. Use WASD with slower swimming and smooth eye-height changes. Allow exit through shallow platforms and block deep pool walls and fountain solids. Preserve lighting, reset, overview transitions and door/stair movement.

Validation: continuous route from front porch to pool, paving walking, both entry platforms, swimming across the basin, deep-wall blocking, fountain collision, exit to paving, reset/exit cleanup and existing tour regression. Rebuild the bundled script and offline HTML/ZIP.

Completed and verified: `npm run test:swimming` passed the continuous route, both pool entries and exits, water-level swimming, deep-wall and fountain collision, and reset/overview cleanup. `npm run test:tour` passed indoor movement, all three staircases and door/tour lifecycle checks. Paving and swimming screenshots were visually inspected. Bundled/offline artifacts regenerated.
