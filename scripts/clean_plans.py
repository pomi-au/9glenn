from roof_spec import draw_roofs
from building_spec import BUILDING
"""Dimensioned architectural reconstruction. All primary plan coordinates are mm.

This module contains semantic geometry, never thresholding or pixel contours.
Source points are used only for small fixtures with no printed dimensions.
"""
import math
from vector_drawing import Drawing, esc
from door_spec import DINING, LAUNDRY
from opening_spec import BATH2_WEST, BAY_RETURN
from stair_spec import main_stair, cellar_stair, garage_stair, draw_treads, arc
from guard_spec import main_guards
from fixture_spec import fixture, rect_fixture, vanity, glass_panel, wardrobe_tops
from pool_spec import draw_pool
from site_spec import draw_site
from furniture_spec import draw_furniture


def plan(id, title, page, width, height, summary, facts, origin, scale):
    d=Drawing(id,title,'plan',page,[(0,0),(1,1)],[(0,0),(1,1)],
              [-2800,-3100,width+5700,height+6900],summary,facts)
    sx,sy=scale
    d.source_image=dict(x=-origin[0]*sx,y=-origin[1]*sy,width=1888*sx,height=(1888*({2:2338/3304,3:2342/3308,4:2341/3316}[page]))*sy)
    return d


def floor(d,points):
    d.poly(points,'base','shell',True)
    d.snaps.extend(points)


def room(d,id,name,x1,y1,x2,y2,category='living',label=None):
    dims=[x2-x1,y2-y1]
    d.room_rect(id,name,x1,y1,x2-x1,y2-y1,label=label,dims=dims,category=category)
    d.geometry.append(dict(id=id,type='room',x=x1,y=y1,width=dims[0],height=dims[1]))
    return dims


def window(d,id,x,y,length,axis='h',wall=230,code=None,outward=-1,assembly=None):
    d.window(x,y,length,axis,wall)
    parts=d.layers['openings'][-3:]
    d.layers['openings'][-3:]=[f'<g data-window="{esc(id)}">'+''.join(parts)+'</g>']
    d.geometry.append(dict(id=id,type='window',x=x,y=y,length=length,axis=axis,wall=wall,code=code))
    if assembly:d.geometry[-1]['assembly']=assembly
    if code:
        if axis=='h':d.text(x+length/2,y+outward*270,code,'small-label')
        else:
            tx=x+outward*285;ty=y+length/2
            d.add('labels',f'<text class="small-label" transform="translate({tx} {ty}) rotate(-90)">{code}</text>')


def door(d,id,x,y,width=820,angle=0,swing=1,wall=90,label=True,kind='room'):
    d.door(x,y,width,angle,swing,wall+16)
    d.layers['openings'][-1]=d.layers['openings'][-1].replace('<g ',f'<g data-door="{esc(id)}" ',1)
    d.geometry.append(dict(id=id,type='door',x=x,y=y,width=width,angle=angle,swing=swing,kind=kind))
    if label:
        a=math.radians(angle);b=math.radians(angle+90*swing)
        tx=x+math.cos(a)*width*.53+math.cos(b)*150
        ty=y+math.sin(a)*width*.53+math.sin(b)*150
        d.text(tx,ty+60,str(width),'small-label')


def double(d,id,x,y,width=820,axis='h',side=-1,wall=230,gap=0):
    if axis=='h':
        door(d,id+'-a',x,y,width,0,side,wall)
        door(d,id+'-b',x+2*width+gap,y,width,180,-side,wall)
    else:
        door(d,id+'-a',x,y,width,90,-side,wall)
        door(d,id+'-b',x,y+2*width+gap,width,-90,side,wall)


def stair(d,x,y,first=False):
    data=main_stair(x,y)
    draw_treads(d,data,first)
    d.poly(data['opening']+[data['opening'][0]],cls='detail')
    main_guards(d,data,first)
    start,end=(645,2280) if first else (2280,645)
    d.poly([(x+start,y+1670),(x+end,y+1670),(x+end,y+430)],cls='detail')
    d.poly([(x+end-130,y+590),(x+end,y+430),(x+end+130,y+590)],cls='detail')
    d.text(x+645,y-240,'dn' if first else 'up','small-label')


def toilet_mm(d,x,y,angle=0):
    d.add('fixtures',f'<g transform="translate({x} {y}) rotate({angle})"><rect class="fixture" x="-180" y="-300" width="360" height="170" rx="30"/><ellipse class="fixture" cx="0" cy="70" rx="155" ry="250"/><path class="fixture" d="M -100 -20 Q 0 -100 100 -20"/></g>')


