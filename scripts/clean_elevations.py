"""Straight architectural elevations and section, sharing plan opening positions."""
import math
from vector_drawing import Drawing
from building_spec import BUILDING
from door_spec import DINING, LAUNDRY
from opening_spec import BATH2_WEST, BAY_RETURN
from roof_spec import draw_roofs, draw_roof_section
from cornice_spec import draw_cornices, CORNICES
FF=BUILDING['upperCeiling']
GCL=FF+BUILDING['floorZone']
GF=GCL+BUILDING['groundCeiling']
CELLAR=GF+BUILDING['floorZone']+BUILDING['cellarClearance']
COURSE=BUILDING['groundCeiling']/36
PITCH=BUILDING['roofPitch']


def elev(id,title,page,width,summary,source_bounds,source_origin):
    d=Drawing(id,title,'section' if id=='section' else 'elevation',page,[(0,0),(1,1)],[(0,0),(1,1)],
              [-3900,-3500,width+6000,13800],summary,
              [['Ground ceiling height','3,086 mm'],['Upper ceiling height','2,783 mm'],['Floor zone','172 mm'],['Cellar clear height','2,400 mm'],['Main roof pitch','20°49′']])
    sx,sy=source_bounds;ox,oy=source_origin
    ratios={5:2343/3306,6:2346/3314,7:2343/3308}
    d.source_image=dict(x=-ox*sx,y=-oy*sy,width=1888*sx,height=1888*ratios[page]*sy)
    d.issues.append('Façade profiles, mouldings, window frame details and undimensioned setbacks are reconstructed from the scan. Printed floor/ceiling heights are checked; full pixel equality is not asserted.')
    return d


def poly(d,points,fill=False,layer='base',cls=None):
    d.poly(points,layer,cls or ('roof' if fill else 'detail'),fill,'#fff' if fill else None)


def window(d,x,y,width,height,kind='awning',courses=None,assembly=None):
    id=f'{d.id}-window-{sum(g["type"]=="elevation-window" for g in d.geometry)}'
    d.rect(x,y,width,height,cls='detail')
    d.layers['fixtures'][-1]=d.layers['fixtures'][-1].replace('<rect ',f'<rect data-elevation-window="{id}" ',1)
    d.rect(x+35,y+35,width-70,height-70)
    if kind=='awning':d.poly([(x+45,y+45),(x+width/2,y+height-45),(x+width-45,y+45)])
    elif kind=='pv':d.text(x+width/2,y+height*.7,'PV','small-label')
    elif kind=='blocks':
        for i in range(1,5):d.poly([(x+i*width/5,y),(x+i*width/5,y+height)])
        for j in range(1,3):d.poly([(x,y+j*height/3),(x+width,y+j*height/3)])
    elif kind=='door':
        d.poly([(x,y),(x+width,y+height)]);d.poly([(x+width,y),(x,y+height)])
        d.poly([(x+width/2,y),(x+width/2,y+height)])
    elif kind=='single-door':
        d.poly([(x+width,y),(x,y+height/2),(x+width,y+height)])
    d.geometry.append(dict(id=id,type='elevation-window',x=x,y=y,width=width,height=height,kind=kind))
    if assembly:d.geometry[-1]['assembly']=assembly
    if courses:
        d.text(x-260,y+110,courses[0],'small-label')
        d.text(x-260,y+height+120,courses[1],'small-label')


def glazed_pair(d,x,y,width=3130,height=2143,assembly=None):
    side=(width-1640)/2
    side_height=round(16*COURSE)
    for xx in [x,x+side+1640]:
        window(d,xx,y,side,side_height,'awning',assembly=assembly)
        window(d,xx,y+side_height,side,height-side_height,'fixed',assembly=assembly)
    window(d,x+side,y,1640,height,'door',assembly=assembly)
    for yy,label in [(y+110,'23c'),(y+side_height+110,'07c'),(y+height+110,'−02c')]:
        d.text(x-300,yy,label,'small-label')


