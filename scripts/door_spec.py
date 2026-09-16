"""Exterior door assemblies shared by plan and elevation authoring, in mm."""

# Sheet 4: 600 rear setback + 1,310 pier + 2,770 glazed opening.
DINING = dict(x=9715, start=600+1310, width=2770, leaf=820)
DINING['leafStart'] = DINING['start'] + (DINING['width']-2*DINING['leaf'])/2

# Sheet 4 rear opening chain: 1,450 overall, with one 820 door leaf.
LAUNDRY = dict(start=14510, width=1450, leaf=820, y=715)
LAUNDRY['hinge'] = LAUNDRY['start'] + LAUNDRY['width']
LAUNDRY['side'] = LAUNDRY['width'] - LAUNDRY['leaf']