def corner_shower(d,id,x,y,size=1000):
    fixture(d,id+'-tray',[(x,y),(x+size,y),(x+size,y+size*.5),(x+size*.5,y+size),(x,y+size)],
            'shower-tray','Shower tray')
    d.poly([(x+80,y+80),(x+size-80,y+80),(x+size-80,y+size*.45),(x+size*.45,y+size-80),(x+80,y+size-80),(x+80,y+80)])
    # Both source showers hinge at the upper-right end of the diagonal opening.
    door(d,id,x+size,y+size*.5,size/math.sqrt(2),135,-1,20,False,'shower')
    glass_panel(d,id+'-fixed-a',(x+size,y),(x+size,y+size*.5),id)
    glass_panel(d,id+'-fixed-b',(x+size*.5,y+size),(x,y+size),id)


def ground():
    d=plan('ground','Ground floor',4,26630,16070,'Dimensioned walls, openings and curved stair',
           [['Overall width','26,630 mm'],['Overall depth','16,070 mm'],['Ground floor area','245.46 m²'],['Garage area','43.24 m²'],['Porch area','8.19 m²'],['Total ground floor','296.89 m²']],(301,298),(26630/1189,16070/724))
    draw_site(d)
    floor(d,[(0,6480),(6720,6480),(6720,5640),(9600,5640),(9600,600),(18720,600),(18720,0),(22910,0),(22910,600),(26630,600),(26630,12710),(22550,12710),(22550,13790),(17870,13790),(17870,16070),(14280,16070),(14280,13790),(9600,13790),(9600,12710),(6230,12710),(6230,13310),(0,13310)])
    room(d,'garage','GARAGE',90,6710,6020,13080,'service')
    room(d,'study','STUDY',6110,7980,9740,12480)
    room(d,'dining','DINING',9830,830,14280,5680)
    room(d,'living','LIVING',9830,8080,14280,13560)
    d.room('gallery','GALLERY',[(6950,5870),(15950,5870),(15950,7890),(6110,7890),(6110,6710),(6950,6710)],(10300,6900),[9000,2020],note='The 9,000 × 2,020 mm gallery dimensions are measured from the inside face of the stepped courtyard return to the stair-side wall and study-side wall respectively.')
    room(d,'pantry','PANTRY',16860,830,18860,3230,'service')
    d.room('laundry',"L’DRY",[(14370,830),(16160,830),(16160,2180),(16770,2180),(16770,3320),(15470,3320),(15470,4780),(14370,4780)],(15450,2600),[2400,None],'wet')
    room(d,'powder','PWDR',14710,4870,16870,5770,'wet')
    d.room('kitchen','KITCHEN',[(16960,3410),(18950,3410),(18950,230),(22680,230),(22680,5600),(19500,5600),(19500,5080),(16960,5080)],(20700,2800),category='wet')
    room(d,'meals','MEALS',22980,830,26400,5695,label=(24690,3380))
    room(d,'entry','ENTRY',14470,10410,17650,13560)
    d.room('family','FAMILY RM',[(17740,10410),(19120,10410),(21200,9320),(22320,9320),(22320,13560),(17740,13560)],(20030,11480),[4580,None])
    d.room('games','GAMES',[(22320,6622),(26400,6622),(26400,12480),(22320,12480)],(24500,10100),[7370,5858],note='5,858 mm printed games depth; 7,370 mm spans the combined family/games area from the stair enclosure to the east wall.')
    room(d,'portico','PORTICO',14470,13790,17680,15880,'outdoor')
    linen_chamfer=720/math.sqrt(2)
    linen_hinge_y=3275+linen_chamfer
    # Exterior. Separate wall solids preserve differing 90 / 190 / 230 mm walls.
    for args in [
        ('garage-west',0,6480,90,6830),('garage-rear',0,6480,6950,90),('gallery-step',6720,5640,230,930),('gallery-rear',6720,5640,3110,230),
        # Sheet 4: the courtyard cavity wall ends at the garage rear wall;
        # only its 90 mm inner leaf continues around the 820 gallery door.
        ('gallery-garage',6860,6570,90,1320),
        ('dining-west',9600,600,230,5270),('rear-main',9600,600,9120,230),('bay-west',18720,0,230,830),('bay-rear',18720,0,4190,230),('bay-east',22680,0,230,830),('rear-meals',22680,600,3950,230),('east',26400,600,230,12110),
        ('games-front',22320,12480,4310,230),('family-return',22320,12480,230,1310),('family-front',17650,13560,4900,230),
        ('living-front',9600,13560,4870,230),('living-west',9600,12480,230,1310),('study-front',6020,12480,3810,230),('garage-return',6020,12480,210,830),('garage-front',0,13080,6230,230),
        ('portico-west',14280,13790,190,2280),('portico-east',17680,13790,190,2280),('portico-front',14280,15880,3590,190),
        ('study-west',6020,7890,90,4820),('study-north',6020,7890,3810,90),('living-west-inner',9740,7890,90,4590),('living-north',9740,7890,4630,190),
        ('dining-east',14280,600,90,5170),('dining-south',9600,5680,4770,190),('living-east',14280,7990,90,5800),
        ('entry-stair',15950,7870,90,2540),('entry-north',15950,10320,1790,90),('entry-east',17650,10320,90,3470),
        ('entry-west',14280,10320,190,3470),
        ('laundry-upper-cupboard',16160,830,90,1440),('laundry-cupboard-base',16160,2180,610,90),('laundry-east',16770,830,90,2580),
        ('pantry-east',18860,830,90,2490),('pantry-south',16770,3230,2700,90),('linen-top',14370,3230,1145-linen_chamfer,90),('linen-east',15470,linen_hinge_y,90,4780-linen_hinge_y),('linen-base',14370,4780,1190,90),('lobby-south',15470,4280,1490,90),
        ('laundry-lobby-jamb',16770,3410,90,915),('gallery-door-return',15950,7510,90,405),
        ('powder-east',16870,4280,90,1590),('powder-south',14370,5770,2590,90),('powder-duct',14620,4870,90,900),
        ('store-north',16960,5080,1550,90),('store-east',18420,5080,90,790),('store-south',16960,5780,3000,90),('fridge-return',19870,5080,90,790),('under-stair-east',17330,7870,90,1200),('under-stair-north',16040,7870,1380,90),
    ]:d.wallbox(*args)
    # Chamfered lintel uses the same polygon and door cut in 2D and 3D.
    offset=45/math.sqrt(2)
    a=(15515-linen_chamfer,3275);b=(15515,linen_hinge_y)
    d.poly([(a[0]-offset,a[1]+offset),(b[0]-offset,b[1]+offset),
            (b[0]+offset,b[1]-offset),(a[0]+offset,a[1]-offset)],'walls','wall-solid',True)
    # Piers and three garage entry steps, omitted in the earlier schematic.
    for yy in [6480,8150,10550,13080]:d.wallbox(f'garage-west-pier-{yy}',0,yy,230,360)
    for xx in [0,2880]:d.wallbox(f'garage-rear-pier-{xx}',xx,6480,230,230)
    # Sheet 4: piers project into the garage from the study wall. Their
    # undimensioned projection/length are scan-derived; the first meets the stair.
    for yy in [8170,10550]:d.wallbox(f'study-west-pier-{yy}',5880,yy,140,360)
    d.opening(590,13195,4930,thickness=270)
    d.poly([(590,13195),(5520,13195)],cls='detail dash')
    # The user-confirmed rear elevation (sheet 6) has a solid wall here.
    # Sheet 4's unlabelled dashed span is not a second garage entrance.
    d.issues.append('Rear garage wall follows the user-confirmed sheet 6 elevation: one window, no opening through the unlabelled 2,410 mm dashed span on sheet 4.')
    draw_treads(d,garage_stair())
    d.text(2700,10800,'-8c / -514 mm','small-label')
    d.poly([(5600,7420),(6070,7420),(5930,7280),(6070,7420),(5930,7560)],cls='detail')
    d.text(5200,7460,'up')
    # Ground roof dashes now use the same roof assembly as SVG elevations/3D.
    draw_roofs(d, 'plan', lower_only=True, offset=(0,0), component='garage-hip', layer='fixtures')
    # Exterior openings are taken from the dimensioned opening chains.
    for id,x,y,l,t,code in [
        ('garage-rear',3710,6525,1210,90,'14 × 5'),('gallery',7550,5755,1210,230,'16 × 5'),
        ('laundry',LAUNDRY['start'],LAUNDRY['y'],LAUNDRY['width'],230,None),('pantry',17270,715,1090,230,'8 × 5'),
        ('bay',18875,115,3880,230,'14 × sp'),('meals-rear',24470,715,1330,230,'16 × 5.5'),
        ('study-a',6470,12595,1210,230,'18 × 5'),('study-b',8150,12595,1210,230,'18 × 5'),
        ('living-a',10550,13675,1210,230,'18 × 5'),('living-b',12470,13675,1210,230,'18 × 5'),
        ('family-a',18470,13675,1210,230,'18 × 5'),('family-b',20390,13675,1210,230,'18 × 5'),
        ('games-a',22910,12595,1210,230,'18 × 5'),('games-b',24590,12595,1210,230,'18 × 5')]:
        if id in ('study-a','study-b','living-a','living-b','family-a','family-b','games-a','games-b'):continue
        window(d,id,x,y,l,wall=t,code=code,outward=1 if y>10000 else -1,assembly=id if id in ('laundry','bay') else None)
    for opening in BUILDING['frontPhoto']['windows']:
        window(d,opening['id'],opening['x'],opening['z']-115,opening['width'],code='PHOTO · SHALLOW ARCH',outward=1)
    d.issues.append(BUILDING['frontPhoto']['assumptions'])
    window(d,'bay-west',18835,BAY_RETURN['start'],BAY_RETURN['width'],'v',230,'14 × sp')
    window(d,'bay-east',22795,BAY_RETURN['start'],BAY_RETURN['width'],'v',230,'14 × sp',1)
    d.issues.append('Bay height: adopted the elevation 23c–09c glazing height (14 courses); the plan’s original 25 × sp designation conflicts with both side/rear elevations.')
    for id,yy,length,code in [('meals-east',1430,3130,'25 × 13'),('games-door',5270,3130,'25 × 13'),('games-east-a',9110,1210,'18 × 5'),('games-east-b',10670,1210,'18 × 5')]:
        window(d,id,26515,yy,length,'v',230,code,1,assembly=id if length==3130 else None)
    # Door leaves within the wide glazed openings; the rest of each frame is fixed glass.
    double(d,'meals-door',26515,2180,820,'v',-1)
    double(d,'games-door',26515,6020,820,'v',-1)
    window(d,'dining-glazing',DINING['x'],DINING['start'],DINING['width'],'v',assembly='dining-glazing')
    double(d,'dining-exterior',DINING['x'],DINING['leafStart'],DINING['leaf'],'v',-1)
    door(d,'garage-gallery',6905,7665,820,-90,1,90)
    door(d,'study',9740,7935,820,180,-1,90)
    # Cut the full host wall depth, including the thicker living lintel wall.
    for wall_id in ['dining-south','living-north']:
        wall=next(g for g in d.geometry if g['type']=='wall' and g['id']==wall_id)
        yy=wall['y']+wall['height']/2
        d.opening(10430,yy,3250,thickness=wall['height']+40)
        d.poly([(10430,yy),(13680,yy)],cls='detail dash')
        d.text(12055,yy-270,'25c ht × 3250 w opening','small-label')
    double(d,'gallery-pair',15995,5870,820,'v',-1,90)
    # Front portico: openings between the four corner piers, not a closed box.
    d.opening(14870,15975,2410,thickness=240)
    d.opening(14375,14380,1100,'v',240);d.opening(17775,14380,1100,'v',240)
    d.wallbox('entry-front',14280,13560,3590,230)
    window(d,'entry-glazing',14750,13675,2650)
    double(d,'front-entry',15255,13675,820,'h',-1,230)
    d.opening(14375,10810,2200,'v',240)
    d.poly([(14375,10810),(14375,13010)],cls='detail dash')
    door(d,'laundry-rear',LAUNDRY['hinge'],LAUNDRY['y'],LAUNDRY['leaf'],180,-1,230)
    door(d,'laundry-linen',15515,linen_hinge_y,720,-135,1)
    # Hinge meets the room face of the crossing wall, not its centre line.
    door(d,'laundry-lobby',16815,4280,720,-90,-1)
    door(d,'pantry',17500,3275,720,0,1)
    door(d,'powder',16870,5815,720,180,1)
    double(d,'store',17000,5825,720,'h',1,90)
    door(d,'under-stair',16270,7915,720,0,1)
    # Sheet 4 shows paired 620 leaves, with no masonry between them.
    # Centre the 1,240 mm opening in the existing 1,350 mm cupboard frontage.
    cupboard_start = 830 + (2180-830-2*620)/2
    double(d,'cupboard',16205,cupboard_start,620,axis='v',side=-1,wall=90)
    d.issues.append('Laundry cupboard: two printed 620 mm leaves meet without a centre wall; equal 55 mm end reveals are inferred within the existing 1,350 mm frontage.')
    stair(d,16040,7830)
    # Kitchen and wet-area fixtures, orthogonal and individually editable.
    fixture(d,'kitchen-top',[(18950,3350),(18950,230),(22680,230),(22680,5780),(21390,5780),(21390,4780),(22180,4780),(22180,830),(19550,830),(19550,3350)],'counter','Kitchen worktop','kitchen',
            [(20100,505,210,145),(20650,505,210,145)])
    d.rect(19800,280,1800,450)
    for xx in [19860,20410]:d.rect(xx,330,480,350,radius=75)
    for xx in range(21000,21580,90):d.poly([(xx,340),(xx,670)])
    rect_fixture(d,'cooktop',19000,1150,450,900,'hob','Cooktop','kitchen')
    for xx in [19120,19330]:
        for yy in [1360,1770]:d.ellipse(xx,yy,75,75)
    rect_fixture(d,'freezer',18510,5140,640,640,'appliance-tall','Freezer','kitchen')
    rect_fixture(d,'fridge',19150,5140,640,640,'appliance-tall','Fridge','kitchen')
    d.text(18830,5550,'FZ');d.text(19470,5550,'FR')
    rect_fixture(d,'laundry-machine',14410,2370,550,650,'appliance-low','Laundry appliance','laundry');d.ellipse(14685,2680,200,230)
    vanity(d,'laundry-basin',14410,1750,550,550,'laundry')
    # Rounded bench below the upper cupboard, not a full-height partition.
    # The undimensioned 300 mm return radius follows the plan scan.
    fixture(d,'laundry-rounded-bench',[(16160,2270),(16770,2270),(16770,3320)] +
            arc(16460,3020,300,300,90,180,24),
            'counter','Rounded laundry bench','laundry')
    rect_fixture(d,'laundry-linen-top',14410,3390,550,1240,'shelf','Laundry linen top','laundry');d.text(14685,4140,'lin')
    vanity(d,'powder-vanity',15620,4450,1060,350,'powder')
    toilet_mm(d,15100,5280,-90)
    d.poly([(16960,4370),(17300,4370),(17600,4670),(18400,4670),(18400,5080)])
    for yy in [5780,7787]:d.add('fixtures',f'<circle cx="{21220}" cy="{yy}" r="155" fill="#283238"/>')
    d.poly([(21220,5780),(21220,10320),(16040,10320)],cls='detail dash')
    d.text(21880,8560,'line of cellar');d.text(21880,8820,'below')
    d.chain(0,[6720,2880,9120,4190,3720],600,-2200)
    d.dim((0,0),(26630,0),-2850)
    d.chain(9600,[230,4450,90,2400,90,2000,90],600,-1400)
    d.chain(0,[470,2410,830,1210,1800,830,1210,840,4910,1450,1310,1090,360,155,3880,155,1560,1330,830],600,-650)
    d.chain(0,[6230,3370,12950,4080],13790,19000)
    d.chain(0,[90,5930,90,3630,90,4450,90,1580,90,1200,90,320,1380,7370,230],13790,17900)
    d.chain(0,[590,4930,710,240,2890,240,950,3130,1070,2650,1070,3130,950,360,2890,830],13790,16700)
    d.chain(0,[600,5040,840,6830,480,2280],0,-2300,'v')
    d.dim((26630,0),(26630,16070),35500,'v')
    d.chain(600,[12110,1080,2280],26630,34800,'v')
    for x1,y1,x2,y2,value,name,axis in [
        (9830,830,14280,830,4450,'Dining width','h'),(9830,830,9830,5680,4850,'Dining depth','v'),
        (9830,8080,14280,8080,4450,'Living width','h'),(9830,8080,9830,13560,5480,'Living depth','v'),
        (6110,7980,9740,7980,3630,'Study width','h'),(6110,7980,6110,12480,4500,'Study depth','v'),
        (90,6710,6020,6710,5930,'Garage width','h'),(90,6710,90,13080,6370,'Garage depth','v'),
        (16860,830,18860,830,2000,'Pantry width','h'),(16860,830,16860,3230,2400,'Pantry depth','v'),
        (14470,10410,17650,10410,3180,'Entry width','h'),(14470,10410,14470,13560,3150,'Entry depth','v'),
        (22980,830,26400,830,3420,'Meals width','h'),(22980,830,22980,5695,4865,'Meals depth','v'),
        (26400,6622,26400,12480,5858,'Games depth','v'),(14470,13790,17680,13790,3210,'Portico width','h'),(14470,13790,14470,15880,2090,'Portico depth','v')]:
        d.check(name,(x1,y1),(x2,y2),value,'Sheet 4 printed room dimension',axis)
    d.check('Gallery width',(6950,5870),(15950,5870),9000,'Sheet 4 courtyard return to stair-side wall')
    d.check('Gallery depth',(6950,5870),(6950,7890),2020,'Sheet 4 courtyard return to study wall','v')
    d.issues.append('Garage model uses the 514 mm drop printed on elevations 1 and 3; the ground plan says -6c. Stair underside and winder boundaries are inferred. Cellar is registered to the under-stair door landing.')
    d.issues.append('Small fixture locations, opening setbacks without a legible dimension, and stair winder angles are reconstructed from the scan. They are not verified to 100% accuracy.')
    draw_pool(d)
    draw_furniture(d)
    d.bounds[2] = 39700
    d.bounds[3] = max(d.bounds[3],29000)
    d.save()
    return d


