"""Common plan tread polygons and height indices; all coordinates are millimetres.

Winder boundaries and structural thickness remain scan-derived/inferred. Floor
heights are resolved separately from the section, never from negative labels.
"""
import math


def rectangle(x, y, width, depth):
    return [(x, y), (x + width, y), (x + width, y + depth), (x, y + depth)]


def arc(cx, cy, rx, ry, start, end, segments=24):
    return [(cx + rx * math.cos(math.radians(start + (end-start)*i/segments)),
             cy + ry * math.sin(math.radians(start + (end-start)*i/segments)))
            for i in range(segments + 1)]


def main_stair(x, y):
    cx, spring = x + 1450, y + 1290
    # Rounded projecting first tread, followed by the six numbered straight treads.
    start = []
    for px, py, a in [(x+1600, y-125, 180), (x+3010-90, y-125, 270),
                      (x+3010-90, y-90, 0), (x+1600, y-90, 90)]:
        start.extend(arc(px, py, 90, 90, a, a+90, 8))
    treads = [dict(points=start, level=1)]
    for i in range(6):
        treads.append(dict(points=rectangle(cx+160, y+i*215, 1290, 215), level=i+2))
    # The source uses separated inner endpoints, not wedges meeting at one point.
    angles = [0, 48, 72, 90, 110, 138, 180]
    inner = [160, 160, 90, 0, -90, -160, -160]
    for i, (a, b) in enumerate(zip(angles, angles[1:])):
        points = [(cx+inner[i], spring)] + arc(cx, spring, 1450, 1200, a, b)
        points.append((cx+inner[i+1], spring))
        treads.append(dict(points=points, level=i+8))
    for i in range(6):
        treads.append(dict(points=rectangle(x, spring-(i+1)*215, 1290, 215), level=i+14))
    curved_edge = []
    for a,b in zip(angles,angles[1:]):
        curved_edge.extend(arc(cx,spring,1450,1200,a,b))
    return dict(id='stair', type='stair', fromFloor='ground', toFloor='first',
                x=x, y=y, width=2900, depth=2490, risers=19, flight=1290, centreGap=320,
                opening=[(x,y), (x+2900,y)] + curved_edge,
                bottomLanding=rectangle(cx+160,y-815,1290,600),
                topLanding=rectangle(x,y-600,1290,600),
                treads=treads)


def cellar_stair():
    treads = []
    # Negative labels count DOWN from ground; model levels count UP from cellar.
    for n in range(1, 6):
        treads.append(dict(points=rectangle(300, 2435+(n-1)*205, 1290, 205),
                           level=16-n, label=-n))
    for n, a, b in [(6, 135, 180), (7, 90, 135)]:
        treads.append(dict(points=[(1590,3460)] + arc(1590,3460,1290,1290,a,b),
                           level=16-n, label=-n))
    for n in range(8, 16):
        treads.append(dict(points=rectangle(1590+(n-8)*243,3460,243,1290),
                           level=16-n, label=-n))
    return dict(id='cellar-stair', type='stair-treads', fromFloor='cellar', toFloor='ground',
                risers=16, treads=treads,
                topLanding=rectangle(300,2300,1290,135),
                bottomLanding=rectangle(3534,3460,600,1290),
                registration=dict(landingStart=[300,2300], door='under-stair'))


def garage_stair():
    # Sheet 4: two intermediate treads, then the gallery-level landing.
    # Undimensioned riser positions and returns are scan-derived. Both flights
    # meet the rear wall; the first wraps the study corner to its first pier.
    inner_return = arc(5950, 7790, 100, 100, 180, 90, 12)
    lower = [(5600,6570),(5850,6570)] + inner_return + [
        (6020,7890),(6020,8170),(5880,8170),(5600,7890)]
    upper = [(5850,6570),(6110,6570),(6110,7890)] + list(reversed(inner_return))
    landing = rectangle(6110,6570,610,1320)
    return dict(id='garage-stair', type='stair-treads', fromFloor='garage', toFloor='ground',
                bottomLanding=rectangle(5000,6570,600,1320),
                topLanding=landing,
                source='Sheet 4: three risers; diagonal outer and rounded inner returns. Undimensioned plan details inferred from scan.',
                risers=3, treads=[
                    dict(points=lower,level=1,labelPosition=[5500,7035]),
                    dict(points=upper,level=2,labelPosition=[5750,7035]),
                    dict(points=landing,level=3,labelPosition=[6000,7035],flushLanding=True)])


def draw_treads(drawing, stair, upper_view=False):
    """Visible polygons are the canonical shapes read by both browser renderers."""
    drawing.add('fixtures', f'<g data-stair="{stair["id"]}">')
    for tread in stair['treads']:
        points = ' '.join(f'{x:.6f},{y:.6f}' for x,y in tread['points'])
        dashed = stair['id']=='stair' and not upper_view and tread['level']>=16
        cls = 'fixture dash' if dashed else 'fixture'
        # The flush landing is already visible as floor; retain its shared
        # polygon without inventing an extra riser around its perimeter.
        style = ' style="stroke:none"' if tread.get('flushLanding') else ''
        drawing.add('fixtures', f'<polygon class="{cls}" data-tread-level="{tread["level"]}" points="{points}"{style}/>')
        # Number away from the inner tip so the winder labels remain readable.
        pts = tread['points']
        if stair['id']=='stair' and 8<=tread['level']<=13:
            i=tread['level']-8
            angle=([0,48,72,90,110,138][i]+[48,72,90,110,138,180][i])/2
            tx,ty=arc(stair['x']+1450,stair['y']+1290,1190,990,angle,angle,1)[0]
        elif 'labelPosition' in tread:
            tx,ty=tread['labelPosition']
        else:
            tx=(min(p[0] for p in pts)+max(p[0] for p in pts))/2
            ty=(min(p[1] for p in pts)+max(p[1] for p in pts))/2
        drawing.text(tx,ty+65,str(tread.get('label',tread['level'])),'small-label')
    drawing.add('fixtures','</g>')
    drawing.geometry.append(stair)
