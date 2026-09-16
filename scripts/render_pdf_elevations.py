"""Render original PDF elevation sheets; registration is independent of SVG output."""
import hashlib,json
from pathlib import Path
import fitz
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/elevation-match'
SOURCE=Path('/Users/yinsee/Downloads/003 - 9 Glenn street.pdf')
REG={
 'front':dict(page=5,origin=[300,249],mmPerReferencePixel=[26630/1197,6041/274]),
 'rear':dict(page=6,origin=[372,270],mmPerReferencePixel=[26630/1190,6041/274]),
 'left':dict(page=5,origin=[612,799],mmPerReferencePixel=[13190/594,6041/275]),
 'right':dict(page=6,origin=[662,798],mmPerReferencePixel=[13190/593,6041/275]),
}
CAP=json.loads((OUT/'capture.json').read_text())
source=fitz.open(SOURCE)
pages={}
for number in [5,6]:
 page=source[number-1];pix=page.get_pixmap(matrix=fitz.Matrix(3,3),alpha=False)
 im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples).convert('L')
 im.save(OUT/f'original-pdf-sheet-{number}.png');pages[number]=im
for view in CAP['views']:
 name=view['view'];reg=REG[name];im=pages[reg['page']]
 ratio=im.width/1888;ox,oy=reg['origin'];sx,sy=reg['mmPerReferencePixel'];x,y,_,_=view['bounds'];step=view['mmPerPixel']
 # Maps output pixel centres to the original PDF raster; no matching to model edges.
 affine=(ratio*step/sx,0,ratio*(ox+x/sx),0,ratio*step/sy,ratio*(oy+y/sy))
 aligned=im.transform((view['width'],view['height']),Image.Transform.AFFINE,affine,Image.Resampling.BICUBIC,fillcolor=255)
 aligned.save(OUT/f'{name}-pdf-scan.png')
 aligned.point(lambda p:0 if p<180 else 255).convert('L').save(OUT/f'{name}-pdf-bw.png')
 reg.update(bounds=view['bounds'],outputMmPerPixel=step,referencePageWidth=1888,affineOutputToPdfRaster=affine)
(OUT/'pdf-reference.json').write_text(json.dumps(dict(source=str(SOURCE),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),registration=REG,method='Original PDF pages rendered at 216 dpi. Fixed translation and independent X/Y scales from printed plan span and 6041 mm CL-to-FL. No optimisation against model or SVG. Scan skew, annotation marks and paper grain remain.'),indent=2))
print('Rendered original PDF sheets 5/6 and registered all four elevations; no SVG input.')
