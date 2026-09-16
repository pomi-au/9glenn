"""PDF-derived door controls, checked against the generated shared SVG primitives."""
from pathlib import Path
import json
import math
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://www.w3.org/2000/svg'}

# Leaf widths transcribed from sheets 4 and 2, independent of authoring constants.
WIDTHS = {
    'ground': {
        'meals-door-a': 820, 'meals-door-b': 820,
        'games-door-a': 820, 'games-door-b': 820,
        'dining-exterior-a': 820, 'dining-exterior-b': 820,
        'garage-gallery': 820, 'study': 820,
        'gallery-pair-a': 820, 'gallery-pair-b': 820,
        'front-entry-a': 820, 'front-entry-b': 820,
        'laundry-rear': 820, 'laundry-linen': 720, 'laundry-lobby': 720,
        'pantry': 720, 'powder': 720, 'store-a': 720, 'store-b': 720,
        'under-stair': 720, 'cupboard-a': 620, 'cupboard-b': 620,
    },
    'first': {
        'bed3-wir': 720, 'bed3-entry': 820, 'bed2-entry': 820, 'bed2-wir': 720,
        'bath1': 720, 'bath-recess': 520, 'wc': 720, 'ensuite': 820,
        'master-wir': 820, 'master-entry-a': 820, 'master-entry-b': 820,
        'bath2': 820, 'bed5': 820, 'bed4': 820, 'wir4': 720, 'linen': 720,
        'studio-a': 720, 'studio-b': 720,
    },
}
# Closed direction and opening side as read from the PDF, using SVG y-down axes.
ORIENTATIONS = {
    'ground': {'laundry-rear': (180, -1), 'laundry-linen': (-135, 1)},
    'first': {
        'wc': (-90, -1), 'master-wir': (90, -1), 'bed5': (90, 1),
        'bed4': (0, 1), 'wir4': (0, -1), 'linen': (0, 1),
        'ensuite-shower': (90, 1), 'bath1-shower': (135, -1),
        'bath2-shower': (135, -1),
    },
}


def door_geometry(node):
    transforms = {
        name: list(map(float, re.split(r'[ ,]+', values)))
        for name, values in re.findall(r'(translate|rotate|scale)\(([^)]+)\)', node.get('transform'))
    }
    x, y = transforms['translate']
    angle = transforms['rotate'][0]
    width = float(node.find('s:rect', NS).get('width'))
    radians = math.radians(angle)
    return dict(x=x, y=y, width=width, angle=angle, swing=transforms['scale'][1],
                closed=(x+width*math.cos(radians), y+width*math.sin(radians)))


