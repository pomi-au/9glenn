"""One solid cornice assembly for the model and all four elevation SVGs."""
import json
import subprocess
from building_spec import BUILDING
from roof_spec import ROOT, ROOFS
CORNICES=json.loads(subprocess.check_output(['node','scripts/build_cornices.mjs'],input=json.dumps({'roofs':ROOFS['assembly'],'photo':BUILDING['frontPhoto']}).encode(),cwd=ROOT))
BUILDING['corniceAssembly']=CORNICES['assembly']

def draw_cornices(d,view):
    for face in CORNICES['projections'][view]:
        path=' '.join('M '+' L '.join(f'{x:.3f} {y:.3f}' for x,y in ring)+' Z' for ring in face['rings'])
        cls="detail" if face["kind"]=="pilaster" else "roof"
        layer='fixtures' if face['component'].startswith('photo-pier-base') else 'base'
        d.add(layer,f'<path class="{cls}" data-cornice-face="{face["id"]}" d="{path}" style="fill:{'#333' if face['material']=='gutter' else '#fff'}" fill-rule="evenodd"/>')
    d.issues.append(CORNICES['assembly']['assumptions'])
    d.facts.append(['Cornice bands','Solid profiles shared with 3D; source: PDF sheets 5–6'])
