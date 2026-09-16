"""Digitise the supplied scan. Geometry uses mm; source dimensions retain provenance.

Scan coordinates below refer to the 1888px-wide reference sheets. Piecewise axis
anchors constrain major walls to readable dimension chains. Undimensioned details
remain inferred, rather than acquiring spurious precision from the SVG format.
"""
from pathlib import Path
import html
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'drawings'
OUTPUT.mkdir(exist_ok=True)
MANIFEST = []


def esc(value):
    return html.escape(str(value), quote=True)


def interpolate(value, anchors):
    for a, b in zip(anchors, anchors[1:]):
        if value <= b[0]:
            return a[1] + (value - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
    a, b = anchors[-2:]
    return a[1] + (value - a[0]) * (b[1] - a[1]) / (b[0] - a[0])


STYLE = '''
text{font-family:Arial,Helvetica,sans-serif;fill:#303e47}
.shell{fill:#fff}.walls{fill:none;stroke:#283238;stroke-linejoin:miter}
.wall-solid{fill:#283238;stroke:#283238;stroke-width:0}
.window{fill:#fff;stroke:#34454e;stroke-width:18}
.door{fill:none;stroke:#53636b;stroke-width:17}
.fixture{fill:none;stroke:#78848a;stroke-width:16}
.detail{fill:none;stroke:#4d5b62;stroke-width:20}
.roof{fill:#fff;stroke:#55676f;stroke-width:32;stroke-linejoin:round}
.dash{stroke-dasharray:120 95}
.room{stroke:none;cursor:pointer;transition:stroke .15s}
.room:hover,.room.selected{stroke:#168bff;stroke-width:35}
.room:focus{outline:none;stroke:#377da3;stroke-width:35}
.room-label{font-size:235px;letter-spacing:12px;pointer-events:none;text-anchor:middle}
.small-label{font-size:180px;fill:#6f8088;pointer-events:none;text-anchor:middle}
.dimension{fill:none;stroke:#608598;stroke-width:17}
.dim-label{font-size:205px;fill:#52778b;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:90;stroke-linejoin:round}
.level-label{font-size:200px;fill:#56778a;paint-order:stroke;stroke:#fff;stroke-width:65}
.drawing-title{font-size:310px;letter-spacing:28px}
.drawing-note{font-size:180px;fill:#7d8b91}
.drawing-scale{font-size:165px;fill:#617882}
.source-dimension{font-variant-numeric:tabular-nums}
[data-dimension]{cursor:pointer}[data-dimension]:hover .dim-label{fill:#20638a}
[data-dimension]:focus{outline:none}[data-dimension]:focus .dimension{stroke:#20638a;stroke-width:30}
'''


class Drawing:
    def __init__(self, id, title, kind, page, xa, ya, bounds, summary, facts):
        self.id, self.title, self.kind, self.page = id, title, kind, page
        self.xa, self.ya = xa, ya
        self.bounds, self.summary, self.facts = bounds, summary, facts
        self.layers = {k: [] for k in ['base', 'rooms', 'walls', 'openings', 'fixtures', 'labels', 'dimensions']}
        self.rooms, self.snaps, self.dimensions = [], [], []
        self.geometry = []
        self.checks = []
        self.issues = []
        self.source_image = None

    def x(self, v):
        return round(interpolate(v, self.xa), 2)

    def y(self, v):
        return round(interpolate(v, self.ya), 2)

    def point(self, p):
        return self.x(p[0]), self.y(p[1])

    def points(self, points):
        return ' '.join(f'{self.x(x)},{self.y(y)}' for x, y in points)

    def add(self, layer, text):
        self.layers[layer].append(text)

    def shell(self, points, thickness=230):
        pts = self.points(points)
        self.add('base', f'<polygon class="shell" points="{pts}"/>')
        self.add('walls', f'<defs><clipPath id="clip-{self.id}"><polygon points="{pts}"/></clipPath></defs>'
                 f'<polygon class="walls" points="{pts}" stroke-width="{thickness * 2}" clip-path="url(#clip-{self.id})"/>')
        self.snaps.extend(self.point(p) for p in points)

    def poly(self, points, layer='fixtures', cls='fixture', close=False, fill=None):
        tag = 'polygon' if close else 'polyline'
        extra = f' fill="{fill}"' if fill else ''
        self.add(layer, f'<{tag} class="{cls}" points="{self.points(points)}"{extra}/>')
        if layer!='dimensions':self.snaps.extend(self.point(p) for p in points)

    def wall(self, points, width=90):
        self.add('walls', f'<polyline class="walls" stroke-width="{width}" points="{self.points(points)}"/>')
        self.snaps.extend(self.point(p) for p in points)

    def rect(self, x, y, w, h, layer='fixtures', cls='fixture', radius=0):
        self.add(layer, f'<rect class="{cls}" x="{self.x(x)}" y="{self.y(y)}" width="{self.x(x+w)-self.x(x)}" height="{self.y(y+h)-self.y(y)}" rx="{radius}"/>')
        self.snaps.extend(self.point(p) for p in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)])

    def wallbox(self, name, x, y, width, height):
        self.add('walls', f'<rect data-wall="{esc(name)}" class="wall-solid" x="{x}" y="{y}" width="{width}" height="{height}"/>')
        self.geometry.append(dict(id=name, type='wall', x=x, y=y, width=width, height=height))
        self.snaps.extend([(x,y),(x+width,y),(x,y+height),(x+width,y+height)])

    def check(self, name, a, b, expected, source, axis='h'):
        actual=abs(b[0]-a[0]) if axis=='h' else abs(b[1]-a[1])
        self.checks.append(dict(name=name,a=a,b=b,expected=expected,actual=actual,axis=axis,source=source))

    def chain(self, start, values, reference, offset, axis='h', provenance='printed'):
        cursor=start
        for value in values:
            a=(cursor,reference) if axis=='h' else (reference,cursor)
            b=(cursor+value,reference) if axis=='h' else (reference,cursor+value)
            self.dim(a,b,offset,axis,provenance=provenance)
            cursor+=value
        return cursor

    def ellipse(self, x, y, rx, ry, cls='fixture'):
        self.add('fixtures', f'<ellipse class="{cls}" cx="{self.x(x)}" cy="{self.y(y)}" rx="{self.x(x+rx)-self.x(x)}" ry="{self.y(y+ry)-self.y(y)}"/>')

    def text(self, x, y, text, cls='small-label', layer='labels'):
        self.add(layer, f'<text class="{cls}" x="{self.x(x)}" y="{self.y(y)}">{esc(text)}</text>')

    def room(self, id, name, points, label, dims=None, category='living', note=None):
        colors = {key:'#fff' for key in ['living','wet','service','outdoor','void']}
        self.add('rooms', f'<polygon class="room" tabindex="0" role="button" aria-label="{esc(name)}" data-room="{id}" fill="{colors[category]}" points="{self.points(points)}"><title>{esc(name)}</title></polygon>')
        lines = name.split('|')
        for i, line in enumerate(lines):
            self.text(label[0], label[1]+i*13, line, 'room-label')
        if self.kind=='plan' and category not in ['void','outdoor']:
            self.text(label[0],label[1]+360,'tiles' if category=='wet' and id!='kitchen' else 'conc','small-label')
        item = dict(id=id, name=name.replace('|',' '), dimensions=dims, category=category, pointsMm=points,
                    note=note or 'Reconstructed room boundary. Dimensions describe the model or a named source span; see Dimension audit for the spans checked against the PDF.')
        self.rooms.append(item)

    def room_rect(self, id, name, x, y, w, h, label=None, dims=None, category='living', note=None):
        self.room(id, name, [(x,y),(x+w,y),(x+w,y+h),(x,y+h)], label or (x+w/2,y+h/2), dims, category, note)

    def window(self, x, y, length=1210, axis='h', thickness=230):
        X,Y = self.point((x,y))
        if axis == 'h':
            self.add('openings', f'<rect fill="#fff" x="{X}" y="{Y-thickness/2-20}" width="{length}" height="{thickness+40}"/>')
            self.add('openings', f'<rect class="window" x="{X}" y="{Y-thickness/2}" width="{length}" height="{thickness}"/>')
            self.add('openings', f'<path class="window" d="M {X} {Y} h {length}"/>')
            self.snaps.extend([(X,Y),(X+length,Y)])
        else:
            self.add('openings', f'<rect fill="#fff" x="{X-thickness/2-20}" y="{Y}" width="{thickness+40}" height="{length}"/>')
            self.add('openings', f'<rect class="window" x="{X-thickness/2}" y="{Y}" width="{thickness}" height="{length}"/>')
            self.add('openings', f'<path class="window" d="M {X} {Y} v {length}"/>')
            self.snaps.extend([(X,Y),(X,Y+length)])

    def opening(self, x, y, length, axis='h', thickness=120):
        X,Y = self.point((x,y))
        if axis == 'h':
            self.add('openings', f'<rect fill="#fff" x="{X}" y="{Y-thickness/2}" width="{length}" height="{thickness}"/>')
        else:
            self.add('openings', f'<rect fill="#fff" x="{X-thickness/2}" y="{Y}" width="{thickness}" height="{length}"/>')
        self.snaps.extend([(X,Y),(X+length,Y) if axis=='h' else (X,Y+length)])

    def door(self, x, y, width=820, angle=0, swing=1, thickness=140):
        X,Y = self.point((x,y))
        # Local x is the closed leaf; local y is the open leaf. Rotation puts it in the wall.
        self.add('openings', f'<g transform="translate({X} {Y}) rotate({angle}) scale(1 {swing})">'
                 f'<rect x="0" y="{-thickness/2}" width="{width}" height="{thickness}" fill="#fff"/>'
                 f'<path class="door" d="M 0 0 L 0 {width} M {width} 0 A {width} {width} 0 0 1 0 {width}"/></g>')
        a=math.radians(angle)
        self.snaps.extend([(X,Y),(X+width*math.cos(a),Y+width*math.sin(a))])

    def dim(self, a, b, offset, axis='h', label=None, provenance='printed'):
        # a/b are already in mm, so a stated dimension always measures its value.
        if axis == 'h':
            x1,y1=a; x2,y2=b; q=offset
            path=f'M {x1} {q-150} V {q+250} M {x2} {q-150} V {q+250} M {x1} {q} H {x2}'
            tx,ty=(x1+x2)/2,q-105
            ticks=f'M {x1-65} {q+65} l 130 -130 M {x2-65} {q+65} l 130 -130'
            length=abs(x2-x1)
            transform=''
        else:
            x1,y1=a; x2,y2=b; q=offset
            path=f'M {q-150} {y1} H {q+250} M {q-150} {y2} H {q+250} M {q} {y1} V {y2}'
            tx,ty=q-125,(y1+y2)/2
            ticks=f'M {q-65} {y1+65} l 130 -130 M {q-65} {y2+65} l 130 -130'
            length=abs(y2-y1)
            transform=f' transform="rotate(-90 {tx} {ty})"'
        text=label or f'{length:.0f}'
        font=' style="font-size:145px"' if length<350 else ''
        if length<350 and len(self.dimensions)%2==0:
            if axis=='h':ty-=160
            else:tx-=160;transform=f' transform="rotate(-90 {tx} {ty})"'
        self.add('dimensions', f'<g data-provenance="{provenance}" data-dimension="{len(self.dimensions)}" tabindex="0" role="button" aria-label="Printed dimension {esc(text)} millimetres"><title>{esc(text)} mm · source sheet {self.page}</title><path class="dimension" d="{path} {ticks}"/><text class="dim-label source-dimension" x="{tx}" y="{ty}"{transform}{font}>{esc(text)}</text></g>')
        line_a = [a[0], offset] if axis == 'h' else [offset, a[1]]
        line_b = [b[0], offset] if axis == 'h' else [offset, b[1]]
        self.dimensions.append(dict(a=a,b=b,lineA=line_a,lineB=line_b,value=length,label=text,axis=axis,provenance=provenance))

    def plan_dims(self, width, height, xchain, ychain):
        self.dim((0,0),(width,0),-2000)
        self.dim((width,0),(width,height),width+1700,'v')
        for a,b in zip(xchain,xchain[1:]):
            self.dim((a,0),(b,0),-1200)
        for a,b in zip(ychain,ychain[1:]):
            self.dim((0,a),(0,b),-1150,'v')

    def save(self):
        x,y,w,h=self.bounds
        title_y=y+h-540
        self.add('labels', f'<text class="drawing-title" x="{x+450}" y="{title_y}">{esc(self.title.upper())}</text>'
                 f'<text class="drawing-note" x="{x+450}" y="{title_y+340}">9 GLENN AVENUE · SOURCE SHEET {self.page} · DIMENSIONS IN mm</text>')
        # A true 5m bar for plans; a 2m bar for the cellar.
        bar=2000 if self.id=='cellar' else 5000
        bx=x+w-bar-450
        self.add('labels',f'<path d="M {bx} {title_y-20} h {bar} M {bx} {title_y-110} v 180 M {bx+bar/2} {title_y-80} v 140 M {bx+bar} {title_y-110} v 180" stroke="#617882" stroke-width="22"/>'
                 f'<text class="drawing-scale" x="{bx}" y="{title_y+290}">0</text><text class="drawing-scale" text-anchor="end" x="{bx+bar}" y="{title_y+290}">{bar/1000:g} m</text>')
        groups=''.join(f'<g data-layer="{k}" id="{self.id}-{k}">{"".join(v)}</g>' for k,v in self.layers.items())
        desc='Clean architectural reconstruction using straight lines, circular arcs and editable text. Millimetre model coordinates. See dimension audit for checked spans and unresolved source discrepancies.'
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w/100}mm" height="{h/100}mm" role="img" aria-label="{esc(self.title)}"><title>{esc(self.title)}</title><desc>{desc}</desc><style>{STYLE}</style><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff"/>{groups}</svg>'
        # A serializable primitive tree is the shared drawing model. Both browser
        # renderers consume it; standalone SVGs are generated artifacts.
        def record(node):
            item = dict(tag=node.tag.split('}')[-1], attributes=dict(node.attrib))
            if node.text: item['text'] = node.text
            if len(node): item['children'] = [record(child) for child in node]
            return item
        vector = record(ET.fromstring(svg))
        vector['attributes']['xmlns'] = 'http://www.w3.org/2000/svg'
        def serialize(node):
            attrs = ''.join(f' {k}="{esc(v)}"' for k,v in node['attributes'].items())
            content = esc(node.get('text', '')) + ''.join(serialize(c) for c in node.get('children', []))
            return f'<{node["tag"]}{attrs}>{content}</{node["tag"]}>'
        svg = serialize(vector)
        (OUTPUT/f'{self.id}.svg').write_text(svg)
        MANIFEST.append(dict(id=self.id,title=self.title,kind=self.kind,page=self.page,bounds=self.bounds,
                             summary=self.summary,facts=self.facts,rooms=self.rooms,snaps=self.snaps,
                             dimensions=self.dimensions,vector=vector,geometry=self.geometry,checks=self.checks,
                             issues=self.issues,sourceImage=self.source_image,cleanVector=True))


def bath(d,x,y,w=45,h=90):
    d.rect(x,y,w,h,radius=150)
    d.rect(x+4,y+5,w-8,h-10,radius=120)
    d.ellipse(x+w/2,y+12,2,2)


def basin(d,x,y,w=42,h=18):
    d.rect(x,y,w,h)
    d.ellipse(x+w/2,y+h/2,w*.27,h*.38)