def main():
    drawings = {d['id']: d for d in json.loads((ROOT/'assets/drawing-data.json').read_text())}
    roots = {id: ET.parse(ROOT/'drawings'/f'{id}.svg').getroot() for id in drawings}
    for id,drawing in drawings.items():
        for entity in drawing['entities']:
            if entity['type']=='elevation-window':
                rect=roots[id].find(f'.//s:rect[@data-elevation-window="{entity["id"]}"]',NS)
                entity.update({k:float(rect.get(k)) for k in ('x','y','width','height')})
    doors = {}
    for floor, count in [('ground', 22), ('first', 21), ('cellar', 0)]:
        nodes = roots[floor].findall('.//s:g[@data-door]', NS)
        doors[floor] = {node.get('data-door'): door_geometry(node) for node in nodes}
        assert len(nodes) == len(doors[floor]) == count, (floor, 'door count or duplicate ID')
        records = [e for e in drawings[floor]['entities'] if e['type'] == 'door']
        assert {e['id'] for e in records} == set(doors[floor]), (floor, 'unshared door')
        assert all(not {'x', 'y', 'width', 'angle', 'swing'} & e.keys() for e in records)
        for id, width in WIDTHS.get(floor, {}).items():
            assert doors[floor][id]['width'] == width, (floor, id, 'printed width')
        for id, orientation in ORIENTATIONS.get(floor, {}).items():
            door = doors[floor][id]
            assert (door['angle'], door['swing']) == orientation, (floor, id, 'PDF orientation')

    for floor, pairs in {
        'ground': ['meals-door', 'games-door', 'dining-exterior', 'gallery-pair', 'front-entry', 'store', 'cupboard'],
        'first': ['master-entry', 'studio'],
    }.items():
        for pair in pairs:
            a, b = (doors[floor][pair+suffix] for suffix in ['-a', '-b'])
            assert math.dist(a['closed'], b['closed']) < .01, (floor, pair, 'leaves must meet')

    # Dining glazing is explicitly dimensioned 2,770, beginning 600 + 1,310 from datum.
    dining = roots['ground'].find('.//s:g[@data-window="dining-glazing"]/s:rect[@class="window"]', NS)
    assert float(dining.get('y')) == 1910 and float(dining.get('height')) == 2770
    assert doors['ground']['dining-exterior-a']['y'] == 2475
    assert doors['ground']['dining-exterior-b']['y'] == 4115
    elevation = drawings['elevation-2']['entities']
    leaves = next(e for e in elevation if e['type'] == 'elevation-window' and e['kind'] == 'door')
    assert leaves['x'] == 2475-600 and leaves['width'] == 1640
    rear = drawings['elevation-3']['entities']
    laundry = next(e for e in rear if e['type'] == 'elevation-window' and e['kind'] == 'single-door')
    assert laundry['width'] == 820 and laundry['x'] == 26630-15960
    assert doors['ground']['laundry-rear']['x'] == 15960

    # Check corrected junctions without encoding the former disconnected masks.
    first = roots['first']
    studio_wall = first.find('.//s:rect[@data-wall="master-studio"]', NS)
    assert float(studio_wall.get('x')) == doors['first']['studio-b']['x']
    assert doors['first']['wc']['x'] == 16715  # East partition, not south wall.
    assert doors['first']['bath-recess']['x'] > 8250
    ground = roots['ground']
    garage_partition = ground.find('.//s:rect[@data-wall="gallery-garage"]', NS)
    courtyard_wall = ground.find('.//s:rect[@data-wall="gallery-step"]', NS)
    garage_door = doors['ground']['garage-gallery']
    assert float(garage_partition.get('width')) == 90, 'Thin inner leaf at garage door'
    assert float(courtyard_wall.get('width')) == 230, 'Retain exterior courtyard wall'
    assert float(courtyard_wall.get('x'))+230 == float(garage_partition.get('x'))+90, 'Gallery faces align'
    assert float(courtyard_wall.get('y'))+float(courtyard_wall.get('height')) == float(garage_partition.get('y')), 'Thickness changes at garage rear wall'
    assert garage_door['x'] == float(garage_partition.get('x'))+45, 'Door centred in thin partition'
    garage_mask = ground.find('.//s:g[@data-door="garage-gallery"]/s:rect', NS)
    assert float(garage_mask.get('height')) == 106, 'Opening mask follows 90 mm partition'
    header = ground.find('.//s:rect[@data-wall="under-stair-north"]', NS)
    stair_door = doors['ground']['under-stair']
    assert float(header.get('x')) < stair_door['x']
    assert stair_door['closed'][0] < float(header.get('x'))+float(header.get('width'))

    result = dict(doorLeaves=43, printedWidths=40, correctedOrientations=11,
                  meetingPairs=9, diningAssemblyWidth=2770, sharedDoorRecords=True,
                  scope='Printed widths, audited orientations, pair closure and named junctions; undimensioned setbacks remain scan-derived.')
    (ROOT/'audit/doors/checks.json').write_text(json.dumps(result, indent=2)+'\n')
    print('PASS doors: 43 shared leaves, 40 PDF widths, 11 corrected orientations, 9 meeting pairs, dining/laundry projections and junctions.')


if __name__ == '__main__':
    main()
