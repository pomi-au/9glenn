"""Shared roof polygons, built once for SVG authoring and the 3D viewer."""
import json
import subprocess
from pathlib import Path
from building_spec import BUILDING

ROOT = Path(__file__).resolve().parents[1]
ROOFS = json.loads(subprocess.check_output(
    ['node', 'scripts/build_roofs.mjs'], input=json.dumps(BUILDING).encode(), cwd=ROOT))
BUILDING['roofAssembly'] = ROOFS['assembly']


def draw_roofs(d, view, lower_only=False, offset=(5520,600), component=None, layer='base'):
    faces = ROOFS['projections'][view]
    for face in faces:
        if lower_only and face['level'] != 'lower':
            continue
        if component and face['component'] != component:
            continue
        rings = face['rings']
        if view == 'plan':
            rings = [[[x-offset[0], z-offset[1]] for x, z in ring] for ring in rings]
        path = ' '.join('M '+' L '.join(f'{x:.3f} {y:.3f}' for x,y in ring)+' Z' for ring in rings)
        style = 'style="fill:none" stroke-dasharray="120 95"' if view == 'plan' else 'fill="#fff" fill-rule="evenodd"'
        if view != 'plan' and any(id.startswith('garage-abutment-') for id in face.get('sourceFaceIds', [])):
            # This is continuous rendered masonry, not a panel seam. The roof
            # surface already draws its sloping lower junction edge.
            style += ' style="stroke:none"'
        d.add(layer, f'<path class="roof" data-roof-face="{face["id"]}" data-roof-component="{face["component"]}" d="{path}" {style}/>')
    if view != 'plan':
        d.issues.append(ROOFS['assembly']['assumptions'])
        d.facts.append(['Roof geometry', 'Shared with 3D; projected with depth and visibility'])


def draw_roof_section(d):
    for cut in ROOFS['section']:
        points = ' '.join(f'{x:.3f},{y:.3f}' for x,y in cut['points'])
        d.add('base', f'<polygon class="roof" data-roof-face="{cut["faceId"]}" points="{points}" fill="#fff"/>')
    d.issues.append('X–X roof cut uses inferred plan registration X=21,300 mm; all cut edges intersect the shared 3D roof faces.')
