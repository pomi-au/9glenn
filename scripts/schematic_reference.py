"""Digitise the supplied scan. Geometry uses mm; source dimensions retain provenance.

Scan coordinates below refer to the 1888px-wide reference sheets. Piecewise axis
anchors constrain major walls to readable dimension chains. Undimensioned details
remain inferred, rather than acquiring spurious precision from the SVG format.
"""
from pathlib import Path
import html
import json
import math

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'drawings'
OUTPUT.mkdir(exist_ok=True)
MANIFEST = []
CAPTURE_ONLY = False


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
.shell{fill:#fff}.walls{fill:none;stroke:#34424a;stroke-linejoin:miter}
.window{fill:#fff;stroke:#5a859b;stroke-width:23}
.door{fill:none;stroke:#84959c;stroke-width:20}
.fixture{fill:none;stroke:#9eaaaf;stroke-width:19}
.detail{fill:none;stroke:#809097;stroke-width:23}
.roof{fill:#f7f9fa;stroke:#55676f;stroke-width:32;stroke-linejoin:round}
.dash{stroke-dasharray:120 95}
.room{stroke:none;cursor:pointer;transition:fill .15s}
.room:hover,.room.selected{fill:#dcecf5!important}
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

    def wall(self, points, width=90):
        self.add('walls', f'<polyline class="walls" stroke-width="{width}" points="{self.points(points)}"/>')
        self.snaps.extend(self.point(p) for p in points)

    def rect(self, x, y, w, h, layer='fixtures', cls='fixture', radius=0):
        self.add(layer, f'<rect class="{cls}" x="{self.x(x)}" y="{self.y(y)}" width="{self.x(x+w)-self.x(x)}" height="{self.y(y+h)-self.y(y)}" rx="{radius}"/>')

    def ellipse(self, x, y, rx, ry, cls='fixture'):
        self.add('fixtures', f'<ellipse class="{cls}" cx="{self.x(x)}" cy="{self.y(y)}" rx="{self.x(x+rx)-self.x(x)}" ry="{self.y(y+ry)-self.y(y)}"/>')

    def text(self, x, y, text, cls='small-label', layer='labels'):
        self.add(layer, f'<text class="{cls}" x="{self.x(x)}" y="{self.y(y)}">{esc(text)}</text>')

    def room(self, id, name, points, label, dims=None, category='living', note=None):
        colors = {'living':'#fafbfc', 'wet':'#eef5f7', 'service':'#f5f5f1', 'outdoor':'#f7f8f5', 'void':'#fff'}
        self.add('rooms', f'<polygon class="room" tabindex="0" role="button" aria-label="{esc(name)}" data-room="{id}" fill="{colors[category]}" points="{self.points(points)}"><title>{esc(name)}</title></polygon>')
        lines = name.split('|')
        for i, line in enumerate(lines):
            self.text(label[0], label[1]+i*13, line, 'room-label')
        item = dict(id=id, name=name.replace('|',' '), dimensions=dims, category=category, sourcePoints=points,
                    note=note or 'Room boundary reconstructed from the scan. Listed dimensions, where present, are transcribed from the original sheet.')
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
            path=f'M {x1} {y1} V {q+100} M {x2} {y2} V {q+100} M {x1} {q} H {x2}'
            tx,ty=(x1+x2)/2,q-105
            ticks=f'M {x1-65} {q+65} l 130 -130 M {x2-65} {q+65} l 130 -130'
            length=abs(x2-x1)
            transform=''
        else:
            x1,y1=a; x2,y2=b; q=offset
            path=f'M {x1} {y1} H {q-100} M {x2} {y2} H {q-100} M {q} {y1} V {y2}'
            tx,ty=q-125,(y1+y2)/2
            ticks=f'M {q-65} {y1+65} l 130 -130 M {q-65} {y2+65} l 130 -130'
            length=abs(y2-y1)
            transform=f' transform="rotate(-90 {tx} {ty})"'
        text=label or f'{length:,.0f}'.replace(',',' ')
        self.add('dimensions', f'<g data-provenance="{provenance}" data-dimension="{len(self.dimensions)}" tabindex="0" role="button" aria-label="Printed dimension {esc(text)} millimetres"><title>{esc(text)} mm · source sheet {self.page}</title><path class="dimension" d="{path} {ticks}"/><text class="dim-label source-dimension" x="{tx}" y="{ty}"{transform}>{esc(text)}</text></g>')
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
        desc='Reconstructed vector geometry. Printed dimensions govern annotated spans; unannotated positions and detail are estimated from the scanned drawing. Not a measured building survey.'
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w/100}mm" height="{h/100}mm" role="img" aria-label="{esc(self.title)}"><title>{esc(self.title)}</title><desc>{desc}</desc><style>{STYLE}</style><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff"/>{groups}</svg>'
        if not CAPTURE_ONLY:
            (OUTPUT/f'{self.id}.svg').write_text(svg)
        MANIFEST.append(dict(id=self.id,title=self.title,kind=self.kind,page=self.page,bounds=self.bounds,
                             summary=self.summary,facts=self.facts,rooms=self.rooms,snaps=self.snaps,
                             dimensions=self.dimensions,svg=svg))


def stairs(d, x=1018, y=650, w=132, h=116, down=False):
    # Winder layout traced from the architectural drawing, not a stair design.
    d.poly([(x,y),(x+w,y),(x+w,y+h*.52),(x+w*.91,y+h*.8),(x+w*.68,y+h),
            (x+w*.28,y+h),(x+w*.06,y+h*.81),(x,y+h*.58),(x,y)],cls='detail')
    d.poly([(x+w*.43,y),(x+w*.43,y+h*.50),(x+w*.61,y+h*.50),(x+w*.61,y)],cls='detail')
    for i in range(1,8):
        yy=y+6+i*7
        d.poly([(x+4,yy),(x+w*.40,yy)])
        d.poly([(x+w*.65,yy),(x+w-4,yy)])
    hub=(x+w*.51,y+h*.53)
    for end in [(x+w,y+h*.62),(x+w*.95,y+h*.82),(x+w*.8,y+h*.95),(x+w*.58,y+h),
                (x+w*.40,y+h),(x+w*.20,y+h*.93),(x+w*.05,y+h*.76)]:
        d.poly([hub,end])
    d.poly([(x+w*.8,y+h*.42),(x+w*.8,y+10),(x+w*.76,y+17),(x+w*.8,y+10),(x+w*.84,y+17)])
    d.text(x+w*.80,y-8,'DOWN' if down else 'UP')


def bath(d,x,y,w=45,h=90):
    d.rect(x,y,w,h,radius=150)
    d.rect(x+4,y+5,w-8,h-10,radius=120)
    d.ellipse(x+w/2,y+12,2,2)


def shower(d,x,y,size=45):
    d.rect(x,y,size,size)
    d.poly([(x,y),(x+size,y+size)])
    d.poly([(x+size,y),(x,y+size)])
    d.ellipse(x+size/2,y+size/2,2,2)


def basin(d,x,y,w=42,h=18):
    d.rect(x,y,w,h)
    d.ellipse(x+w/2,y+h/2,w*.27,h*.38)


def toilet(d,x,y):
    d.rect(x-8,y-12,16,9,radius=30)
    d.ellipse(x,y+4,7,10)


def ground():
    d=Drawing('ground','Ground floor','plan',4,
        [(302,0),(580,6230),(732,9600),(942,14325),(1094,17740),(1306,22550),(1488,26630)],
        [(300,0),(330,600),(558,5725),(594,6480),(655,8035),(868,12710),(895,13310),(916,13790),(1023,16070)],
        [-2300,-2750,31300,21000], 'Living spaces, garage and portico',
        [['Overall width','26,630 mm'],['Overall depth','16,070 mm'],['Ground floor area','245.46 m²'],['Garage area','43.24 m²'],['Porch area','8.19 m²'],['Total ground floor','296.89 m²']])
    outline=[(302,594),(606,594),(606,558),(732,558),(732,330),(1137,330),(1137,300),(1316,300),
             (1316,330),(1488,330),(1488,868),(1306,868),(1306,916),(1094,916),(1094,1023),
             (942,1023),(942,916),(732,916),(732,868),(580,868),(580,895),(302,895)]
    d.shell(outline)
    d.room_rect('garage','GARAGE',312,603,257,281,dims=[5930,6370],category='service',note='Clear garage dimensions printed as 5,930 × 6,370 mm. The upper wall has a separate 6,770 mm dimension because of the step in plan.')
    d.room_rect('study','STUDY',578,664,147,193,dims=[3630,4500])
    d.room_rect('living','LIVING',743,665,192,241,dims=[4450,5480])
    d.room_rect('dining','DINING',743,341,192,207,dims=[4450,4850])
    d.room('gallery','GALLERY',[(613,568),(939,568),(1010,598),(1010,644),(613,644)],(789,611),[9000,2020])
    d.room_rect('laundry','LAUNDRY',949,342,74,169,label=(985,411),dims=[2400,None],category='wet',note='Source lists 2,400 mm across the laundry zone. Its stepped enclosure includes a linen recess; the displayed boundary is scan-derived.')
    d.room_rect('pantry','PANTRY',1057,341,77,105,dims=[2000,2400],category='service')
    d.room_rect('powder','POWDER',949,499,99,54,label=(1000,536),category='wet')
    d.room('kitchen','KITCHEN',[(1059,452),(1144,452),(1144,310),(1308,310),(1308,556),(1123,556),(1123,527),(1059,527)],(1215,421),category='wet')
    d.room_rect('meals','MEALS',1318,341,159,214,dims=[3420,4865])
    d.room('family','FAMILY ROOM',[(1098,774),(1159,742),(1251,704),(1293,704),(1293,905),(1098,905)],(1188,803),[4580,None])
    d.room_rect('games','GAMES',1305,569,172,287,label=(1390,751),dims=[7370,5588],note='7,370 mm is the combined family/games span. Games and family are open to one another; their selection regions are illustrative.')
    d.room_rect('entry','ENTRY',950,775,134,130,dims=[3180,3150])
    d.room_rect('portico','PORTICO',951,924,134,90,category='outdoor',dims=[3210,2090])
    d.wall([(572,654),(734,654)],90)
    d.wall([(572,654),(572,868)],190)
    d.wall([(734,654),(734,916)],230)
    d.wall([(734,654),(942,654)],90)
    d.wall([(942,330),(942,786)],90)
    d.wall([(942,916),(942,849)],90)
    d.wall([(732,558),(1014,558)],90)
    d.wall([(942,446),(994,446),(994,518),(942,518)],90)
    d.wall([(994,493),(1054,493),(1054,558)],90)
    d.wall([(1024,330),(1024,398),(1052,398)],90)
    d.wall([(1052,330),(1052,447),(1138,447),(1138,330)],90)
    d.wall([(1054,529),(1127,529),(1127,562),(1196,562)],90)
    d.wall([(1014,646),(1014,767),(1090,767),(1090,916)],90)
    d.opening(767,558,3250,thickness=180)
    d.opening(767,655,3250,thickness=180)
    d.poly([(767,558),(912,558)],cls='detail dash')
    d.poly([(767,655),(912,655)],cls='detail dash')
    d.opening(330,895,4930,thickness=520)
    d.poly([(330,895),(550,895)],cls='detail dash')
    for x,y in [(433,596),(648,560),(771,914),(858,914),(578,869),(660,869),(1121,914),(1202,914),(1323,868),(1410,868),(957,334),(1067,334),(1372,334)]:
        d.window(x,y,1210)
    for x,y in [(1484,711),(1484,793)]: d.window(x,y,1210,'v')
    d.window(1148,305,3880)
    d.window(1139,310,500,'v')
    d.door(574,654,820,-90,1)
    d.door(698,655,820,0,1)
    d.door(1014,560,820,180,-1)
    d.door(1014,644,820,180,1)
    d.door(733,443,820,-90,-1,280)
    d.door(733,443,820,90,1,280)
    d.door(1485,439,820,-90,1,280)
    d.door(1485,439,820,90,-1,280)
    d.door(1485,610,820,-90,1,280)
    d.door(1485,610,820,90,-1,280)
    d.door(1050,915,820,180,1,300)
    d.door(978,915,820,0,-1,300)
    for x,y,a in [(962,447,0),(1053,445,0),(1053,561,90),(1127,564,90),(1023,529,90)]:d.door(x,y,720,a)
    stairs(d)
    # Kitchen joinery and sanitary fixtures.
    d.poly([(1148,451),(1148,316),(1308,316),(1308,560),(1252,560),(1252,518),(1281,518),(1281,340),(1171,340),(1171,451)],close=True)
    basin(d,1192,317,49,20)
    d.rect(1149,351,20,42)
    for yy in [360,381]:
        for xx in [1154,1163]: d.ellipse(xx,yy,3,3)
    d.rect(1197,341,45,36)
    d.text(1220,365,'DW')
    d.rect(1132,532,60,26)
    d.text(1162,551,'FR / FZ')
    d.poly([(949,349),(973,349),(973,443),(949,443)])
    d.rect(950,401,22,37)
    d.ellipse(962,420,8,10)
    basin(d,950,365,22,31)
    basin(d,1004,496,37,22)
    toilet(d,970,539)
    d.rect(950,452,39,58)
    d.text(969,485,'LINEN')
    d.poly([(1255,558),(1255,767),(1010,767)],cls='detail dash')
    d.text(1225,741,'CELLAR BELOW')
    for yy in [558,647]:
        d.add('fixtures',f'<circle cx="{d.x(1258)}" cy="{d.y(yy)}" r="155" fill="#57676d"/>')
    d.plan_dims(26630,16070,[0,6720,9600,18720,22910,26630],[0,600,5640,6480,13310,13790,16070])
    d.dim((0,13790),(6230,13790),17200)
    d.dim((6230,13790),(9600,13790),17200)
    d.dim((9600,13790),(22550,13790),17200)
    d.dim((22550,13790),(26630,13790),17200)
    d.dim((9830,830),(14280,830),1450,label='4 450 · dining')
    d.dim((9830,13560),(14280,13560),12900,label='4 450 · living')
    d.save()


def first():
    d=Drawing('first','First floor','plan',2,
        [(553,0),(736,4080),(916,8205),(944,8800),(1005,10245),(1188,14235),(1275,16225),(1310,17030),(1494,21110)],
        [(330,0),(514,4080),(542,4735),(598,6030),(653,7270),(683,7900),(718,8670),(770,9810),(872,12110),(922,13190)],
        [-6700,-2750,30200,19800],'Five bedrooms, studio and central void',
        [['Overall width','21,110 mm'],['Overall depth','13,190 mm'],['Upper floor area','252.98 m²'],['Bedrooms','5'],['External walls','230 mm typical'],['Internal partitions','90 mm typical']])
    d.shell([(736,330),(1494,330),(1494,872),(1310,872),(1310,922),(736,922),(736,872),(553,872),(553,514),(736,514)])
    d.room_rect('bed3','BEDROOM 3',745,341,161,194,label=(826,434),dims=[3850,4460])
    d.room_rect('bath1','BATH 1',924,342,73,136,label=(958,416),dims=[1950,3260],category='wet')
    d.room_rect('bed2','BEDROOM 2',1014,341,165,190,label=(1092,434),dims=[3900,4400])
    d.room_rect('wir3','W.I.R.',745,549,116,41,dims=[2830,1200],category='service')
    d.room_rect('wir2','W.I.R.',1064,549,113,41,dims=[2700,1200],category='service')
    d.room('wir1','W.I.R.',[(1196,341),(1247,341),(1247,439),(1270,439),(1270,589),(1196,589)],(1229,511),[1900,5690],'service')
    d.room_rect('wc1','WC',1260,342,29,83,label=(1274,386),dims=[900,1400],category='wet')
    d.room_rect('ensuite','ENSUITE',1305,342,179,88,label=(1382,391),dims=[4120,2200],category='wet')
    d.room_rect('bed1','BEDROOM 1',1283,448,201,226,label=(1382,565),dims=[4610,5270])
    d.room_rect('bath2','BATH 2',563,525,164,120,label=(647,596),dims=[3990,2890],category='wet')
    d.room_rect('bed5','BEDROOM 5',564,663,165,199,label=(643,765),dims=[3990,4620])
    d.room('bed4','BEDROOM 4',[(775,710),(823,710),(823,727),(934,727),(934,910),(746,910),(746,865),(766,836),(766,721)],(842,815),[4450,4290],note='Bedroom 4 has a stepped boundary. 4,450 mm is the lower full width; the drawing also gives a 3,850 mm span and a 4,290 mm room-depth dimension.')
    d.room_rect('wir4','W.I.R.',840,665,94,43,label=(887,699),dims=[2400,1320],category='service')
    d.room_rect('linen','LINEN',951,695,60,66,label=(981,737),dims=[1580,1700],category='service')
    d.room('studio','STUDIO',[(1161,691),(1484,691),(1484,862),(1301,862),(1301,911),(1105,911),(1105,780),(1132,760),(1161,724)],(1296,778),[8660,5080],note='Studio has a stepped perimeter: printed spans include 8,660, 7,370 and 4,580 mm; depths include 5,080 and 4,000 mm.')
    d.room_rect('void','VOID',954,779,131,132,category='void',dims=[3180,3150],note='Open void above the entry. This is not walkable floor area.')
    d.wall([(916,330),(916,558)],90)
    d.wall([(736,542),(862,542)],90)
    d.wall([(870,598),(870,562)],90)
    d.wall([(736,598),(918,598)],90)
    d.wall([(916,486),(1005,486)],90)
    d.wall([(916,542),(954,542),(954,520)],90)
    d.wall([(1005,330),(1005,554)],90)
    d.wall([(1005,598),(1188,598),(1188,330)],90)
    d.wall([(1058,598),(1058,539),(1188,539)],90)
    d.wall([(1253,330),(1253,439),(1494,439)],90)
    d.wall([(1295,330),(1295,400)],90)
    d.wall([(1275,478),(1275,598),(1188,598)],90)
    d.wall([(1222,683),(1494,683)],90)
    d.wall([(553,653),(769,653)],90)
    d.wall([(739,653),(739,696),(768,696),(768,835),(739,865)],90)
    d.wall([(768,710),(831,710),(831,653),(944,653),(944,922)],90)
    d.wall([(831,718),(944,718)],90)
    d.wall([(944,770),(1094,770),(1094,922)],190)
    d.wall([(982,688),(1018,688),(1018,770)],90)
    for x,y in [(779,331),(862,331),(947,331),(1027,331),(1110,331),(1255,331),(1337,331),(1406,331),
                (593,872),(677,872),(776,922),(861,922),(1131,922),(1216,922),(1344,872),(1425,872)]: d.window(x,y)
    d.window(1490,451,1210,'v')
    for y in [571,700,793]: d.window(1490,y,1210,'v')
    d.window(557,582,1210,'v')
    d.window(701,518,610)
    d.window(971,924,2410)
    for x,y,w,a,s in [(843,542,720,0,1),(907,598,820,180,1),(1005,598,820,0,-1),
                       (1058,539,720,180,-1),(1254,439,720,0,-1),(1344,439,820,0,-1),
                       (1275,480,820,-90,1),(1275,598,820,0,1),(1222,683,820,0,-1),
                       (729,653,820,180,-1),(739,696,820,0,-1),(768,719,820,90,-1),
                       (831,718,720,-90,1),(944,718,720,-90,1),(982,688,720,90,1),
                       (954,486,720,0,-1),(1190,683,720,-90,1)]:d.door(x,y,w,a,s)
    stairs(d,1018,653,137,117,True)
    shower(d,921,338,45)
    basin(d,920,404,21,42)
    toilet(d,932,466)
    shower(d,1434,340,50)
    basin(d,1310,343,115,23)
    toilet(d,1273,358)
    shower(d,564,527,44)
    basin(d,623,526,75,20)
    toilet(d,718,540)
    bath(d,559,578,33,69)
    for x,y,w,h in [(749,549,111,23),(1067,547,94,25),(1210,355,28,218),(840,674,91,32),(950,700,49,46)]:d.rect(x,y,w,h)
    d.poly([(945,922),(945,1022),(1100,1022),(1100,922)],cls='detail dash')
    d.text(1021,987,'PORTICO ROOF BELOW')
    d.poly([(553,596),(302,596),(302,903),(553,903)],cls='detail dash')
    d.poly([(302,596),(455,749),(553,749)],cls='detail dash')
    d.poly([(302,903),(455,749)],cls='detail dash')
    d.text(423,835,'GARAGE ROOF BELOW')
    d.poly([(954,910),(1020,845),(1083,910)],cls='detail dash')
    d.plan_dims(21110,13190,[0,4080,21110],[0,4080,12110,13190])
    for a,b in [(0,4080),(4080,17030),(17030,21110)]: d.dim((a,13190),(b,13190),15100)
    d.dim((4310,230),(8160,230),1200,label='3 850 · bed 3')
    d.dim((10290,230),(14190,230),1200,label='3 900 · bed 2')
    d.dim((16270,4400),(20880,4400),5700,label='4 610 · bed 1')
    d.save()


def cellar():
    d=Drawing('cellar','Cellar','plan',3,[(252,0),(310,1290),(516,5927)],[(359,0),(449,2000),(585,5050)],
        [-2000,-2700,10000,10300],'Basement and access stair',
        [['Overall width','5,927 mm'],['Overall depth','5,050 mm'],['Main clear width','4,037 mm'],['Main clear depth','4,450 mm'],['Wall thickness','300 mm'],['Clear cellar height','2,400 mm (section)']])
    d.shell([(310,359),(516,359),(516,585),(252,585),(252,449),(310,449)],300)
    d.room('cellar-room','CELLAR',[(322,372),(503,372),(503,572),(404,572),(404,513),(322,513)],(409,457),[4037,4450],category='service',note='Main rectangular clear space is 4,037 × 4,450 mm. Overall outline is 5,927 × 5,050 mm with the stair recess.')
    d.poly([(264,471),(320,471),(320,516),(398,516),(398,572),(303,572),(280,563),(264,542),(264,471)],cls='detail')
    for y in [480,491,502,513,524]:d.poly([(266,y),(317,y)])
    for x in [321,334,347,360,373,386]:d.poly([(x,518),(x,571)])
    for x,y in [(267,546),(280,563),(299,573)]:d.poly([(317,518),(x,y)])
    d.poly([(376,557),(388,557),(382,551),(388,557),(382,563)])
    d.text(403,548,'UP')
    d.poly([(252,585),(242,600),(271,600),(271,585)],cls='detail')
    d.text(272,623,'AIR SHAFT')
    d.plan_dims(5927,5050,[0,1290,5927],[0,2000,5050])
    d.dim((1590,300),(5627,300),950,label='4 037 clear')
    d.dim((5627,300),(5627,4750),4800,'v',label='4 450 clear')
    d.save()


def elevation_window(d,x,y,w,h,pattern='awning'):
    d.rect(x,y,w,h,cls='detail')
    d.rect(x+2,y+2,w-4,h-4)
    if pattern=='awning':d.poly([(x+2,y+3),(x+w/2,y+h-3),(x+w-2,y+3)])
    if pattern=='door':
        d.poly([(x,y),(x+w,y+h)])
        d.poly([(x+w,y),(x,y+h)])


def levels(d, ground_y, ceiling_y, first_y, top_y, cellar_y, x1, x2, dim_x):
    for y,label in [(top_y,'UPPER CEILING · 68c + plate'),(first_y,'FIRST FLOOR · 36c'),(ceiling_y,'GROUND CEILING · 34c'),(ground_y,'GROUND FLOOR · −02c'),(cellar_y,'CELLAR FLOOR · −32c')]:
        d.poly([(x1,y),(x2,y)],layer='dimensions',cls='dimension dash')
        label_y = d.y(y) - 140
        if y == first_y:
            label_y = d.y(y) - 300
        elif y == ceiling_y:
            label_y = d.y(y) + 350
        d.add('dimensions',f'<text class="level-label" x="{d.x(x1)}" y="{label_y}">{esc(label)}</text>')
    for ya,yb,value in [(top_y,first_y,2783),(first_y,ceiling_y,172),(ceiling_y,ground_y,3086)]:
        d.dim((d.x(x1),d.y(ya)),(d.x(x1),d.y(yb)),d.x(dim_x),'v',label=f'{value:,}'.replace(',',' '))
    d.dim((d.x(x1),d.y(ground_y)+172),(d.x(x1),d.y(cellar_y)),d.x(dim_x),'v',label='2 400')


def front():
    d=Drawing('elevation-1','Elevation 1 · front','elevation',5,
        [(300,0),(583,6230),(733,9600),(942,14325),(1097,17740),(1306,22550),(1497,26630)],
        [(249,0),(375,2783),(383,2955),(523,6041),(638,8613)],
        [-4700,-3450,33300,13200],'Front façade and portico',
        [['Ground ceiling height','3,086 mm'],['Upper ceiling height','2,783 mm'],['Floor zone','172 mm'],['Cellar clear height','2,400 mm'],['Main roof pitch','20°49′'],['Front roof pitch','25°']])
    d.poly([(550,247),(1497,247),(1497,523),(550,523)],'base','roof',True,'#fff')
    d.poly([(550,247),(550,417),(733,417),(942,417),(942,523),(1097,523),(1097,417),(1497,417)],cls='detail')
    d.poly([(544,242),(819,134),(1225,134),(1503,241)],'base','roof',True)
    d.poly([(727,242),(1018,127),(1320,242)],'base','roof',True)
    for y in [249,259,270]:d.poly([(550,y),(1497,y)],cls='detail')
    d.poly([(300,411),(458,348),(551,348),(590,407)],'base','roof',True)
    d.poly([(300,411),(585,411),(585,551),(300,551)],'base','roof',True,'#fff')
    for y in [417,435,445]:d.poly([(303,y),(585,y)],cls='detail')
    d.poly([(326,551),(326,447),(577,447),(577,551)],cls='detail')
    # Portico with arched entry and upper feature window.
    d.poly([(938,242),(1018,201),(1103,242),(1072,242),(1072,350),(1101,350),(1101,523),(938,523),(938,350),(966,350),(966,242)],'base','roof',True,'#fff')
    for dx,yy in [(0,0),(7,7)]:
        X,Y=d.point((979+dx,523)); mid=d.x(1018); end=d.x(1058-dx); spring=d.y(425+yy); peak=d.y(348+yy)
        d.add('fixtures',f'<path class="detail" d="M {X} {Y} V {spring} Q {mid} {peak} {end} {spring} V {Y}"/>')
    X,Y=d.point((982,347));end=d.x(1057);spring=d.y(276);peak=d.y(208)
    d.add('fixtures',f'<path class="detail" d="M {X} {Y} V {spring} Q {d.x(1018)} {peak} {end} {spring} V {Y} Z"/>')
    d.poly([(1018,242),(1018,346)],cls='detail')
    d.poly([(982,277),(1057,277)],cls='detail')
    d.poly([(939,350),(1102,350),(1102,357),(939,357)],cls='detail',close=True)
    for x in [940,1073]:
        for y in [494,504]: d.rect(x,y,28,7,cls='detail')
    for x in [592,668,776,860,1132,1213,1326,1405]: elevation_window(d,x,278,54,67)
    for x in [593,671,777,861,1132,1213,1326,1405]: elevation_window(d,x,425,54,68)
    for x,w in [(585,143),(767,157),(1122,158),(1319,158)]:
        for y in [347,496]:d.rect(x,y,w,7)
    d.poly([(299,552),(585,552),(585,527),(1516,527)],cls='detail')
    d.poly([(1005,526),(1005,638),(1275,638),(1275,526)],cls='detail dash')
    d.text(1136,600,'CELLAR BELOW')
    d.text(1210,192,'TILE ROOF · 20°49′')
    levels(d,523,383,375,249,638,140,1525,175)
    d.save()


def side2():
    d=Drawing('elevation-2','Elevation 2 · left side','elevation',5,
        [(612,0),(1206,13190)],[(799,0),(925,2783),(933,2955),(1074,6041),(1190,8613)],
        [-4400,-3300,23000,13200],'Left side and garage roof',
        [['Ground ceiling height','3,086 mm'],['Upper ceiling height','2,783 mm'],['Floor zone','172 mm'],['Cellar clear height','2,400 mm'],['Roof pitch','20°49′'],['Small metal roof','1°']])
    d.poly([(611,800),(1207,800),(1207,1075),(611,1075)],'base','roof',True,'#fff')
    d.poly([(605,797),(885,685),(1165,788),(1208,795),(909,678),(885,685)],'base','roof',True)
    for y in [801,811,821,830]:d.poly([(612,y),(1207,y)],cls='detail')
    d.poly([(793,721),(793,932),(837,932),(837,968),(875,968)],cls='detail')
    d.poly([(586,967),(875,967)],cls='detail')
    d.poly([(613,925),(585,934),(585,967),(613,967)],cls='detail',close=True)
    d.poly([(1207,898),(1307,898),(1307,1074),(1207,1074)],'base','roof',True,'#fff')
    d.poly([(1207,933),(1307,933)],cls='detail')
    X,Y=d.point((1224,1074));end=d.x(1285);sy=d.y(979)
    d.add('fixtures',f'<path class="detail" d="M {X} {Y} V {sy} Q {d.x(1255)} {d.y(918)} {end} {sy} V {Y}"/>')
    d.poly([(870,958),(1027,898),(1192,958)],'base','roof',True)
    d.poly([(876,964),(1185,964),(1185,1098),(876,1098)],'base','roof',True,'#fff')
    for y in [971,987,997]:d.poly([(876,y),(1185,y)],cls='detail')
    elevation_window(d,872,830,50,50)
    elevation_window(d,645,978,28,89)
    elevation_window(d,673,978,23,57)
    elevation_window(d,697,978,76,91,'door')
    elevation_window(d,776,978,21,57)
    d.poly([(560,1078),(875,1078),(875,1101),(1231,1101)],cls='detail')
    d.poly([(814,1078),(814,1190),(1040,1190),(1040,1078)],cls='detail dash')
    d.text(928,1150,'CELLAR BELOW')
    d.text(934,751,'TILE ROOF · 20°49′')
    levels(d,1074,933,925,799,1190,470,1350,510)
    d.save()


def rear():
    d=Drawing('elevation-3','Elevation 3 · rear','elevation',6,
        [(372,0),(1137,17030),(1318,21110),(1562,26630)],
        [(270,0),(396,2783),(404,2955),(544,6041),(659,8613)],
        [-4200,-3300,32800,13200],'Rear façade, service rooms and garage',
        [['Ground ceiling height','3,086 mm'],['Upper ceiling height','2,783 mm'],['Floor zone','172 mm'],['Cellar clear height','2,400 mm'],['Roof pitch','20°49′']])
    d.poly([(372,270),(1318,277),(1318,544),(372,539)],'base','roof',True,'#fff')
    d.poly([(369,260),(645,157),(1045,157),(1137,194),(1324,269),(1137,263)],'base','roof',True)
    d.poly([(1137,194),(1137,295),(372,290)],cls='detail')
    for y in [272,282,293]:d.poly([(372,y),(1137,y+3),(1318,y+9)],cls='detail')
    d.poly([(372,436),(1137,441),(1318,446)],cls='detail')
    d.poly([(1137,298),(1137,544)],cls='detail')
    d.poly([(1260,440),(1564,440),(1564,575),(1260,575)],'base','roof',True,'#fff')
    d.poly([(1318,373),(1410,374),(1570,437),(1260,435),(1260,406),(1318,406)],'base','roof',True)
    for y in [448,460,474]:d.poly([(1260,y),(1562,y+5)],cls='detail')
    d.poly([(537,383),(728,383),(728,539),(537,539)],'base','roof',True,'#fff')
    for y in [391,399,409]:d.poly([(538,y),(728,y)],cls='detail')
    for x,y,w,h in [(438,299,27,18),(540,299,27,18),(577,299,27,18),(702,300,52,57),
                    (782,300,52,59),(862,305,25,47),(970,302,52,60),(1048,303,52,60),(1138,307,25,19),
                    (411,445,61,59),(547,445,86,51),(635,445,86,51),(1169,450,52,61),(1341,477,55,49)]:
        elevation_window(d,x,y,w,h,'awning' if h>30 else 'fixed')
    elevation_window(d,743,449,47,26,'fixed')
    elevation_window(d,850,451,38,90,'door')
    elevation_window(d,890,451,24,49)
    d.poly([(300,546),(1218,553),(1259,578),(1561,580)],cls='detail')
    d.poly([(592,549),(592,659),(858,659),(858,549)],cls='detail dash')
    d.text(723,617,'CELLAR BELOW')
    d.text(804,209,'TILE ROOF · 20°49′')
    levels(d,544,404,396,270,659,190,1578,220)
    d.save()


def side4():
    d=Drawing('elevation-4','Elevation 4 · right side','elevation',6,
        [(662,0),(1255,13190)],[(798,0),(924,2783),(932,2955),(1073,6041),(1189,8613)],
        [-4400,-3300,22500,13200],'Right side with meals and games openings',
        [['Ground ceiling height','3,086 mm'],['Upper ceiling height','2,783 mm'],['Floor zone','172 mm'],['Cellar clear height','2,400 mm'],['Roof pitch','20°49′']])
    d.poly([(662,798),(1255,798),(1255,1073),(662,1073)],'base','roof',True,'#fff')
    d.poly([(656,791),(960,678),(979,686),(1258,792)],'base','roof',True)
    d.poly([(711,791),(979,686)],cls='detail')
    for y in [799,809,819,827]:d.poly([(661,y),(1255,y)],cls='detail')
    d.poly([(711,823),(711,1073)],cls='detail')
    d.poly([(662,964),(1255,969)],cls='detail')
    d.poly([(559,898),(658,898),(658,1072),(559,1072)],'base','roof',True,'#fff')
    d.poly([(560,934),(658,934)],cls='detail')
    X,Y=d.point((578,1072));end=d.x(640);sy=d.y(978)
    d.add('fixtures',f'<path class="detail" d="M {X} {Y} V {sy} Q {d.x(609)} {d.y(920)} {end} {sy} V {Y}"/>')
    for x in [750,819,917,1077]:elevation_window(d,x,829,53,66)
    for x in [749,819]:elevation_window(d,x,975,53,68)
    for x in [905,1012,1076,1184]:elevation_window(d,x,977,28,62)
    for x in [936,1107]:elevation_window(d,x,977,74,94,'door')
    d.poly([(1255,915),(1288,932),(1255,932)],cls='detail',close=True)
    d.poly([(803,1077),(803,1189),(1030,1189),(1030,1077)],cls='detail dash')
    d.poly([(490,1074),(1420,1081)],cls='detail')
    d.text(916,1141,'CELLAR BELOW')
    d.text(980,746,'TILE ROOF · 20°49′')
    levels(d,1073,932,924,798,1189,510,1340,530)
    d.save()


def section():
    d=Drawing('section','Section X–X','section',7,
        [(815,0),(1396,13190)],[(345,0),(474,2783),(482,2955),(623,6041),(740,8613)],
        [-4500,-3300,23100,13200],'Vertical section through kitchen, family room and cellar',
        [['Ground ceiling height','3,086 mm'],['Upper ceiling height','2,783 mm'],['Floor zone','172 mm'],['Cellar clear height','2,400 mm'],['Cellar walls','300 mm cavity brick'],['Roof pitch','20°49′']])
    d.poly([(814,345),(1396,345),(1396,622),(814,622)],'base','roof',True,'#fff')
    d.poly([(1037,623),(1255,623),(1255,740),(1037,740)],'base','roof',True,'#fff')
    d.poly([(806,338),(1075,229),(1405,337),(1395,346),(1075,240),(815,346)],'base','roof',True)
    for pts,width in [([(815,345),(815,623)],230), ([(1396,345),(1396,623)],230),
                     ([(815,477),(1396,477)],172), ([(790,622),(1396,622)],172),
                     ([(1037,623),(1037,740),(1255,740),(1255,623)],300),
                     ([(1074,345),(1074,474)],90), ([(1158,345),(1158,474)],90)]: d.wall(pts,width)
    d.room_rect('section-wir','W.I.R.',830,352,236,112,label=(956,416),category='service')
    d.room_rect('section-pass','PASSAGE',1083,352,67,112,label=(1116,416))
    d.room_rect('section-studio','STUDIO',1167,352,215,112,label=(1250,416))
    d.room_rect('section-kitchen','KITCHEN',825,491,220,118,label=(930,539),category='wet')
    d.room_rect('section-family','FAMILY',1060,492,322,118,label=(1219,508))
    d.room_rect('section-cellar','CELLAR',1048,636,194,93,label=(1147,680),category='service')
    for x,y,w,h in [(920,372,41,95),(1115,372,35,96),(1186,372,52,67),(1255,372,54,67),
                    (1187,519,53,68),(1255,519,54,68)]:elevation_window(d,x,y,w,h,'fixed')
    d.poly([(922,352),(922,469)],cls='detail')
    d.poly([(922,393),(1048,393)],cls='detail')
    d.poly([(791,576),(1034,576),(1034,615),(791,615)],cls='detail',close=True)
    for x in [827,846,879,912,945,978,1011]:d.poly([(x,577),(x,615)])
    d.rect(846,519,137,56)
    for x in [879,913,947]:d.poly([(x,520),(x,574)])
    d.poly([(1016,616),(1016,519),(1155,519),(1155,616)],cls='detail')
    d.poly([(1040,483),(1040,615)],cls='detail')
    for x,y,w,h in [(785,624,16,14),(1387,624,16,14),(1030,742,20,13),(1248,742,20,13)]:d.rect(x,y,w,h,cls='detail')
    d.poly([(782,471),(814,459)],cls='detail')
    d.text(1261,281,'TILED ROOF · 20°49′')
    d.text(1130,794,'300 mm CELLAR WALLS')
    levels(d,623,482,474,345,740,641,1450,687)
    d.save()


if __name__ == '__main__':
    ground(); first(); cellar(); front(); side2(); rear(); side4(); section()
    (ROOT/'assets'/'drawings.js').write_text('window.DRAWINGS = '+json.dumps(MANIFEST,separators=(',',':'))+';\n')
    (ROOT/'assets'/'drawing-data.json').write_text(json.dumps([{k:v for k,v in d.items() if k!='svg'} for d in MANIFEST],indent=2))
    print(f'Generated {len(MANIFEST)} SVG drawings and manifest.')
