"""Shared vertical model parameters, in mm. Inferred values are named as such."""
from pool_spec import POOL

BUILDING = {
    'units': 'mm',
    'pool': POOL,
    'groundCeiling': 3086,
    'upperCeiling': 2783,
    'floorZone': 172,
    'cellarClearance': 2400,
    'roofPitch': 20 + 49 / 60,
    'garageEaves': 2391,
    'garageDrop': 514,
    'garageLevelSource': 'Elevations 1 and 3: -8c / 514 mm below house; plan -6c conflicts',
    'inferredStairThickness': 120,
    'inferredStairHeadroom': 2000,
    'porticoSideEaves': 3858,
    'inferredDoorHeight': 2040,
    'inferredDoorThickness': 40,
    'inferredDoorEdgeGap': 3,
    'openingHead': 2143,
    'inferredGuardHeight': 1100,
    # Vertical values are presentation assumptions, not dimensions from the plan.
    # Enclosed bases follow the typed top footprints down to floor level.
    'fixtureProfiles': {
        'shelf': {'bottom': 870, 'height': 30, 'material': 'fixture', 'enclosedBase': True},
        'counter': {'bottom': 870, 'height': 30, 'material': 'fixture', 'enclosedBase': True},
        'vanity': {'bottom': 820, 'height': 30, 'material': 'fixture', 'enclosedBase': True},
        'hob': {'bottom': 900, 'height': 30, 'material': 'frame'},
        'appliance-low': {'bottom': 0, 'height': 850, 'material': 'fixture'},
        'appliance-tall': {'bottom': 0, 'height': 1800, 'material': 'fixture'},
        'bath': {'bottom': 0, 'height': 550, 'baseThickness': 60, 'material': 'fixture'},
        'shower-tray': {'bottom': 0, 'height': 25, 'material': 'fixture'},
        'shower-glass': {'bottom': 35, 'height': 2005, 'thickness': 10, 'jointGap': 5, 'material': 'glass'},
    },
    'inferredRoofOverhang': 160,
}

# Photographed front appearance. Outer opening envelopes retain PDF set-outs.
# Arch rise, trim size, glazing divisions and hidden fourth-bay treatment are inferred.
BUILDING['frontPhoto'] = {
    'source': 'User photographs: overall front, windows, entrance and garage close-ups',
    'upperPierProjection': 230,
    'rise': 180, 'surroundWidth': 220, 'surroundProjection': 55,
    'head': 2143, 'sill': 600,
    'windows': [
        dict(id='photo-study', x=6470, z=12710, width=2890),
        dict(id='photo-living', x=10550, z=13790, width=3130),
        dict(id='photo-family', x=18470, z=13790, width=3130),
        dict(id='photo-games', x=22910, z=12710, width=2890),
    ],
    'assumptions': 'Photo-based front revision: paired PDF openings combined inside their original outer extents. Shallow arch rise, surround depth/width, front storey-band profile and base offsets are inferred; fourth-bay treatment repeats the visible motif. Other elevations remain PDF-based.'
}
