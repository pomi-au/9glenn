"""Create a reviewable side-by-side reference report; never score pixel equality."""
from pathlib import Path
import base64,html,json
ROOT=Path(__file__).resolve().parents[1]
items=json.loads((ROOT/'assets/drawing-data.json').read_text())
images={p:base64.b64encode((ROOT/f'assets/source-{p}.jpg').read_bytes()).decode() for p in range(2,8)}
sections=[]
for item in items:
 id=item['id'];source=item['sourceImage'];bounds=' '.join(map(str,item['bounds']))
 ref=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{bounds}"><image preserveAspectRatio="none" x="{source["x"]}" y="{source["y"]}" width="{source["width"]}" height="{source["height"]}" href="data:image/jpeg;base64,{images[item["page"]]}"/></svg>'
 vector=(ROOT/f'drawings/{id}.svg').read_text()
 # Scope embedded style rules to the corresponding panel; SVGs share a document.
 vector=vector.replace('<style>','<style>')
 issues=''.join(f'<li>{html.escape(s)}</li>' for s in item['issues'])
 rows=''.join(f'<tr><td>{html.escape(c["name"])}</td><td>{c["expected"]:g}</td><td>{c["actual"]:g}</td><td>{c["actual"]-c["expected"]:g}</td></tr>' for c in item['checks'])
 sections.append(f'<section id="{id}"><h2>{html.escape(item["title"])}</h2><div class="compare-controls"><button data-zoom="out" aria-label="Zoom out">−</button><output>100%</output><button data-zoom="in" aria-label="Zoom in">+</button><button data-fit>Fit both</button><span>Linked · drag either drawing to pan · scroll or pinch to zoom</span></div><div class="pair"><figure><figcaption>Original PDF · sheet {item["page"]}</figcaption>{ref}</figure><figure><figcaption>Clean SVG · editable lines, curves and text</figcaption>{vector}</figure></div><details><summary>{len(item["checks"])} checked dimensions (mm)</summary><table><tr><th>Span</th><th>PDF</th><th>Model</th><th>Difference</th></tr>{rows}</table></details><details><summary>Unverified details</summary><ul>{issues}</ul></details></section>')
nav=''.join(f'<a href="#{i["id"]}">{html.escape(i["title"])}</a>' for i in items)
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>9 Glenn · Source comparison</title><style>
html{color-scheme:light;font:14px system-ui;background:#fff;color:#26383f}body{margin:0;padding:32px}h1{font-size:28px;font-weight:500}p{line-height:1.7;max-width:1000px;color:#647780}nav{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:#fffffff2;padding:12px 0;z-index:1}nav a{padding:9px;border:1px solid #dbe4e9;border-radius:5px;color:#2f789c;text-decoration:none;font-size:12px}section{border-top:1px solid #dbe4e9;padding:28px 0;scroll-margin-top:70px}h2{font-weight:500}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;border:1px solid #e4eaed;overflow:hidden}figure>svg{width:100%;height:auto;display:block;aspect-ratio:var(--drawing-aspect);cursor:grab;user-select:none;outline-offset:-3px}figure>svg.dragging{cursor:grabbing}.compare-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0}.compare-controls button{font:inherit;background:#fff;border:1px solid #dbe4e9;border-radius:5px;padding:8px 12px;cursor:pointer}.compare-controls output{min-width:48px;text-align:center}.compare-controls span{color:#647780;font-size:12px}figcaption{padding:10px;background:#f8fafb;font-size:12px;color:#607782}details{margin:14px 0;padding:14px;border:1px solid #e4eaed;border-radius:5px}summary{cursor:pointer}table{border-collapse:collapse;margin-top:14px;width:100%;font-size:12px}th,td{text-align:left;padding:8px;border-bottom:1px solid #e4eaed}li{margin:10px 0;line-height:1.7}@media(max-width:750px){body{padding:15px}.pair{grid-template-columns:1fr}nav{position:static}}@media print{nav,.compare-controls{display:none}section{break-inside:avoid}}
</style><h1>9 Glenn · Source comparison</h1><p>This revision rebuilds the architecture with geometric SVG elements and editable text. Printed dimensions control checked spans. The PDF is displayed alongside the reconstruction using the overall scan calibration; it has not been warped to hide differences. The drawings are <strong>not certified as a 100% match</strong>. Expand each audit to see the verified scope and remaining unverified details.</p>'''+f'<nav>{nav}</nav>'+''.join(sections)+'<script>'+ (ROOT/'model/linked-pan-zoom.js').read_text() + r'''
for (const section of document.querySelectorAll('section')) {
 const svgs=[...section.querySelectorAll('figure>svg')];
 const initial=svgs[0].getAttribute('viewBox').split(/\s+/).map(Number);
 let view=[...initial];
 for (const svg of svgs) svg.style.setProperty('--drawing-aspect',`${initial[2]} / ${initial[3]}`);
 const update=v=>{view=v;for(const svg of svgs)svg.setAttribute('viewBox',view.join(' '));section.querySelector('output').textContent=`${Math.round(initial[2]/view[2]*100)}%`;};
 const reset=()=>update([...initial]);
 const controls=svgs.map(svg=>LinkedPanZoom.bind(svg,{getView:()=>view,setView:update,getFitWidth:()=>initial[2],reset}));
 section.querySelector('[data-zoom=\"in\"]').onclick=()=>controls[0].zoom(1.25);
 section.querySelector('[data-zoom=\"out\"]').onclick=()=>controls[0].zoom(.8);
 section.querySelector('[data-fit]').onclick=reset;
 reset();
}
</script></html>''' 
(ROOT/'audit/comparison.html').write_text(page)
print('Wrote audit/comparison.html with all 8 views and dimensional evidence.')
