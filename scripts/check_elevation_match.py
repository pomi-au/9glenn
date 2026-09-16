"""Strict acceptance gate: current inputs and zero different pixels in all views."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/elevation-match'
capture=json.loads((OUT/'capture.json').read_text())
failed=False
reference=json.loads((OUT/'pdf-reference.json').read_text())
assert hashlib.sha256(Path(reference['source']).read_bytes()).hexdigest()==reference['sha256'], 'Stale original PDF reference'
for name,digest in capture['sources'].items():
    current=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
    if current!=digest:
        print(f'STALE input: {name} - regenerate the four-face report')
        failed=True
assert {v['view'] for v in capture['views']}=={'front','rear','left','right'}
for v in capture['views']:
    name=v['view']
    model=np.asarray(Image.open(OUT/f'{name}-model.png').convert('L'))<128
    drawing=np.asarray(Image.open(OUT/f'{name}-pdf-bw.png').convert('L'))<128
    assert model.shape==drawing.shape==(v['height'],v['width'])
    assert min(model.sum(),drawing.sum())>1000,'An empty render cannot pass'
    differences=int((model!=drawing).sum())
    print(f'{"FAIL" if differences else "PASS"} {name}: {differences:,} different pixels; required 0')
    failed|=differences!=0
raise SystemExit(1 if failed else 0)