def arch(d,x,width,spring,bottom,moulding=172,fanlight=True,band=None,pier=590,centre_mullion=True):
    """Sheet 5: continuous impost band, semicircular head and separate jambs.

    The 1,640 mm glazed head sits between the wider 2,410 mm portico piers.
    The surround is a horizontal band that rises over the head, not a second
    full-height horseshoe. Its outer arc meets the band at a circle intersection.
    """
    r=width/2;cx=x+r
    left,right=band or (x-moulding,x+width+moulding)
    ro=r+moulding
    shoulder=math.sqrt(ro*ro-moulding*moulding)
    top=spring-moulding
    band_path=(f'M {left} {spring} H {x} A {r} {r} 0 0 1 {cx} {spring-r} '
               f'A {r} {r} 0 0 1 {x+width} {spring} H {right} V {top} '
               f'H {cx+shoulder} A {ro} {ro} 0 0 0 {cx} {spring-ro} '
               f'A {ro} {ro} 0 0 0 {cx-shoulder} {top} H {left} Z')
    parts=[f'<path class="detail" data-feature="arch-impost-band" d="{band_path}" style="fill:#fff"/>']
    # The piers retain the clear opening width of the plan. The thin lines inside
    # the front opening are recessed glazing, not thick masonry jambs.
    parts.append(f'<path class="detail" data-feature="arch-pier-jambs" d="M {left+pier} {spring} V {bottom} M {right-pier} {spring} V {bottom}"/>')
    if fanlight:
        # Opaque elevation glazing hides roof lines behind the arched opening.
        # Inline fill is required because the fixture class otherwise forces fill:none.
        parts.insert(0, f'<path class="fixture" data-feature="arch-glazing-face" d="M {x} {bottom} V {spring} A {r} {r} 0 0 1 {cx} {spring-r} A {r} {r} 0 0 1 {x+width} {spring} V {bottom} Z" style="fill:#fff"/>')
        centre_bottom=bottom if centre_mullion else spring
        parts.append(f'<path class="fixture" data-feature="round-arch" d="M {x} {bottom} V {spring} A {r} {r} 0 0 1 {cx} {spring-r} A {r} {r} 0 0 1 {x+width} {spring} V {bottom} M {x} {spring} H {x+width} M {cx} {centre_bottom} V {spring-r}"/>')
        inset=25;ri=r-inset
        parts.append(f'<path class="fixture" data-feature="arch-glazing-rebate" d="M {x+inset} {bottom-35} V {spring} A {ri} {ri} 0 0 1 {cx} {spring-ri} A {ri} {ri} 0 0 1 {x+width-inset} {spring} V {bottom-35} H {x+inset}"/>')
        for angle in [45,135]:
            a=math.radians(angle)
            parts.append(f'<path class="fixture" d="M {cx} {spring} L {cx+r*math.cos(a)} {spring-r*math.sin(a)}"/>')
    else:
        parts.append(f'<path class="detail" data-feature="round-arch" d="M {x} {bottom} V {spring} A {r} {r} 0 0 1 {cx} {spring-r} A {r} {r} 0 0 1 {x+width} {spring} V {bottom}"/>')
    arch_id=f'{d.id}-'+('upper' if bottom<3000 else 'entrance')
    d.add('fixtures',f'<g data-arch="{arch_id}">'+''.join(parts)+'</g>')
    d.geometry.append(dict(id=arch_id,type='arch',x=x,width=width,radius=r,spring=spring,bottom=bottom,
                           bandStart=left,bandEnd=right,bandDepth=moulding,pierWidth=pier,fanlight=fanlight,centreMullion=centre_mullion))


def levels(d,width,garage=False):
    for y,label in [(0,'CL  68c + PLATE'),(FF,'FL  36c'),(GCL,'CL  34c'),(GF,'FL  −02c'),(CELLAR,'CELLAR FL  −32c')]:
        d.poly([(-2450,y),(width+650,y)],layer='dimensions',cls='dimension dash')
        dy=-140 if y!=GCL else 380
        if y==FF:dy=-210
        d.add('dimensions',f'<text class="level-label" x="-3250" y="{y+dy}">{label}</text>')
    for name,a,b,val in [('Upper ceiling',0,FF,2783),('Floor zone',FF,GCL,172),('Ground ceiling',GCL,GF,3086),('Cellar clearance',GF+172,CELLAR,2400)]:
        d.dim((0,a),(0,b),-2550,'v')
        d.check(name,(0,a),(0,b),val,'Printed vertical height on the elevation/section','v')
    if garage:
        d.dim((0,GF),(0,GF+BUILDING['garageDrop']),-1700,'v')
    d.dim((width,GF),(width,GF+172),width+1200,'v')


