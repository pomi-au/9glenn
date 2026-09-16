"""Photo-based landscape comparison, separate from the architectural PDF audit."""
from pathlib import Path
import base64
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/landscape'
def img(path):return 'data:image/png;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()
def pair(a,b):
    return '<div class="pair">'+''.join(f'<figure><figcaption>{caption}</figcaption><img src="{img(path)}" alt="{caption}"></figure>' for path,caption in [a,b])+'</div>'
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>9 Glenn · Photo landscaping</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f5ef;color:#263b2f;font:16px/1.55 system-ui}main{max-width:1500px;margin:auto;padding:36px}h1{font-size:36px;line-height:1.15}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}figure{margin:0;padding:14px;background:white;border:1px solid #cdd5c6}figcaption{font-size:14px;margin-bottom:12px}img{width:100%;display:block}a{color:inherit}li{margin:8px 0}.note{padding:20px;background:white;border-left:4px solid #67845b}@media(max-width:800px){main{padding:20px}.pair{grid-template-columns:1fr}h1{font-size:28px}}</style><main><p>9 GLENN / SUPPLIED PHOTO REFERENCES</p><h1>Driveway, paving and planting</h1><p>Grey driveway aligned with the garage, pale paths across the frontage and to the entrance, lawn, clipped window shrubs, tall evergreens near the garage, entrance topiaries and broadleaf shade trees. The pool-side planted screen follows the aerial and pool views.</p><p><a href="../../index.html?revision=photo-landscape#3d">Open updated 3D model</a> · <a href="../../drawings/ground.svg">Updated ground plan</a></p><div class="note">Photo reconstruction: path widths, pavement extent, planting positions, grades and tree sizes are estimates. Site edges are not surveyed boundaries. Use the Landscaping checkbox to hide the site model when inspecting the architecture.</div>'''
html+=pair(('audit/photo-reference/actual-house-front.png','Actual house · front planting and approach'),('audit/landscape/model-front.png','Updated model · front view'))
html+=pair(('audit/photo-reference/garage-close.png','Actual house · garage driveway and clipped evergreens'),('audit/landscape/model-iso.png','Updated model · driveway, front paths and garden'))
html+=pair(('audit/pool/reference-aerial.png','Supplied aerial · tree cover and pool-side planting'),('audit/landscape/model-top.png','Updated model · site layout from above'))
html+='''<ul><li>The driveway meets the garage at its existing −514 mm level. Front paths transition to the higher entrance and slope toward the frontage.</li><li>House and pool footprints are cut out of the lawn and paving. The entrance route remains open between the planting.</li><li>Planting uses an approximate clipped or broadleaf form; species cannot be confirmed from these photos.</li><li>The original PDF architectural comparisons hide landscaping. This page records the separate photo-based site reconstruction.</li></ul></main></html>'''
(OUT/'comparison.html').write_text(html)
(OUT/'observations.md').write_text('''# Photo landscape reconstruction

References: actual-house-front.png, garage-close.png, entrance-close.png, pool aerial and close-ups. Grey driveway, pale paving, front lawn, clipped shrubs, garage evergreens, two entrance topiaries, broadleaf trees and pool-side planting are represented. Site edges, widths, grades, plant dimensions and species are visual estimates. The same ground-plan vector shapes feed the 3D site model. Landscaping is optional in the main viewer and omitted from architectural PDF edge renders.
''')
print('Wrote photo landscape comparison.')
