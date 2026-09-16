"""Typed fixture footprints. Plan coordinates live only in the vector tree."""
from vector_drawing import esc


def fixture(d, id, points, profile, name, room=None, holes=()):
    d.poly(points, close=True)
    outline = d.layers['fixtures'].pop().replace('<polygon ', '<polygon data-fixture-outline="" ', 1)
    for x, y, rx, ry in holes:
        outline += f'<ellipse class="fixture" data-fixture-hole="" cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/>'
    d.add('fixtures', f'<g data-fixture="{esc(id)}">{outline}</g>')
    d.geometry.append(dict(id=id, type='fixture', profile=profile, name=name, room=room,
                          source='PDF plan outline; undimensioned depths reconstructed from scan; vertical dimensions inferred'))


def rect_fixture(d, id, x, y, width, depth, profile, name, room=None, holes=()):
    fixture(d, id, [(x,y),(x+width,y),(x+width,y+depth),(x,y+depth)], profile, name, room, holes)


def vanity(d, id, x, y, width, depth, room):
    rect_fixture(d, id, x, y, width, depth, 'vanity', 'Vanity top', room,
                 [(x+width/2,y+depth/2,width*.27,depth*.38)])


def glass_panel(d, id, start, end, door_id):
    d.poly([start, end])
    line = d.layers['fixtures'].pop().replace('<polyline ', '<polyline data-fixture-outline="" ', 1)
    d.add('fixtures', f'<g data-fixture="{esc(id)}">{line}</g>')
    d.geometry.append(dict(id=id, type='fixture', profile='shower-glass', name='Fixed shower glass',
                          doorId=door_id, source='PDF shower enclosure line; glass height and thickness inferred'))


def wardrobe_tops(d):
    # The thin source lines bound the clear centre, not a filled fixture block.
    # 600 mm run depths are scan-derived; enclosed bases share these footprints.
    fixture(d, 'wir3-top', [(4310,4780),(4910,4780),(4910,5380),(7140,5380),(7140,5980),(4310,5980)],
            'shelf', 'WIR 3 side-wall top', 'wir3')
    fixture(d, 'wir2-top', [(13590,4720),(14190,4720),(14190,5920),(11490,5920),(11490,5320),(13590,5320)],
            'shelf', 'WIR 2 side-wall top', 'wir2')
    fixture(d, 'wir1-top', [(14280,230),(15680,230),(15680,830),(14880,830),(14880,5320),
                           (15580,5320),(15580,3340),(16180,3340),(16180,5920),(14280,5920)],
            'shelf', 'Master WIR side-wall top', 'wir1')
    fixture(d, 'wir4-top', [(6360,7260),(8760,7260),(8760,8580),(8160,8580),(8160,7860),(6360,7860)],
            'shelf', 'WIR 4 side-wall top', 'wir4')
    fixture(d, 'linen-top', [(9830,8020),(10430,8020),(10430,9720),(8850,9720),(8850,9120),(9830,9120)],
            'shelf', 'Linen side-wall top', 'linen')