def first():
    d=plan('first','First floor',2,21110,13190,'Five bedrooms, studio, void and curved stair',
           [['Overall width','21,110 mm'],['Overall depth','13,190 mm'],['Upper floor area','252.98 m²'],['Bedrooms','5'],['External walls','230 mm'],['Internal partitions','90 mm typical']],(548,329),(21110/945,13190/592))
    d.bounds=[-6500,-3100,30500,19600]
    floor(d,[(4080,0),(21110,0),(21110,12110),(17030,12110),(17030,13190),(4080,13190),(4080,12110),(0,12110),(0,4080),(4080,4080)])
    room(d,'bed3','BEDROOM 3',4310,230,8160,4690)
    room(d,'bath1','BATH 1',8250,230,10200,3490,'wet')
    room(d,'bed2','BEDROOM 2',10290,230,14190,4630)
    room(d,'wir3','W.I.R.',4310,4780,7140,5980,'service')
    room(d,'wir2','W.I.R.',11490,4720,14190,5920,'service')
    d.room('wir1','W.I.R.',[(14280,230),(15680,230),(15680,2520),(16180,2520),(16180,5920),(14280,5920)],(15020,4100),[1900,5690],'service')
    room(d,'wc1','WC',15770,230,16670,2430,'wet',label=(16180,1040))
    room(d,'ensuite','ENSUITE',16760,230,20880,2430,'wet',label=(18560,1550))
    room(d,'bed1','BEDROOM 1',16270,2520,20880,7790)
    room(d,'bath2','BATH 2',230,4310,4220,7170,'wet')
    d.room('bed5','BEDROOM 5',[(230,7260),(4220,7260),(4220,8220),(4820,8220),(4820,11280),(4220,11880),(230,11880)],(2130,9690),[3990,4620])
    d.room('bed4','BEDROOM 4',[(4910,8670),(8760,8670),(8760,12960),(4310,12960),(4310,11880),(4910,11280)],(6760,10600),[4450,4290])
    room(d,'wir4','W.I.R.',6360,7260,8760,8580,'service')
    room(d,'linen','LINEN',8850,8020,10430,9720,'service')
    room(d,'void','VOID',8950,9810,12130,12960,'void')
    d.room('studio','STUDIO',[(13420,7880),(20880,7880),(20880,11880),(16800,11880),(16800,12960),(12220,12960),(12220,9810),(12850,9400),(13420,8800)],(16800,10050),[8660,5080])
    for args in [
        ('rear',4080,0,17030,230),('east',20880,0,230,12110),('studio-east-front',16800,11880,4310,230),('studio-return',16800,11880,230,1310),('front',4080,12960,12950,230),('bed4-return',4080,11880,230,1310),('bed5-front',0,11880,4310,230),('wing-west',0,4080,230,8030),('bath2-rear',0,4080,4310,230),('bed3-west',4080,0,230,4310),
        ('bed3-bath',8160,230,90,4975),('bath-bed2',10200,230,90,4915),('bed2-wir1',14190,230,90,5780),('wir1-wc',15680,230,90,2290),('wc-ensuite',16670,230,90,2200),('ensuite-south',15680,2430,5200,90),('master-wir',16180,2520,90,3490),('master-wir-base',14190,5920,2080,90),('master-studio',14860,7790,6020,90),('master-entry-return',16180,7605,90,275),
        ('bed3-wir3',4310,4690,2340,90),('wir3-east',7140,5320,90,750),('bed3-base',4310,5980,3940,90),('bath1-base',8250,3490,1950,90),('bath1-recess',8250,4680,920,90),('bath1-recess-return',9080,4170,90,510),
        ('bed2-wir2',11950,4630,2240,90),('wir2-west',11400,5230,90,780),('bed2-base',10200,5920,4080,90),
        ('bath2-bed5',230,7170,4590,90),('bath2-east',4220,4310,90,2860),('bed5-entry-jamb',4820,7170,90,1050),('bed5-east-return',4220,8130,690,90),('bed5-bed4',4820,8130,90,3150),('bed4-entry-north',4820,8580,1540,90),
        ('wir4-north',6270,7170,2580,90),('wir4-west',6270,7260,90,1410),('wir4-base',6270,8580,2580,90),('bed4-east',8760,7170,90,5790),('linen-north',8850,7930,1670,90),('linen-east',10430,7930,90,1790),('void-north',8760,9720,3460,90),('void-west',8760,9810,190,3150),('void-east',12130,9720,90,3240),
    ]:d.wallbox(*args)
    d.poly([(4820,11280),(4910,11280),(4310,11880),(4220,11880)],'walls','wall-solid',True)
    # Exact rear opening chain, including the three narrow 610 mm bathroom windows.
    for id,xx,ll,code in [('bath2',3470,610,'6 × 2.5'),('bed3-a',4790,1210,'16 × 5'),('bed3-b',6590,1210,'16 × 5'),('bath1',9590,610,'14 × 2.5'),('bed2-a',10790,1210,'16 × 5'),('bed2-b',12590,1210,'16 × 5'),('wc',15950,610,'6 × 2.5'),('ensuite-a',16790,610,'6 × 2.5'),('ensuite-b',19070,610,'6 × 2.5')]:
        window(d,id,xx,4195 if id=='bath2' else 115,ll,code=code)
    for id,xx,yy in [('bed5-a',950,11995),('bed5-b',2630,11995),('bed4-a',5030,13075),('bed4-b',6950,13075),('studio-front-a',12950,13075),('studio-front-b',14870,13075),('studio-east-a',17390,11995),('studio-east-b',19070,11995)]:
        window(d,id,xx,yy,1210,code='18 × 5',outward=1)
    window(d,'void-feature',9770,13075,1570,code='sp × 6.5',outward=1)
    for i,yy in enumerate([2750,6350,8510,10070]):window(d,f'east-{i}',20995,yy,1210,'v',230,'18 × 5',1)
    window(d,'bath2-west',115,BATH2_WEST['start'],BATH2_WEST['width'],'v',230,'14 × 5')
    d.issues.append('Master east windows: adopted elevation 4’s 61c–43c height (18 courses); the original plan labels 16 × 5. Bath 2 west-window setback is scan-derived.')
    for args in [
        ('bed3-wir',7185,5320,720,-135,1),('bed3-entry',8205,5980,820,-90,-1),('bed2-entry',10245,5920,820,-90,1),('bed2-wir',11445,5230,720,-45,-1),
        ('bath1',10200,3535,720,180,1),('bath-recess',8750,3535,520,0,1),('wc',16715,2430,720,-90,-1),('ensuite',17680,2475,820,0,-1),('master-wir',16225,2520,820,90,-1),
        ('master-entry-a',16225,5965,820,90,-1),('master-entry-b',16225,7605,820,-90,1),
        ('bath2',4220,7215,820,180,1),('bed5',4865,7310,820,90,1),('bed4',4910,8625,820,0,1),('wir4',6360,8625,720,0,-1),('linen',8850,7975,720,0,1),
        ('studio-a',13420,7835,720,0,1),('studio-b',14860,7835,720,180,-1),
    ]:door(d,*args)
    stair(d,10520,7230,True)
    corner_shower(d,'bath1-shower',8250,230,1000)
    vanity(d,'bath1-vanity',8250,1700,420,930,'bath1');toilet_mm(d,8550,3050,-90)
    rect_fixture(d,'ensuite-shower-tray',19780,230,1100,2200,'shower-tray','Ensuite shower tray','ensuite')
    d.poly([(19780,230),(20880,2430)]);d.poly([(20880,230),(19780,2430)])
    door(d,'ensuite-shower',19780,880,720,90,1,20,False,'shower')
    glass_panel(d,'ensuite-shower-fixed-a',(19780,230),(19780,880),'ensuite-shower')
    glass_panel(d,'ensuite-shower-fixed-b',(19780,1600),(19780,2430),'ensuite-shower')
    rect_fixture(d,'ensuite-vanity',16760,230,3020,450,'vanity','Ensuite vanity top','ensuite',
                 [(17450,455,230,170),(18510,455,230,170)])
    toilet_mm(d,16220,720)
    corner_shower(d,'bath2-shower',230,4310,1000);vanity(d,'bath2-vanity',1480,4310,1670,430,'bath2');toilet_mm(d,3770,4630)
    rect_fixture(d,'bath2-tub',230,5500,710,1580,'bath','Bath','bath2',[(585,6290,285,720)])
    wardrobe_tops(d)
    draw_roofs(d, 'plan', lower_only=True)
    d.text(10555,14820,'METAL DECK ROOF · 1°')
    d.text(-2850,11000,'GARAGE ROOF BELOW')
    d.dim((0,0),(21110,0),-2850)
    d.chain(0,[4080,17030],0,-2250)
    d.chain(4080,[230,3850,90,1950,90,3900,90,1400,90,900,90,4120,230],0,-1480)
    d.chain(0,[3470,610,710,1210,590,1210,1790,610,590,1210,590,1210,2150,610,230,610,1670,610,1430],0,-650)
    d.chain(0,[4080,12950,4080],13190,15900)
    d.chain(0,[230,3990,600,90,3850,190,3180,90,8660,230],13190,15100)
    d.chain(0,[950,1210,470,1210,240,950,1210,710,1210,1610,1570,1610,1210,710,1210,950,360,1210,470,1210,830],13190,14100)
    d.dim((21110,0),(21110,13190),23600,'v')
    d.chain(0,[12110,1080],21110,23000,'v')
    d.chain(0,[4080,8030,1080],0,-2200,'v')
    d.chain(4080,[230,2860,90,4620,230],0,-1450,'v')
    d.chain(0,[230,3260,90,1100,90],8160,-700,'v')
    # Room checks use the very same wall-face coordinates emitted as geometry.
    for rid,expected in {'bed3':(3850,4460),'bath1':(1950,3260),'bed2':(3900,4400),'wir3':(2830,1200),'wir2':(2700,1200),'ensuite':(4120,2200),'bed1':(4610,5270),'bath2':(3990,2860),'wir4':(2400,1320),'linen':(1580,1700),'void':(3180,3150)}.items():
        item=next(g for g in d.geometry if g['id']==rid and g['type']=='room');x,y=item['x'],item['y']
        for axis,actual,value in [('h',item['width'],expected[0]),('v',item['height'],expected[1])]:
            d.check(rid+(' width' if axis=='h' else ' depth'),(x,y),(x+actual,y) if axis=='h' else (x,y+actual),value,'Sheet 2 printed room dimension',axis)
    d.check('Bed 5 clear depth',(230,7260),(230,11880),4620,'Sheet 2','v')
    d.check('Bed 4 lower width',(4310,12960),(8760,12960),4450,'Sheet 2')
    d.check('Bed 4 main depth',(8760,8670),(8760,12960),4290,'Sheet 2','v')
    d.check('Master WIR full depth',(14280,230),(14280,5920),5690,'Sheet 2','v')
    d.check('Studio full depth',(20880,7880),(20880,12960),5080,'Sheet 2','v')
    d.issues.append('Winder tread angles, sanitary fixture sizes and undimensioned door setbacks are reconstructed from the scan; only audited printed spans are verified numerically.')
    d.save();return d


