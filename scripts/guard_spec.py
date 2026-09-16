"""Shared guard footprints. Heights/thicknesses are inferred, not PDF dimensions."""
import math
from stair_spec import arc


def draw_guard(drawing, name, path, levels, thickness, stair_id=None):
    # Offset to the left of the path. Shared mitres close adjacent panels.
    normals = []
    for a, b in zip(path, path[1:]):
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dy)
        normals.append((-dy/length, dx/length))
    offsets = []
    for i, point in enumerate(path):
        n1, n2 = normals[max(0, i-1)], normals[min(i, len(normals)-1)]
        divisor = 1+n1[0]*n2[0]+n1[1]*n2[1]
        offsets.append((point[0]+thickness*(n1[0]+n2[0])/divisor,
                        point[1]+thickness*(n1[1]+n2[1])/divisor))
    drawing.add('fixtures', f'<g data-guard="{name}">')
    # One visible polygon supplies all panel vertices; no hidden shape copies or
    # antialias seams between separately filled curved panels.
    outline = path+list(reversed(offsets))
    points = ' '.join(f'{x:.6f},{y:.6f}' for x, y in outline)
    rises = ' '.join(str(level) for level in levels)
    drawing.add('fixtures', f'<polygon class="detail" style="fill:#eef0ed" '
                f'data-guard-outline="true" data-rise-levels="{rises}" points="{points}"/>')
    drawing.add('fixtures', '</g>')
    drawing.geometry.append(dict(id=name, type='guard', stairId=stair_id,
                                 source='PDF plan route; inferred guard construction and height'))


def main_guards(drawing, stair, upper_view):
    x, y, run = stair['x'], stair['y'], stair['flight']
    left, right = x+1290, x+1610
    # Guard follows the two flights and the inner edge of the winders.
    centre = [(right, y), (right, y+run), (left, y+run), (left, y)]
    draw_guard(drawing, 'stair-centre-guard', centre, [2, 8, 14, 19], 40, 'stair')
    # The exposed outside edge follows the same numbered winders as the treads.
    angles = [0, 48, 72, 90, 110, 138, 180]
    outer = [(x+2900, y)]
    outer_levels = [2]
    for index, (start, end) in enumerate(zip(angles, angles[1:])):
        segment = arc(x+1450, y+run, 1450, 1200, start, end, 24)
        for step, point in enumerate(segment):
            if index and step == 0:
                continue
            outer.append(point)
            outer_levels.append(8+index+step/24)
    outer.append((x, y))
    outer_levels.append(19)
    # Reverse the path to put the offset outside the clear tread width.
    if not upper_view:
        draw_guard(drawing, 'stair-outer-guard', list(reversed(outer)),
                   list(reversed(outer_levels)), 40, 'stair')
    if upper_view:
        # The thick upper-plan enclosure sits outside the clear stair opening.
        curve = arc(x+1450, y+run, 1450, 1200, 180, 0, 72)
        outline = [(x, y)] + curve + [(x+2900, y+600)]
        draw_guard(drawing, 'stair-curved-enclosure', outline, [0]*len(outline), 90)
        # Close the exposed landing edge over the lower flight, joining the
        # curved enclosure to the centre guard. The upper flight stays open.
        landing = [(x+2900, y+600), (x+2900, y), (left, y)]
        draw_guard(drawing, 'stair-landing-guard', landing, [0]*len(landing), 90)
    drawing.issues.append('Stair guards use the drawn plan routes. The 1,100 mm guard height and 40/90 mm construction thicknesses are inferred; no complete guard section is supplied.')
