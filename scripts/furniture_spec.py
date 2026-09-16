"""User-requested outdoor furniture; sizes and arrangement are model choices."""
import math

ITEMS = [
    ('patio-dining-table', 'table', 'Patio dining table', 28800, 2700, 900, 1800, 0),
    ('patio-chair-west-1', 'chair', 'Patio chair', 27850, 2250, 540, 560, 90),
    ('patio-chair-west-2', 'chair', 'Patio chair', 27850, 3150, 540, 560, 90),
    ('patio-chair-east-1', 'chair', 'Patio chair', 29750, 2250, 540, 560, -90),
    ('patio-chair-east-2', 'chair', 'Patio chair', 29750, 3150, 540, 560, -90),
    ('patio-chair-rear', 'chair', 'Patio chair', 28800, 1470, 540, 560, 180),
    ('patio-chair-front', 'chair', 'Patio chair', 28800, 3930, 540, 560, 0),
    ('pool-lounger-1', 'lounger', 'Poolside lounger', 32280, 8200, 650, 1950, 0),
    ('pool-lounger-2', 'lounger', 'Poolside lounger', 32280, 10800, 650, 1950, 0),
    ('pool-side-table', 'side-table', 'Poolside table', 32280, 9500, 450, 450, 0),
    ('patio-canvas-canopy', 'canopy', 'Patio canvas canopy', 28800, 2700, 3600, 4000, 0),
]


def draw_furniture(d):
    for id, form, name, x, z, width, depth, angle in ITEMS:
        a = math.radians(angle)
        points = [(x+u*math.cos(a)-v*math.sin(a), z+u*math.sin(a)+v*math.cos(a))
                  for u,v in [(-width/2,-depth/2),(width/2,-depth/2),
                              (width/2,depth/2),(-width/2,depth/2)]]
        style = ('fill:none;stroke:#776753;stroke-width:20;stroke-dasharray:90 60'
                 if form == 'canopy' else 'fill:#cbb496;stroke:#776753;stroke-width:20')
        d.add('fixtures', f'<g data-furniture="{id}"><polygon data-furniture-outline="true" '
              f'points="{d.points(points)}" style="{style}"/></g>')
        if form == 'canopy':
            d.add('fixtures', f'<path d="M {x} {z-depth/2} V {z+depth/2}" '
                  'style="fill:none;stroke:#776753;stroke-width:15;stroke-dasharray:90 60"/>')
            for px,pz in points:
                d.add('fixtures', f'<rect x="{px+30 if px<x else px-90}" '
                      f'y="{pz+30 if pz<z else pz-90}" width="60" height="60" fill="#343c39"/>')
        d.geometry.append(dict(id=id, type='furniture', form=form, name=name,
            source='User-requested patio and poolside furniture; arrangement, finishes and dimensions are model choices'))
    d.text(28800,940,'PATIO DINING','small-label')
    d.issues.append('Patio dining furniture and pool loungers are proposed furnishings, not traced from the original PDF or photographs.')