def cellar():
    d=plan('cellar','Cellar',3,5927,5050,'300 mm walls and reconstructed quarter-turn stair',
           [['Overall width','5,927 mm'],['Overall depth','5,050 mm'],['Main clear width','4,037 mm'],['Main clear depth','4,450 mm'],['Wall thickness','300 mm'],['Clear cellar height','2,400 mm']],(253,360),(5927/263,5050/226))
    d.bounds=[-2300,-2200,10800,10200]
    d.shell([(1290,0),(5927,0),(5927,5050),(0,5050),(0,2000),(1290,2000)],300)
    # Enclose the inside of the descending flight; leave the lowest tread open
    # to the cellar. The 90 mm leaf aligns with under-stair-east above.
    d.wallbox('cellar-stair-inner-side',1590,2300,90,1160)
    d.wallbox('cellar-stair-inner-return',1680,3370,1854,90)
    d.issues.append('Cellar stair enclosure added at user request along the sheet 3 stair edge. The 90 mm inner leaf and closure to the main stair underside are inferred; the bottom exit remains open.')
    d.geometry.extend([dict(id='main-clear',type='room',x=1590,y=300,width=4037,height=4450),dict(id='stair-recess',type='room',x=300,y=2300,width=1290,height=2450)])
    d.room('cellar-room','CELLAR',[(1590,300),(5627,300),(5627,4750),(3290,4750),(3290,3460),(1590,3460)],(3590,2450),[4037,4450],'service')
    # Shared negative source numbering and ascending model heights.
    draw_treads(d,cellar_stair())
    d.poly([(300,2300),(1590,2300),(1590,3460),(3534,3460),(3534,4750)],cls='detail')
    d.add('fixtures','<path class="detail" data-feature="cellar-stair-curve" d="M 300 2300 V 3460 A 1290 1290 0 0 0 1590 4750"/>')
    d.poly([(3440,4105),(945,4105),(945,2910)],cls='detail')
    d.poly([(740,3100),(945,2910),(1150,3100)],cls='detail')
    d.text(3650,4180,'up')
    d.poly([(360,4870),(420,4580),(530,4900),(360,4870)],cls='detail')
    d.text(830,5480,'AIR SHAFT')
    d.chain(1290,[300,4037,300],0,-900)
    d.dim((0,0),(5927,0),-1750)
    d.chain(0,[1290,4637],0,-1400)
    d.chain(0,[300,4450,300],5927,6900,'v')
    d.dim((5927,0),(5927,5050),7600,'v')
    d.chain(2000,[300,1250,1200,300],0,-900,'v')
    d.chain(300,[3160,1290],5627,6250,'v')
    for name,a,b,v,axis in [('Overall width',(0,5050),(5927,5050),5927,'h'),('Overall depth',(5927,0),(5927,5050),5050,'v'),('Clear width',(1590,300),(5627,300),4037,'h'),('Clear depth',(5627,300),(5627,4750),4450,'v')]:d.check(name,a,b,v,'Sheet 3 printed dimension',axis)
    d.issues.append('Stair tread spacing and air-shaft detail are reconstructed from the scan; no complete stair fabrication dimensions are printed.')
    d.save();return d
