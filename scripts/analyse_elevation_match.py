"""Compare independently rendered facade linework; never score white background."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/elevation-match'
capture=json.loads((OUT/'capture.json').read_text())

def save_mask(name,mask):
    Image.fromarray(np.where(mask,0,255).astype('uint8')).save(OUT/name)

results=[]
for v in capture['views']:
    name=v['view'];width=v['width'];height=v['height']
    buffer=np.fromfile(ROOT/f'tmp/elevation-match/{name}.f32',dtype=np.float32).reshape(height,width,4)[::-1]
    occupied=buffer[:,:,3]>.5
    assert occupied.sum()>10000, f'Empty render: {name}'
    assert np.isfinite(buffer).all(),f'Invalid render: {name}'
    depth=buffer[:,:,2]
    nx=buffer[:,:,0];ny=buffer[:,:,1]
    normal=np.stack([nx,ny,np.sqrt(np.maximum(0,1-nx*nx-ny*ny))],axis=-1)
    edges=np.zeros_like(occupied)
    for axis in [0,1]:
        a=(slice(None,-1),slice(None)) if axis==0 else (slice(None),slice(None,-1))
        b=(slice(1,None),slice(None)) if axis==0 else (slice(None),slice(1,None))
        both=occupied[a]&occupied[b]
        crease=(np.linalg.norm(normal[a]-normal[b],axis=-1)>.12)&both
        nz=np.maximum(normal[a][:,:,2],.04)
        expected_step=(normal[a][:,:,0] if axis==1 else -normal[a][:,:,1])/nz*.01
        jump=(np.abs(depth[b]-depth[a]-expected_step)>.006)&both
        change=(occupied[a]!=occupied[b])|crease|jump
        edges[a]|=change
    # One-pixel dilation produces a 30 mm line at this resolution, close to the
    # source elevation's 20–32 mm pens. The exact test still allows zero tolerance.
    model=ndimage.binary_dilation(edges,structure=ndimage.generate_binary_structure(2,1))
    drawing=np.asarray(Image.open(OUT/f'{name}-pdf-bw.png').convert('L'))<128
    assert drawing.shape==model.shape
    save_mask(f'{name}-model.png',model)
    save_mask(f'{name}-reference-bw.png',drawing)
    save_mask(f'{name}-difference.png',np.logical_xor(model,drawing))
    save_mask(f'{name}-drawing-only.png',drawing&~ndimage.binary_dilation(model,iterations=2))
    save_mask(f'{name}-model-only.png',model&~ndimage.binary_dilation(drawing,iterations=2))
    distances_to_model=ndimage.distance_transform_edt(~model)
    distances_to_drawing=ndimage.distance_transform_edt(~drawing)
    metrics={}
    for tolerance in [0,2,10]:
        coverage=float((distances_to_model[drawing]<=tolerance).mean()*100)
        precision=float((distances_to_drawing[model]<=tolerance).mean()*100)
        metrics[str(tolerance*10)]={'drawingCoveragePercent':round(coverage,2),'modelAgreementPercent':round(precision,2),'f1Percent':round(2*coverage*precision/(coverage+precision),2)}
    item=dict(view=name,drawing=v['drawing'],bounds=v['bounds'],mmPerPixel=v['mmPerPixel'],width=width,height=height,exactMatch=bool(np.array_equal(model,drawing)),differentPixels=int((model!=drawing).sum()),drawingInkPixels=int(drawing.sum()),modelInkPixels=int(model.sum()),foregroundIoUPercent=round(float((model&drawing).sum()/(model|drawing).sum()*100),2),metrics=metrics,p95DrawingDistanceMm=round(float(np.percentile(distances_to_model[drawing],95)*10),1),openingPairs=[])
    results.append(item)
    print(f"{name}: exact={item['exactMatch']}; PDF/model edge agreement within20mm={metrics['20']['drawingCoveragePercent']}%/{metrics['20']['modelAgreementPercent']}%; foregroundIoU={item['foregroundIoUPercent']}%; different={item['differentPixels']}")
(OUT/'results.json').write_text(json.dumps({'status':'PASS' if all(r['exactMatch'] for r in results) else 'FAIL','required':'100% match in all four faces','method':'Independent depth/normal edge render of physical 3D meshes vs original PDF sheets 5 and 6. Same 10 mm/pixel scale and world registration. No fitting, warping or shared raster input. Foreground pixels only for agreement. Exact test is binary equality with zero tolerance.','scope':'Above-ground facade, fixed orthographic cameras, doors closed, no textures/shadows, glass opaque for linework. PDF scan annotations, dimension/level marks, grain, pen weights and opening symbols retained. No line erasure. Raw pixel comparison is diagnostic, not a dimensional certificate.','views':results},indent=2))