def front():
    d=elev('elevation-1','Elevation 1 · front',5,26630,'Front façade, round arches and roof profiles',(26630/1197,6041/274),(300,249))
    poly(d,[(5520,0),(26630,0),(26630,GF),(5520,GF)],True)
    # Main hip and projecting roof slopes; the small portico gable is 25 degrees.
    for xx in [9600,22550]:d.poly([(xx,630),(xx,GF)])
    for xx in [6470,8150,10550,12470,18470,20390,22910,24590]:
        window(d,xx,640,1210,1543,'awning',('61c','43c'))
    for opening in CORNICES['assembly']['photoOpenings']:
        x=opening['x'];width=opening['width'];head=GF-opening['head'];height=opening['head']-opening['sill']
        id=opening['id']
        d.add('fixtures',f'<rect data-elevation-window="{id}" x="{x}" y="{head}" width="{width}" height="{height}" style="display:none"/>')
        path='M '+' L '.join(f'{xx:.3f} {GF-yy:.3f}' for xx,yy in opening['ring'])+' Z'
        d.add('fixtures',f'<path class="detail" data-photo-window="{id}" d="{path}" style="fill:#fff"/>')
        d.poly([(x+width/2,head+40),(x+width/2,head+height)],cls='fixture')
        d.geometry.append(dict(id=id,type='elevation-window',x=x,y=head,width=width,height=height,kind='segmental',photoOpeningId=id,segmentRise=opening['rise']))
    d.issues.append(BUILDING['frontPhoto']['assumptions'])
    for xx1,xx2,w1,w2 in [(6230,9600,6470,8150),(10340,13910,10550,12470),(18250,21820,18470,20390),(22680,26030,22910,24590)]:
        for yy in [2183]:
            # The sill band steps around each frame instead of crossing the glass.
            d.text((w1+1210+w2)/2,yy-120,'44c' if yy==2183 else '06c')
            d.text(xx1-270,yy+230,'41c' if yy==2183 else '03c')
    # Portico pilasters and entablature. White face masks cornices behind it.
    px1,px2=14280,17870;pc=(px1+px2)/2
    peak=-130-(px2-px1)/2*math.tan(math.radians(25))
    poly(d,[(px1,0),(px2,0),(px2,GF),(px1,GF)],True)
    # Feature window is 1,570 mm wide, as the first-floor opening chain specifies.
    arch(d,5520+9770,1570,640,2200,172,True,(px1,px2),centre_mullion=False)
    # Narrow arched glazing behind the wider opening between the piers.
    arch(d,pc-820,1640,3898,GF,172,True,(px1,px2))
    # Photographed solid pier bases are projected from the shared assembly.
    d.geometry[-1]['plinth']=[]
    # Garage has its own floor level, piers and wide opening.
    poly(d,[(0,3650),(6230,3650),(6230,GF+BUILDING['garageDrop']),(0,GF+BUILDING['garageDrop'])],True)
    d.poly([(590,GF+BUILDING['garageDrop']),(590,4420),(5520,4420),(5520,GF+BUILDING['garageDrop'])])
    d.poly([(0,GF+BUILDING['garageDrop']),(6230,GF+BUILDING['garageDrop']),(6230,GF+172),(27050,GF+172)],cls='detail')
    d.poly([(15800,GF+172),(15800,CELLAR),(21727,CELLAR),(21727,GF+172)],cls='detail dash')
    d.text(18763,7500,'CELLAR BELOW','room-label')
    d.text(15300,-2900,'TILE ROOF @ 20°49′ PITCH','small-label')
    d.text(18700,-1980,'TILE ROOF @ 25° PITCH','small-label')
    d.poly([(17900,-1850),(pc+300,peak+150)])
    d.text(10700,3330,'render')
    d.facts.append(['Portico gable pitch','25°'])
    d.check('Feature window',(15290,640),(16860,640),1570,'Sheet 2 plan opening chain')
    draw_cornices(d, "front")
    draw_roofs(d, "front")
    levels(d,26630,True);d.save()


def left():
    d=elev('elevation-2','Elevation 2 · left side',5,15470,'Side façade, garage, glazed doors and portico',(13190/594,6041/275),(612,799))
    poly(d,[(0,0),(13190,0),(13190,GF),(0,GF)],True)
    d.poly([(4080,0),(4080,2955),(5000,2955),(5000,3740)])
    window(d,BATH2_WEST['start'],640,BATH2_WEST['width'],1200,'awning',('61c','47c'))
    glazed_pair(d,DINING['start']-600,3898,DINING['width'],2143,'dining-glazing')
    window(d,BAY_RETURN['start']-600,3898,BAY_RETURN['width'],1200,'fixed',('23c','09c'))
    poly(d,[(-600,3740),(-600,2955),(0,2955),(0,3740)],True)
    # Side of the open portico, with a 1-degree metal roof.
    poly(d,[(13190,2183),(15470,2183-2280*math.tan(math.radians(1))),(15470,GF),(13190,GF)],True)
    arch(d,13190+590,1100,3898,GF,172,False,(13190,15470))
    d.text(15000,1700,'METAL ROOF · 1°')
    # Garage runs from 6,480 to 13,310 in the ground plan (rear datum offset 600).
    gx1,gx2=5880,12710
    poly(d,[(gx1,GF-2390),(gx2,GF-2390),(gx2,GF+BUILDING['garageDrop']),(gx1,GF+BUILDING['garageDrop'])],True)
    d.poly([(-2500,GF+172),(gx1,GF+172),(gx1,GF+BUILDING['garageDrop']),(gx2+1200,GF+BUILDING['garageDrop'])])
    d.poly([(4450,GF+172),(4450,CELLAR),(9500,CELLAR),(9500,GF+172)],cls='detail dash')
    d.text(6975,7700,'CELLAR BELOW','room-label');d.text(7690,-1200,'TILE ROOF @ 20°49′ PITCH')
    d.text(2700,1330,'render')
    draw_cornices(d, "left")
    draw_roofs(d, "left")
    levels(d,15470);d.save()


