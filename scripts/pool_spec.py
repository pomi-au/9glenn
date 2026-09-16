"""Pool footprint inferred from the aerial and two ground-level photographs."""
import math

POOL = dict(depth=1360, waterDepth=1200, shellThickness=180, waterDrop=160,
            copingThickness=80, pavingThickness=160,
            stepDrops=[350, 350],
            stepGroups=[[0], [1]],
            footprint=dict(x=27630, z=5300, width=4000, length=8300,
                           houseWaterGap=1000, entryRadius=1300,
                           oppositeEntryRadius=1300))


def offset_ring(ring, distance):
    """Parallel miter offset of the simple counter-clockwise basin boundary."""
    normals = []
    for i, (x, z) in enumerate(ring):
        xx, zz = ring[(i+1) % len(ring)]
        length = math.hypot(xx-x, zz-z)
        normals.append(((zz-z)/length, -(xx-x)/length))
    out = []
    for i, (x, z) in enumerate(ring):
        a, b = normals[i-1], normals[i]
        den = 1 + a[0]*b[0] + a[1]*b[1]
        out.append((x+distance*(a[0]+b[0])/den, z+distance*(a[1]+b[1])/den))
    return out


def draw_pool(d):
    x = POOL['footprint']['x']
    body_rear, body_front, width = 6600, 12300, 4000
    entry_centre, entry_radius = x+width/2, 1300

    def rear_arc(radius):
        # Matching semicircular entries at both ends, as clarified by the user.
        return [(entry_centre-radius*math.cos(i*math.pi/32),
                 body_rear-radius*math.sin(i*math.pi/32)) for i in range(33)]

    def front_arc(radius):
        return [(xx, body_front+body_rear-zz) for xx, zz in reversed(rear_arc(radius))]

    water = [(x,body_rear), *rear_arc(entry_radius),
             (x+width,body_rear),(x+width,body_front),
             *front_arc(entry_radius),(x,body_front)]
    shapes = [('paving', [(26630,600),(32630,600),(32630,14500),(26630,14500)]),
              ('coping', offset_ring(water,300)), ('water', water),
              ('lining', offset_ring(water,-25))]
    shapes.append(('step-0', rear_arc(entry_radius)))
    shapes.append(('step-1', front_arc(entry_radius)))
    shapes.append(('fountain', [(entry_centre+280*math.cos(i*math.pi/16),
                                 13000+280*math.sin(i*math.pi/16)) for i in range(32)]))
    parts = []
    fills = {'water': '#b9ded8', 'paving': '#e9dcc0', 'coping': '#e9dcc0'}
    for name, points in shapes:
        parts.append(f'<polygon data-pool-part="{name}" points="{d.points(points)}" '
                     f'style="fill:{fills.get(name, "none")};'
                     f'stroke:#648c86;stroke-width:18"/>')
    d.add('fixtures', '<g data-pool="swimming-pool">'+''.join(parts)+'</g>')
    d.text(entry_centre,13380,'FOUNTAIN','small-label')
    d.geometry.append(dict(id='swimming-pool', type='pool', name='Swimming pool',
                           source='User aerial and two pool close-ups: two rounded entries; footprint estimated; 1.2 m water depth and single entry steps specified by user'))
    d.text(x+width/2,9300,'SWIMMING POOL','room-label')
    d.text(x+width/2,9700,'PHOTO ESTIMATE · 8.3 × 4.0 m','small-label')
    d.issues.append('Pool repositioned beside the front portion of the east wall from the aerial; two rounded entries follow the close-ups. Approximate 8.3 × 4.0 m overall water envelope and 1.0 m wall-to-water gap; water depth is 1.2 m with one submerged step per entry as specified by the user. Step level is inferred.')
