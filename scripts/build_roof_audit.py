"""Source/model roof comparison, including true plan depths and section cuts."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from roof_spec import ROOFS
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/roofs'
COLORS={'main-hip':'#f7d8cd','central-hip':'#f3b7a2','arch-gable':'#d58676','garage-hip':'#f6cc90','portico-deck':'#9bc9bf','bay-lean-to':'#cbdcaa'}
for view,faces in ROOFS['projections'].items():
    if view!='plan': faces=[f for f in faces if f['level']=='upper']
    pts=[p for f in faces for r in f['rings'] for p in r]
    x0,y0=[min(p[i] for p in pts)-150 for i in [0,1]]
    x1,y1=[max(p[i] for p in pts)+150 for i in [0,1]]
    body=[]
    for f in faces:
        d=' '.join('M '+' L '.join(f'{x:.3f} {y:.3f}' for x,y in r)+' Z' for r in f['rings'])
        fill=COLORS[f['component']] if view=='plan' else '#fff'
        if f['kind']=='fascia':fill='#f3ece5'
        body.append(f'<path d="{d}" fill="{fill}" fill-rule="evenodd" stroke="#39454b" stroke-width="22" stroke-linejoin="round"/>')
    if view=='plan':
        # Dimensioned wall outline shows the roof overhang and offsets directly.
        points=' '.join(f'{x},{z}' for x,z in ROOFS['assembly']['upperFootprint'])
        body.append(f'<polygon points="{points}" fill="none" stroke="#4a657b" stroke-width="35" stroke-dasharray="140 100"/>')
        body.append('<path d="M 21300 -250 L 21300 14200" stroke="#596677" stroke-width="25" stroke-dasharray="180 130"/>')
        for x,z,text in [(9700,2700,'Rear setback: 4,080'),(23400,13500,'1,080'),(16075,15500,'Portico: 2,280'),(3300,14700,'Garage'),(16500,12900,'25° gable')]:
            body.append(f'<text x="{x}" y="{z}" text-anchor="middle" font-size="300" font-family="Arial" fill="#33454f">{text}</text>')
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="{round(1400*(y1-y0)/(x1-x0))}" viewBox="{x0} {y0} {x1-x0} {y1-y0}">'+''.join(body)+'</svg>'
    (OUT/f'roof-{view}.svg').write_text(svg)
    try:
        import fitz
        doc=fitz.open(stream=svg.encode(),filetype='svg')
        pdf=fitz.open('pdf',doc.convert_to_pdf())
        pdf[0].get_pixmap(matrix=fitz.Matrix(1,1),alpha=False).save(OUT/f'roof-{view}.png')
    except ImportError:pass
(OUT/'geometry.json').write_text(json.dumps(ROOFS,indent=2))
rows=''.join(f'<section><h2>{v.title()} roof</h2><div class="pair"><figure><img src="source-{v}-roof.png"><figcaption>Original PDF</figcaption></figure><figure><img src="roof-{v}.svg"><figcaption>Depth-aware projection of the 3D roof faces</figcaption></figure></div><img class="model" src="model-{v}.png"></section>' for v in ['front','rear','left','right'])
(OUT/'comparison.html').write_text('''<!doctype html><meta charset="utf-8"><title>9 Glenn · Roof geometry audit</title><style>body{font:16px/1.5 Arial;color:#35454c;margin:40px auto;max-width:1450px;padding:20px}h1{font-size:30px}h2{margin-top:45px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0}img{width:100%;height:auto}figcaption{font-size:13px;color:#6a777c}.model{max-width:1000px;margin:20px auto;display:block}section{border-top:1px solid #ddd;padding-top:15px}p{max-width:1000px}</style><h1>Roof geometry checked against the PDF</h1><p>The upper roof combines the main hip, projecting central hip and small 25° gable above the upper arch. The rear-west setback and the different front depths are modelled in plan, so their visible edges change correctly between elevations. Lower roofs include the attached garage hip, 1° portico deck and rear bay lean-to.</p><p>Source: sheets 2 and 4 (plans), 5 and 6 (elevations), 7 (section). Printed pitches: 20°49′, 25° and 1°. Plan setbacks: rear 4,080 mm, front 1,080 mm, portico depth 2,280 mm. Undimensioned junctions, overhangs, eave build-up, fascia and section registration remain inferred.</p><h2>Shared roof plan</h2><img src="roof-plan.svg"><p>Peach: main hip; salmon: central hip; dark salmon: arch gable; yellow: garage; green: portico; pale green: bay. Dashed blue outline: upper walls. Vertical dashed line: X–X roof section.</p>'''+rows+'''<section><h2>Section X–X</h2><p>The new roof cut intersects the same model faces. Sheet 7 simplifies the roof into a triangular section with a break; the plan’s X markers do not dimension an exact cut location. The rebuilt cut uses an inferred X=21,300 mm registration and exposes the hip junctions rather than reproducing a separate schematic roof profile.</p><img src="drawing-section.png"><p>Full updated elevation drawings: <a href="../../drawings/elevation-1.svg">front</a>, <a href="../../drawings/elevation-3.svg">rear</a>, <a href="../../drawings/elevation-2.svg">left</a>, <a href="../../drawings/elevation-4.svg">right</a>.</p></section>''')
print('Built roof plan, four source/projection comparisons and shared geometry audit.')