def rear():
    d=elev('elevation-3','Elevation 3 · rear',6,26630,'Rear façade with privacy glazing and kitchen bay',(26630/1190,6041/274),(372,270))
    poly(d,[(0,0),(21110,0),(21110,GF),(0,GF)],True)
    d.poly([(17030,630),(17030,GF)])
    # Mirror the first-floor rear opening coordinates into the rear view.
    openings=[(4790,1210,'awning',1371),(6590,1210,'awning',1371),(9590,610,'pv',1200),(10790,1210,'awning',1371),(12590,1210,'awning',1371),(15950,610,'pv',514),(16790,610,'pv',514),(19070,610,'pv',514),(3470,610,'pv',514)]
    for xx,w,kind,h in openings:
        rx=26630-(5520+xx+w)
        window(d,rx,640,w,h,kind,('61c','55c' if h==514 else '47c' if h==1200 else '45c'))
    # Rear lower windows and laundry door align with the ground floor opening chain.
    window(d,26630-(24470+1330),3898,1330,1371,'awning',('23c','07c'))
    bx1,bx2=26630-22910,26630-18720
    poly(d,[(bx1,2901),(bx2,2901),(bx2,GF),(bx1,GF)],True)
    for i in range(4):
        xx=bx1+155+i*970
        window(d,xx,3898,970,1200,'fixed' if i%2==0 else 'awning',assembly='bay')
    window(d,26630-(17270+1090),3898,1090,686,'blocks',('23c','15c'))
    lx=26630-LAUNDRY['hinge']
    window(d,lx,3898,LAUNDRY['leaf'],2143,'single-door',('23c','−02c'),assembly='laundry')
    window(d,lx+LAUNDRY['leaf'],3898,LAUNDRY['side'],943,'awning',('23c','12c'),assembly='laundry')
    window(d,26630-(7550+1210),3898,1210,1371,'awning',('23c','07c'))
    gx1=26630-6810
    poly(d,[(gx1,3740),(26630,3740),(26630,GF+BUILDING['garageDrop']),(gx1,GF+BUILDING['garageDrop'])],True)
    window(d,26630-(3710+1210),GF-17*COURSE,1210,14*COURSE,'awning',('17c','03c'))
    d.poly([(-1100,GF+172),(gx1-1000,GF+172),(gx1,GF+BUILDING['garageDrop']),(26700,GF+BUILDING['garageDrop'])])
    d.poly([(4880,GF+172),(4880,CELLAR),(10807,CELLAR),(10807,GF+172)],cls='detail dash')
    d.text(7843,7630,'CELLAR BELOW','room-label');d.text(10000,-1600,'TILE ROOF @ 20°49′ PITCH')
    d.text(1800,2430,'render')
    draw_cornices(d, "rear")
    draw_roofs(d, "rear")
    levels(d,26630,True);d.save()


def right():
    d=elev('elevation-4','Elevation 4 · right side',6,15470,'Right side with meals and games glazed doors',(13190/593,6041/275),(662,798))
    d.bounds=[-5800,-3500,23000,13800]
    poly(d,[(0,0),(13190,0),(13190,GF),(0,GF)],True)
    d.poly([(1050,630),(1050,GF)])
    for yy in [2750,6350,8510,10070]:window(d,13190-yy-1210,640,1210,1543,'awning',('61c','43c'))
    for yy in [9110,10670]:window(d,13790-yy-1210,3898,1210,1543,'awning',('23c','05c'))
    for yy,assembly in [(1430,'meals-east'),(5270,'games-door')]:glazed_pair(d,13790-yy-3130,3898,3130,2143,assembly)
    poly(d,[(-2280,2183),(0,2183),(0,GF),(-2280,GF)],True)
    arch(d,-1690,1100,3898,GF,172,False,(-2280,0))
    window(d,13790-BAY_RETURN['start']-BAY_RETURN['width'],3898,BAY_RETURN['width'],1200,'fixed')
    d.poly([(-2700,GF+172),(14500,GF+172)])
    d.poly([(3110,GF+172),(3110,CELLAR),(8160,CELLAR),(8160,GF+172)],cls='detail dash')
    d.text(5635,7600,'CELLAR BELOW','room-label');d.text(7600,-1200,'TILE ROOF @ 20°49′ PITCH');d.text(6100,2590,'render')
    draw_cornices(d, "right")
    draw_roofs(d, "right")
    levels(d,13790);d.save()


