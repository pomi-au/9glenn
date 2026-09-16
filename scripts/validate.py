"""Validate semantic SVG geometry and independently transcribed opening chains.

No pixel-fidelity percentage is reported. Clean reconstruction and exact scan ink
are different targets; numerical checks have an explicitly bounded scope.
"""
from pathlib import Path
import json,math,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
NS={'s':'http://www.w3.org/2000/svg'}
items=json.loads((ROOT/'assets/drawing-data.json').read_text())
reports=[]
# Independent control values read from the PDF opening chains.
OPENINGS={
 'ground':{'laundry':(14510,1450),'pantry':(17270,1090),'meals-rear':(24470,1330),'garage-rear':(3710,1210),'gallery':(7550,1210),'bay':(18875,3880),'study-a':(6470,1210),'study-b':(8150,1210),'living-a':(10550,1210),'living-b':(12470,1210),'entry-glazing':(14750,2650),'family-a':(18470,1210),'family-b':(20390,1210),'games-a':(22910,1210),'games-b':(24590,1210)},
 'first':{'bath2':(3470,610),'bed3-a':(4790,1210),'bed3-b':(6590,1210),'bath1':(9590,610),'bed2-a':(10790,1210),'bed2-b':(12590,1210),'wc':(15950,610),'ensuite-a':(16790,610),'ensuite-b':(19070,610),'bed5-a':(950,1210),'bed5-b':(2630,1210),'bed4-a':(5030,1210),'bed4-b':(6950,1210),'void-feature':(9770,1570),'studio-front-a':(12950,1210),'studio-front-b':(14870,1210),'studio-east-a':(17390,1210),'studio-east-b':(19070,1210)}}
# Eight ground-front PDF leaves are superseded by four photographed opening groups.
PHOTO_CONTROLS={'photo-study':(6470,2890),'photo-living':(10550,3130),'photo-family':(18470,3130),'photo-games':(22910,2890)}
for prefix in ('study','living','family','games'):
 for suffix in ('a','b'):OPENINGS['ground'].pop(f'{prefix}-{suffix}')
for item in items:
 root=ET.parse(ROOT/'drawings'/f'{item["id"]}.svg').getroot()
 def compare_tree(node,record):
  assert node.tag.split('}')[-1]==record['tag']
  assert node.attrib=={k:v for k,v in record['attributes'].items() if k!='xmlns'}
  assert (node.text or '')==record.get('text','')
  assert len(node)==len(record.get('children',[]))
  for child,entry in zip(node,record.get('children',[])):compare_tree(child,entry)
 compare_tree(root,item['vector'])
 item['geometry']=[]
 for entity in item['entities']:
  g=dict(entity)
  if g['type'] in ('wall','elevation-window'):
   attr='data-wall' if g['type']=='wall' else 'data-elevation-window'
   node=root.find(f'.//s:rect[@{attr}="{g["id"]}"]',NS)
   g.update({k:float(node.get(k)) for k in ['x','y','width','height']})
  elif g['type']=='window':
   node=root.find(f'.//s:g[@data-window="{g["id"]}"]/s:rect[@class="window"]',NS)
   horizontal=g['axis']=='h'
   g['wall']=float(node.get('height' if horizontal else 'width'))
   g['length']=float(node.get('width' if horizontal else 'height'))
   g['x']=float(node.get('x'))+(0 if horizontal else g['wall']/2)
   g['y']=float(node.get('y'))+(g['wall']/2 if horizontal else 0)
  item['geometry'].append(g)
 assert item.get('cleanVector') and not item.get('sourceTraced')
 assert not root.findall('.//s:image',NS),'SVG must not contain a raster reference'
 assert root.findall('.//s:text',NS),'Labels must remain editable text'
 assert root.findall('.//s:rect',NS),'Expected geometric primitives'
 for p in root.findall('.//s:path',NS):
  assert len(p.get('d',''))<3000,'Unexpected dense contour/path'
 x,y,w,h=map(float,root.get('viewBox').split())
 assert math.isclose(float(root.get('width')[:-2])*100,w)
 assert math.isclose(float(root.get('height')[:-2])*100,h)
 for dim in item['dimensions']:
  length=math.dist(dim['a'],dim['b'])
  assert math.isclose(length,dim['value'],abs_tol=.01),(item['id'],dim)
  assert math.isclose(math.dist(dim['lineA'],dim['lineB']),dim['value'],abs_tol=.01)
 wallnodes={r.get('data-wall'):r for r in root.findall('.//s:rect',NS) if r.get('data-wall')}
 for g in item['geometry']:
  if g['type']=='wall':
   r=wallnodes[g['id']]
   for field in ['x','y','width','height']:assert float(r.get(field))==g[field]
   assert g['width']>0 and g['height']>0
  elif g['type']=='room':
   node=next((p for p in root.findall('.//s:polygon',NS) if p.get('data-room')==g['id']),None)
   if node is not None:
    points=[tuple(map(float,p.split(','))) for p in node.get('points').split()]
    assert max(p[0] for p in points)-min(p[0] for p in points)==g['width']
    assert max(p[1] for p in points)-min(p[1] for p in points)==g['height']
 for check in item['checks']:
  actual=math.dist(check['a'],check['b'])
  assert math.isclose(actual,check['expected'],abs_tol=.01),(item['id'],check)
  assert math.isclose(actual,check['actual'],abs_tol=.01)
 for id,(xpos,length) in OPENINGS.get(item['id'],{}).items():
  window=next(g for g in item['geometry'] if g['type']=='window' and g['id']==id)
  assert window['x']==xpos and window['length']==length,(item['id'],id,window)
 report=dict(id=item['id'],cleanVectors=True,editableText=True,rasterElements=0,checkedSpans=len(item['checks']),openingControls=len(OPENINGS.get(item['id'],{})),dimensionLines=len(item['dimensions']),maxCheckedDifferenceMm=max(abs(c['actual']-c['expected']) for c in item['checks']),checks=item['checks'],unverified=item['issues'])
 reports.append(report)
 print(f"PASS {item['id']}: {report['checkedSpans']} spans, {report['openingControls']} independent opening controls, editable vector primitives")
# Cross-view openings are projected from the same plan coordinates.
front=next(d for d in items if d['id']=='elevation-1')
front_windows=[g for g in front['geometry'] if g['type']=='elevation-window']
for x in [6470,8150,10550,12470,18470,20390,22910,24590]:
 assert any(g['x']==x and g['y']==640 and g['width']==1210 for g in front_windows)
ground=next(d for d in items if d['id']=='ground')
for id,(x,width) in PHOTO_CONTROLS.items():
 plan=next(g for g in ground['geometry'] if g['type']=='window' and g['id']==id)
 elevation=next(g for g in front_windows if g['id']==id)
 assert (plan['x'],plan['length'])==(x,width)
 assert (elevation['x'],elevation['width'])==(x,width)
 assert elevation['segmentRise']==180
(ROOT/'audit/dimension-audit.json').write_text(json.dumps(reports,indent=2))
print(f"PASS {sum(r['checkedSpans'] for r in reports)} checked spans; {sum(r['openingControls'] for r in reports)} independent window controls; 8 PDF front-elevation projections plus 4 photo-based opening envelopes. This does not establish a 100% source-image match.")
