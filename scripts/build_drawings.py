"""Build clean, editable architectural SVGs from dimensioned geometry."""
import json
from pathlib import Path
import vector_drawing as v
from building_spec import BUILDING
from clean_plans import ground, first, cellar
from clean_elevations import front, left, rear, right, section
ROOT=Path(__file__).resolve().parents[1]

def main():
    v.MANIFEST.clear()
    ground();first();cellar()
    front();left();rear();right();section()
    for drawing in v.MANIFEST:
        entities=[]
        for entity in drawing.pop('geometry'):
            entity=dict(entity)
            if entity['type'] in ('wall','window','door','elevation-window'):
                # Shape coordinates live only in the vector primitive tree.
                for key in ('x','y','width','height','length','wall','angle','swing'):
                    entity.pop(key,None)
            entities.append(entity)
        drawing['entities']=entities
        drawing['spaces']=[{k:v for k,v in room.items() if k!='pointsMm'} for room in drawing.pop('rooms')]
    (ROOT/'assets/building-spec.json').write_text(json.dumps(BUILDING,indent=2))
    (ROOT/'assets/drawings.js').write_text('window.BUILDING_SPEC = '+json.dumps(BUILDING)+';\nwindow.DRAWINGS = '+json.dumps(v.MANIFEST,separators=(',',':'))+';\n')
    (ROOT/'assets/drawing-data.json').write_text(json.dumps([{k:value for k,value in d.items() if k!='svg'} for d in v.MANIFEST],indent=2))
    print(f'Built {len(v.MANIFEST)} clean SVGs with {sum(len(d["checks"]) for d in v.MANIFEST)} geometry checks.')
if __name__=='__main__':main()