def section():
    d=elev('section','Section X–X',7,13190,'Section through WIR, passage, studio, kitchen and cellar',(13190/581,6041/278),(815,345))
    poly(d,[(0,0),(13190,0),(13190,GF),(0,GF)],True)
    draw_roof_section(d)
    for name,x,y,w,h in [('rear-wall',0,0,230,GF),('front-wall',12960,0,230,GF),('upper-slab',0,FF,13190,172),('ground-slab',-550,GF,13740,172),('wir-partition',5690,0,90,FF),('studio-partition',7560,0,90,FF)]:d.wallbox(name,x,y,w,h)
    cx1,cx2=5311,9761
    for name,x,y,w,h in [('cellar-west',cx1-300,GF+172,300,2700),('cellar-east',cx2,GF+172,300,2700),('cellar-base',cx1-300,CELLAR,5050,300)]:d.wallbox(name,x,y,w,h)
    d.room_rect('section-wir','W.I.R.',230,230,5460,2300)
    d.room_rect('section-pass','PASSAGE',5780,230,1780,2300)
    d.room_rect('section-studio','STUDIO',7650,230,5310,2300)
    d.room_rect('section-kitchen','KITCHEN',230,3127,4781,2700)
    d.room_rect('section-family','FAMILY',5101,3127,7859,2700,label=(9420,3800))
    d.room_rect('section-cellar','CELLAR',cx1,GF+172,4450,2400)
    for x in [8350,10030]:
        window(d,x,640,1210,1543,'fixed');window(d,x,3898,1210,1543,'fixed')
    for xx,ww in [(2350,820),(6790,720)]:
        for inset in [0,35]:d.poly([(xx+inset,FF),(xx+inset,640+inset),(xx+ww-inset,640+inset),(xx+ww-inset,FF)])
    d.poly([(2450,0),(2450,640)]);d.poly([(3170,1030),(5220,1030)])
    # Continuous ceiling lines, slabs, joinery, glazing and structural footings.
    d.poly([(230,70),(12960,70)]);d.poly([(230,GCL+70),(12960,GCL+70)])
    d.rect(-550,GF-900,5560,900,cls='detail')
    for xx in [230,730,1460,2190,2920,3650,4380]:d.poly([(xx,GF-900),(xx,GF)])
    window(d,720,3898,3080,1243,'fixed')
    for xx in [1490,2260,3030]:d.poly([(xx,3898),(xx,5141)])
    d.poly([(4560,GF),(4560,3898),(7650,3898),(7650,GF)])
    d.poly([(4595,GF),(4595,3933),(7615,3933),(7615,GF)])
    d.poly([(5101,GCL),(5101,GF)])
    for xx,yy,ww in [(-250,GF+172,550),(12750,GF+172,650),(cx1-450,CELLAR+300,600),(cx2-150,CELLAR+300,600)]:d.rect(xx,yy,ww,300,cls='detail')
    # Short regular masonry-course marks, rather than jagged scan outlines.
    for xx in [0,12960]:
        for yy in range(170,6040,172):d.poly([(xx,yy),(xx+230,yy)])
    for xx in [cx1-300,cx2]:
        for yy in range(6400,8613,172):d.poly([(xx,yy),(xx+300,yy)])
    d.text(10700,-2900,'TILED ROOF @ 20°49′ PITCH')
    d.text(11350,-2000,'STANDARD ROOF CONSTRUCTION')
    d.text(11350,-1720,'AS PER SPECIFICATIONS')
    d.poly([(11100,-1600),(10100,-1350)],cls='detail')
    d.text(7550,9540,'300 mm CAVITY BRICK CELLAR WALLS')
    levels(d,13190)
    d.check('Cellar clear width in section',(cx1,7000),(cx2,7000),4450,'Sheet 3 clear cellar depth projected into section')
    d.check('Cellar outer width in section',(cx1-300,7000),(cx2+300,7000),5050,'Sheet 3 overall cellar depth projected into section')
    d.save()
