# Garage stair and wall correction

User approved audit items 1–4. Preserve roof geometry, door geometry and all unrelated components.

- Replace garage rectangles in scripts/stair_spec.py with two adjacent tread polygons following the diagonal outer and rounded inner returns, plus a gallery-level landing; retain three rises and existing vertical datum.
- Extend stair upper ends to the rear inner wall face. Meet the study corner and new first pier. Scan-derived return dimensions remain estimates.
- Add the two garage-facing study-wall piers; remove only garage-rear-pier-6020 in scripts/clean_plans.py.
- Keep visible riser annotations and shared model polygons consistent, avoiding an outlined box around the flush top landing.
- Add geometric regression checks for these connections, pier presence and obsolete-pier removal; compare new SVG crops visually to original PDF.
- Rebuild generated drawings, bundle, audits and packaged viewer. Run stair and roof regressions; confirm unrelated geometry remains unchanged.
- Update the audit to corrected status, and fix the dashed-line interpretation with the actual-roof comparison.
