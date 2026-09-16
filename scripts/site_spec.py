"""Photo-derived site surfaces and planting; coordinates/heights are estimates in mm."""

SOURCE = 'User front, garage and pool photographs plus aerial; landscape dimensions, species and site edges estimated'

AREAS = [
    dict(id='driveway',name='Asphalt garage approach',material='asphalt',grade='drive',points=[(0,13310),(6230,13310),(6500,23800),(-700,23800)],source='User-requested asphalt finish; driveway footprint and grade estimated from supplied photographs'),
    dict(id='front-pavement',name='Pedestrian pavement',material='concrete',grade='drive',points=[(-2100,22200),(34000,22200),(34000,23800),(-2100,23800)]),
    dict(id='entrance-path',name='Pale entrance path',material='paving',grade='garden',points=[(14870,16070),(17280,16070),(17280,22200),(14870,22200)]),
    dict(id='cross-path',name='Front garden connecting path',material='paving',grade='garden',points=[(6230,16070),(27230,16070),(27230,17170),(6230,17170)]),
    dict(id='pool-connection',name='Path to pool terrace',material='paving',grade='garden',points=[(26630,14500),(27730,14500),(27730,17170),(26630,17170)]),
    dict(id='front-lawn',name='Front lawn',material='grass',grade='garden',points=[(6230,12710),(33200,12710),(33200,22200),(6230,22200)]),
    dict(id='west-border',name='Garage-side planting bed',material='soil',grade='drive',points=[(-2100,6480),(0,6480),(0,22000),(-2100,22000)]),
    dict(id='pool-border',name='Pool-side planted screen',material='soil',grade='garden',points=[(32630,600),(34100,600),(34100,17300),(32630,17300)]),
    dict(id='study-bed',name='Shrubs below study windows',material='soil',grade='garden',points=[(6500,13310),(9300,13310),(9300,15570),(6500,15570)]),
    dict(id='living-bed',name='Shrubs below living windows',material='soil',grade='garden',points=[(10000,13790),(13700,13790),(13700,15770),(10000,15770)]),
    dict(id='family-bed',name='Shrubs below family windows',material='soil',grade='garden',points=[(18400,13790),(22100,13790),(22100,15770),(18400,15770)]),
    dict(id='games-bed',name='Shrubs below games windows',material='soil',grade='garden',points=[(23000,12710),(26400,12710),(26400,15400),(23000,15400)]),
]
PLANTS = [
    dict(id='garage-left-evergreen',name='Tall clipped evergreen',form='column',x=-1000,z=14600,radius=850,height=6200),
    dict(id='garage-right-evergreen',name='Narrow evergreen beside garage',form='column',x=6630,z=14250,radius=650,height=6200),
    dict(id='front-shade-tree',name='Mature front broadleaf tree',form='tree',x=24400,z=20100,radius=5100,height=10800),
    dict(id='front-west-tree',name='Broadleaf tree at frontage',form='tree',x=9800,z=21400,radius=3500,height=8700),
    # Pots sit inside the living/family planting beds. Full crowns stay north
    # of the cross-path and outside the porch, not on the paving in front.
    dict(id='porch-topiary-left',name='Entrance standard topiary',form='topiary',x=13450,z=15390,radius=480,height=1700),
    dict(id='porch-topiary-right',name='Entrance standard topiary',form='topiary',x=18700,z=15390,radius=480,height=1700),
]
# Plant directly in the four existing corner-box recesses, inside their rims
# and clear of the adjoining column shafts. No freestanding porch pots.
for side,x1,x2 in [('left',14480,14855),('right',17295,17670)]:
    for end,z1,z2 in [('rear',13805,14365),('front',15495,15865)]:
        PLANTS.append(dict(id=f'portico-planter-{side}-{end}',name='Evergreen in corner planter box',
            form='box-shrub',x=(x1+x2)/2,z=(z1+z2)/2,radius=160,height=450,baseElevation=540,
            soil=[(x1,z1),(x2,z1),(x2,z2),(x1,z2)],
            source='User clarification: planting inside the four existing porch planter boxes; no freestanding pots'))
for name,x1,x2,z,h in [('study',7100,8650,14650,1450),('living',10550,13200,15000,1200),('family',18900,21600,15000,1300),('games',23500,25800,14200,1150)]:
    count=round((x2-x1)/550)+1
    for i in range(count):
        PLANTS.append(dict(id=f'{name}-shrub-{i}',name='Clipped front shrub',form='shrub',x=round(x1+(x2-x1)*i/(count-1)),z=z+(i%2)*110,radius=530,height=h+(i%3-1)*80))
for i,z in enumerate(range(1700,15700,1150)):
    PLANTS.append(dict(id=f'pool-screen-{i}',name='Pool-side greenery',form='shrub',x=33330,z=z,radius=650,height=1900+(i%3)*180))
for i,z in enumerate(range(16900,21400,900)):
    PLANTS.append(dict(id=f'west-hedge-{i}',name='Clipped driveway-side hedge',form='shrub',x=-1050,z=z,radius=580,height=1600))


def draw_site(d):
    colours=dict(asphalt='#454747',concrete='#b8bab5',paving='#e9dfc9',grass='#b9cd96',soil='#6d5843')
    for a in AREAS:
        d.add('base',f'<polygon data-site-area="{a["id"]}" points="{d.points(a["points"])}" style="fill:{colours[a["material"]]};stroke:#858e79;stroke-width:18"/>')
        d.geometry.append(dict(id=a['id'],type='site-area',name=a['name'],material=a['material'],grade=a['grade'],source=a.get('source',SOURCE)))
    for p in PLANTS:
        layer = 'fixtures' if 'baseElevation' in p else 'base'
        if 'soil' in p:
            d.add(layer,f'<polygon data-planter-soil="{p["id"]}" points="{d.points(p["soil"])}" style="fill:#766c51;stroke:none"/>')
        d.add(layer,f'<circle data-site-plant="{p["id"]}" cx="{p["x"]}" cy="{p["z"]}" r="{p["radius"]}" style="fill:#7da068;fill-opacity:.55;stroke:#527148;stroke-width:22"/>')
        d.geometry.append(dict(id=p['id'],type='site-plant',name=p['name'],form=p['form'],height=p['height'],source=p.get('source',SOURCE),
            **({'baseElevation':p['baseElevation']} if 'baseElevation' in p else {})))
    d.issues.append('Photo landscape: driveway, front paths, lawn and planting reconstructed visually. Site extent, street pavement, grades and plant sizes are estimates; the displayed site edge is not a surveyed boundary.')
