"""SNOWLINE: art-directed ridge terrain, brush-painted maps, Blender/GLB pipeline.
blender -b --python scripts/build_world.py -- --blockout
blender -b --python scripts/build_world.py
"""
import bpy, numpy as np, math, json, sys
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[1]
BLOCK='--blockout' in sys.argv
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
def collection(name,parent=None):
    c=bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c); return c
web=collection('WEB_EXPORT'); terraincol=collection('Terrain',web); snowcol=collection('Snow',web); cams=collection('Cameras',web)
work=collection('WORK'); refcol=collection('REFERENCE'); lights=collection('LIGHTING')
def obj(name,data,col):
    o=bpy.data.objects.new(name,data); col.objects.link(o); return o
def noise(x,y):
    ix=np.floor(x); iy=np.floor(y); a=x-ix; b=y-iy; a=a*a*(3-2*a); b=b*b*(3-2*b)
    def h(x,y): return np.mod(np.sin(x*127.1+y*311.7+8.9)*43758.5453,1)
    return (h(ix,iy)*(1-a)+h(ix+1,iy)*a)*(1-b)+(h(ix,iy+1)*(1-a)+h(ix+1,iy+1)*a)*b
# Heights and widths describe monumental crest profiles, distinct lateral spurs, and deep glacial valleys.
MAIN=[[-2700,-2900,650,1100],[-2160,-2100,1200,1250],[-1630,-1390,1640,1350],[-1170,-670,1520,1180],[-780,-90,2380,1440],[-590,180,2560,1480],[-50,870,1920,1220],[410,1250,2280,1320],[960,1700,2820,1540],[1150,1910,3060,1600],[1550,2360,2420,1520],[2220,3170,1760,1800],[2910,4190,860,1900]]
RIDGES=[
    (MAIN,1.0),
    # Left Secondary Peak South Lateral Spur (divides left peak into sunlit south wall and shadowed east cirque wall)
    ([[-560,160,2280,1120],[60,-620,1540,1280],[680,-1420,860,1460]],.84),
    # West & North supporting spurs
    ([[-780,-90,2250,1150],[-2110,270,1710,1300],[-3450,900,1140,1550],[-4350,2010,700,1750]],.75),
    # Main Peak Monumental Southeast Spur (divides main peak into vast sunlit south wall vs unified blue-violet shadow wall)
    ([[1200,1940,2780,1120],[2560,1380,1920,1460],[3690,560,1140,1750],[4840,1700,720,1900]],.78),
    # Framing foreground & midground ridges (low saddle in front of camera so main peak is commanding)
    ([[-4900,-4000,880,1800],[-4650,-1600,1610,1850],[-4210,600,1710,1600],[-3340,2610,1630,1750],[-2880,3700,1320,1900]],1.1),
    ([[3800,-3700,1160,1750],[4600,-1310,1380,1460],[4660,2910,1720,2050],[5600,5100,1280,2180]],1.05),
    # Distant horizon mountain rings
    ([[-8900,4000,1400,2400],[-7100,6500,2350,2300],[-4300,7400,1850,2300],[-1200,8250,2420,2200],[1900,7950,1900,2350],[4900,8500,2640,2450],[8500,6750,1700,2600]],1),
    ([[-10700,-4500,1550,2500],[-9800,-1200,2240,2600],[-9000,2300,1920,2250]],1),
    ([[9500,-6000,1800,2600],[11000,-2400,2500,2450],[10400,1300,1900,2700],[10400,4900,2180,2550]],1),
    ([[-7000,-8500,1710,2550],[-3200,-9300,2240,2500],[800,-8600,1550,2450],[4800,-9700,2000,2700]],1)
]
# Broad glacial valleys carved between the peaks and lateral spurs
VALLEYS=[
    [[140,660,210,640],[760,-60,250,780],[1480,-840,200,920]],
    [[-1220,-480,165,580],[-580,-1180,195,720]]
]
def smax(a,b,k=55.0):
    m=np.maximum(a,b)
    h=np.maximum(0.0,k-np.abs(a-b))/k
    blend=np.clip(np.minimum(a,b)/k,0.0,1.0)
    return m+.25*k*h*h*blend

def ridge_height(x,y,points,asym):
    best=np.zeros_like(x,dtype=float)
    for p,q in zip(points[:-1],points[1:]):
        vx=q[0]-p[0]; vy=q[1]-p[1]; length=vx*vx+vy*vy; inv_len=1.0/math.sqrt(length)
        t=np.clip(((x-p[0])*vx+(y-p[1])*vy)/length,0,1)
        rx=x-(p[0]+t*vx); ry=y-(p[1]+t*vy)
        # Smooth crest radius avoids 1px zero-slope cusp while preserving a sharp summit ridge
        d=np.sqrt(rx*rx+ry*ry+20.0*20.0)-20.0
        # Smooth angular asymmetry (never jumps across a straight ray past segment endpoints)
        perp=(rx*vy-ry*vx)*inv_len
        asym_mod=perp/np.sqrt(d*d+480.0*480.0)
        width=(p[3]+t*(q[3]-p[3]))*(.95-.26*asym_mod)*asym
        height=p[2]+t*(q[2]-p[2])
        # Planar-concave dihedral profile for strong architectural rock walls
        value=height*np.maximum(0,1-(d/width)*.54)**1.62
        best=smax(best,value,45.0)
    return best

def valley_cut(x,y):
    cut=np.zeros_like(x,dtype=float)
    for pts in VALLEYS:
        for p,q in zip(pts[:-1],pts[1:]):
            vx=q[0]-p[0]; vy=q[1]-p[1]; length=vx*vx+vy*vy
            t=np.clip(((x-p[0])*vx+(y-p[1])*vy)/length,0,1)
            rx=x-(p[0]+t*vx); ry=y-(p[1]+t*vy); d2=rx*rx+ry*ry
            depth=p[2]+t*(q[2]-p[2]); w=p[3]+t*(q[3]-p[3])
            cut=smax(cut,depth*np.exp(-d2/(w*w)),28.0)
    return cut

def height(x,y):
    result=np.zeros_like(x,dtype=float)
    # Broad, clean tectonic warping (no small high-frequency wiggles)
    wx=x+220*(noise(x/1050,y/1150)-.5); wy=y+175*(noise(x/1100+17,y/1000)-.5)
    for points,asym in RIDGES: result=smax(result,ridge_height(wx,wy,points,asym),65.0)
    result=np.maximum(0,result-valley_cut(wx,wy)*np.clip(result/950,0,1))
    # Consolidate flanks into large, monumental planar rock faces (clamped >=0 so fractional powers never produce NaN)
    u=.82*x-.57*y; v=.57*x+.82*y
    w1=2*noise((u+105*noise(x/720,y/680))/540,v/860)-1
    w2=2*noise(u/290+11,v/460)-1
    macro_fold=np.maximum(0.0,1.0-np.sqrt(w1*w1+.04)+math.sqrt(.04))
    sub_fold=np.maximum(0.0,1.0-np.sqrt(w2*w2+.05)+math.sqrt(.05))
    slab_plane=noise(u/480+7,v/640)-.5
    phase=u/290+v/440+slab_plane*1.25
    chisel_plane=np.sin(phase)*26.0-np.sin(2.0*phase)*8.0
    detail=(macro_fold**1.45-.38)*220+(sub_fold**1.35-.40)*82+slab_plane*140+chisel_plane
    distance=np.sqrt(x*x+y*y);detail*=1-.82*np.clip((distance-4500)/5500,0,1)
    # Sharp, powerful summit pyramid peaks
    cap=np.zeros_like(x,dtype=float)
    for a,b,boost in [(MAIN[3],MAIN[4],28),(MAIN[4],MAIN[5],44),(MAIN[7],MAIN[8],38),(MAIN[8],MAIN[9],68)]:
        vx=b[0]-a[0];vy=b[1]-a[1];tt=np.clip(((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy),0,1);dd=(x-a[0]-tt*vx)**2+(y-a[1]-tt*vy)**2
        cap=np.maximum(cap,boost*np.exp(-dd/(82**2)))
    return 160+result+75*noise(x/2200,y/1900)+detail*np.clip(result/850,0,1)+cap

def gradients(x,y): return (height(x+6,y)-height(x-6,y))/12,(height(x,y+6)-height(x,y-6))/12
PAINT=json.loads((ROOT/'textures/paint-layout.json').read_text())
def stroke_distance(x,y,points):
    dist=np.ones_like(x)*1e8
    for a,b in zip(points[:-1],points[1:]):
        vx=b[0]-a[0]; vy=b[1]-a[1]; t=np.clip(((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy),0,1)
        dist=np.minimum(dist,np.sqrt((x-a[0]-t*vx)**2+(y-a[1]-t*vy)**2))
    return dist

def hexrgb(s): return np.array([int(s[i:i+2],16)/255 for i in (1,3,5)])
def linear(v): return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def image_array(name,pixels,color=True):
    h,w=pixels.shape[:2]
    if pixels.ndim==2: pixels=np.repeat(pixels[...,None],3,axis=-1)
    data=np.clip(pixels,1e-4,1) if not color else np.clip(pixels,0,1)
    rgba=np.concatenate([data,np.ones((h,w,1))],axis=-1).astype(np.float32)
    im=bpy.data.images.new(name,w,h,alpha=False); im.colorspace_settings.name='sRGB' if color else 'Non-Color'; im.pixels.foreach_set(rgba.ravel()); im.filepath_raw=str(ROOT/'textures'/f'{name}.png'); im.file_format='PNG'; im.save(); im.pack(); return im

def material(name,color=None,image=None,normal_image=None):
    m=bpy.data.materials.new(name); m.use_nodes=True; n=m.node_tree.nodes; n.clear(); p=n.new('ShaderNodeBsdfPrincipled'); out=n.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface']);p.inputs['Roughness'].default_value=.92;p.inputs['Metallic'].default_value=0
    if color is not None: p.inputs['Base Color'].default_value=(*linear(hexrgb(color)),1)
    if image:
        tex=n.new('ShaderNodeTexImage');tex.image=image;tex.extension='EXTEND'; m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    if normal_image:
        tex=n.new('ShaderNodeTexImage');tex.image=normal_image;tex.extension='EXTEND'
        normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35
        m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    return m

# Generated painting is a source material; project triplanar before baking to UV.
rock_source=bpy.data.images.load(str(ROOT/'textures/alpine-rock-painted.png'));rock_source.pack()
rock_pixels=np.empty(len(rock_source.pixels),dtype=np.float32);rock_source.pixels.foreach_get(rock_pixels)
rock_pixels=rock_pixels.reshape(rock_source.size[1],rock_source.size[0],4)[...,:3]
def sample_rock(u,v):
    h,w=rock_pixels.shape[:2];fx=np.mod(u,1)*(w-1);fy=np.mod(v,1)*(h-1)
    ix=fx.astype(int);iy=fy.astype(int);a=(fx-ix)[...,None];b=(fy-iy)[...,None]
    return ((rock_pixels[iy,ix]*(1-a)+rock_pixels[iy,np.minimum(ix+1,w-1)]*a)*(1-b)
           +(rock_pixels[np.minimum(iy+1,h-1),ix]*(1-a)+rock_pixels[np.minimum(iy+1,h-1),np.minimum(ix+1,w-1)]*a)*b)

def paint_texture(name,x0,x1,y0,y1,T,detail,geometry_gx,geometry_gy,geometry_z):
    xs=np.linspace(x0,x1,T); ys=np.linspace(y0,y1,T); X,Y=np.meshgrid(xs,ys)
    def upscale(a):
        sy,sx=a.shape; xx=np.linspace(0,sx-1,T); yy=np.linspace(0,sy-1,T); xi=np.minimum(xx.astype(int),sx-2); yi=np.minimum(yy.astype(int),sy-2); fx=(xx-xi)[None,:];fy=(yy-yi)[:,None]
        return (a[yi[:,None],xi[None,:]]*(1-fx)+a[yi[:,None],xi[None,:]+1]*fx)*(1-fy)+(a[yi[:,None]+1,xi[None,:]]*(1-fx)+a[yi[:,None]+1,xi[None,:]+1]*fx)*fy
    gx,gy=upscale(geometry_gx),upscale(geometry_gy); Z=upscale(geometry_z);slope=np.sqrt(gx*gx+gy*gy)
    u=.82*X-.57*Y; v=.57*X+.82*Y

    # 1. Analytical World-Space Topographic Concavity (seamless across tile borders: >0 in gullies/couloirs, <0 on convex ridges/walls)
    z_near=.25*(height(X+120,Y)+height(X-120,Y)+height(X,Y+120)+height(X,Y-120))
    z_wide=.25*(height(X+260,Y)+height(X-260,Y)+height(X,Y+260)+height(X,Y-260))
    concavity=np.clip((z_near-Z)/22.0,-1.3,1.7)*.56+np.clip((z_wide-Z)/48.0,-1.3,1.7)*.44

    # 2. Topographic Snow Distribution:
    #    - Gentle slopes form coherent, unbroken snowfields (even on rounded shoulders)
    #    - Steep planar walls & convex ribs expose vast bare rock
    #    - Longitudinal gullies & chutes retain vertical snow ribbons
    joint_a=noise(u/240,v/310)-.5; joint_b=noise(u/95+7,v/130)-.5
    wx=X+140*joint_a+35*joint_b; wy=Y+140*(noise(u/310+19,v/240)-.5)+35*(noise(u/130+13,v/95)-.5)
    concav_pos=np.maximum(concavity,0.0)
    concav_neg=np.minimum(concavity,0.0)*np.clip((slope-.68)*2.2,0.0,1.0)
    gentle_snow=np.clip((.85-slope+.26*concav_pos+.22*concav_neg+.08*joint_a)*6.4+.5,0,1)
    gully_snow=np.clip((concavity-.12)*3.8+.06*joint_b,0,1)*np.clip((1.36-slope)*2.2,0,1)
    mask=np.maximum(gentle_snow,gully_snow)
    mask=mask*mask*(3-2*mask)

    for role in ('rock','snow'):
        for s in PAINT[role]:
            pts=np.array(s['points']);pad=s['width']*1.35
            if pts[:,0].max()+pad<x0 or pts[:,0].min()-pad>x1 or pts[:,1].max()+pad<y0 or pts[:,1].min()-pad>y1:continue
            d=stroke_distance(wx,wy,s['points'])
            # Snow strokes only fill basins and moderate gullies, never steep cliff walls
            slope_mod=np.clip(1.38-slope*.82,.18,1) if role=='snow' else np.clip(slope*.95+.1,.35,1)
            alpha=np.clip((1-d/(s['width']*slope_mod))*2.8,0,1)
            alpha=alpha*alpha*(3-2*alpha)*s['strength']
            if role=='snow': alpha*=np.clip((1.16-slope)*2.4,0,1)
            mask=mask*(1-alpha)+(1 if role=='snow' else 0)*alpha

    # Crisp snow-to-rock boundary without any horizontal white stripe bands
    mask=np.clip((mask-.48)*6.0+.5,0,1); mask=mask*mask*(3-2*mask)

    # Rich Bande Dessinee mineral rock blocks (broad macro color zones, not small busy noise)
    warm_ochre=hexrgb('#988675')
    mid_slate=hexrgb('#726C6E')
    cool_slate=hexrgb('#525E74')
    block_val=np.clip(noise(u/320+7,v/420)*.65+noise(X/580,Y/640)*.35,0,1)
    b1=np.clip((block_val-.36)*5.2,0,1)[...,None]; b2=np.clip((block_val-.64)*5.2,0,1)[...,None]
    rockrgb=cool_slate*(1-b1)+mid_slate*(b1-b2)+warm_ochre*b2

    snow_warm=hexrgb('#F3EFE6'); snow_cool=hexrgb('#DCE6F3')
    drift=np.clip(noise(u/260,v/360),0,1)[...,None]
    snowrgb=snow_warm*(1-drift*.20)+snow_cool*(drift*.20)
    rgb=rockrgb*(1-mask[...,None])+snowrgb*mask[...,None]

    distance=np.sqrt(X*X+Y*Y); haze=np.clip((distance-7800)/8500,0,.60)[...,None]
    rgb=rgb*(1-haze)+hexrgb('#9EB2CC')*haze
    image=image_array(name+'_color',rgb)
    if not BLOCK and abs(x0)<6500 and abs(y0)<6500: image_array(name+'_snowmask',mask,False)
    normal_image=None
    if detail>.5:
        # Compute rock and snow relief gradients separately before blending so mask transitions never create normal spikes
        strata_macro=Z/195+u/480+noise(X/420,Y/460)*.75
        rock_relief=np.sin(strata_macro*3.14159)*.85+noise(u/185,v/255)*1.9
        snow_relief=noise(u/220,v/310)*.28
        step_y=(y1-y0)/(T-1); step_x=(x1-x0)/(T-1)
        ry,rx=np.gradient(rock_relief,step_y,step_x)
        sy,sx=np.gradient(snow_relief,step_y,step_x)
        dx=rx*(1-mask)+sx*mask; dy=ry*(1-mask)+sy*mask
        ts=np.stack([-dx*1.0,-dy*1.0,np.ones_like(dx)],axis=-1);ts/=np.linalg.norm(ts,axis=-1)[...,None]
        normal_image=image_array(name+'_normal',ts*.5+.5,False)
    return image,normal_image

# Shared tile edges use the same explicit coordinates and analytic normals.
BOUND=[-16000,-6000,-2000,2000,6000,16000]
counts=[24,40,40,40,24] if BLOCK else [64,192,384,192,64]
terrainobjects=[]
for iy in range(5):
 for ix in range(5):
    x0,x1=BOUND[ix:ix+2]; y0,y1=BOUND[iy:iy+2]; nx,ny=counts[ix]+1,counts[iy]+1
    X,Y=np.meshgrid(np.linspace(x0,x1,nx),np.linspace(y0,y1,ny));Z=height(X,Y)
    verts=np.stack([X,Y,Z],axis=-1).reshape(-1,3)
    j,i=np.mgrid[0:ny-1,0:nx-1];v=(j*nx+i).ravel();faces=np.stack([v,v+1,v+nx+1,v+nx],axis=-1)
    mesh=bpy.data.meshes.new(f'Terrain_{ix}_{iy}_mesh');mesh.from_pydata(verts.tolist(),[],faces.tolist());mesh.update()
    center=ix in (1,2,3) and iy in (1,2,3)
    name=('Hero' if ix==2 and iy in(1,2,3) else 'Midground' if center else 'Background')+f'_{ix}_{iy}'
    o=obj(name,mesh,terraincol);terrainobjects.append(o)
    uv=mesh.uv_layers.new(name='PaintedUV')
    for p in mesh.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            vi=mesh.loops[li].vertex_index;uv.data[li].uv=(vi%nx/(nx-1),vi//nx/(ny-1))
    gx,gy=gradients(X,Y);norm=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1).reshape(-1,3);norm/=np.linalg.norm(norm,axis=1)[:,None]
    mesh.normals_split_custom_set_from_vertices(norm.tolist())
    T=128 if BLOCK else (2048 if ix==2 and iy in(1,2,3) else 1024 if center else 512)
    tex,normal=paint_texture(name,x0,x1,y0,y1,T,1 if center else .1,gx,gy,Z)
    m=material('Painted_'+name,image=tex,normal_image=normal);o.data.materials.append(m);o['region']='Hero' if name.startswith('Hero') else 'Midground' if center else 'Background'
    if ix==2 and iy==2:
        src=o.copy();src.data=mesh.copy();src.name='Hero_High_Resolution_Edit_Source';work.objects.link(src);src.hide_render=True;src.hide_set(True)
        mod=src.modifiers.new('Editable_Sculpt_Subdivision','SUBSURF');mod.levels=1;mod.render_levels=2
    print('TILE',name,flush=True)
# Embedded rock buttresses: irregular layered prisms, with their own snow shelves.
# All geometry is retained in Blender and exported; no view-facing cards.
rockverts=[];rockfaces=[];rockcolors=[];snowverts=[];snowfaces=[]
rng=np.random.default_rng(781)
anchors=[(-1380,-1700),(-1010,-1250),(-610,-830),(-340,-330),(-160,220),
         (-1450,-170),(-1830,420),(-2410,640),(310,1080),(1460,1600),
         (1640,1980),(1870,2180),(2280,1470),(2640,1100)]
# The authored flight corridor is kept clear of the new volume.
flightxy=[[-2750,-4700],[-2300,-3150],[-1650,-1750],[-1100,-690],[-760,130],[-120,1050],[1010,1880],[2020,2310],[2950,2900],[2300,4600],[500,6200]]
for ax,ay in anchors:
 for piece in range(5):
    cx=ax+rng.uniform(-125,125);cy=ay+rng.uniform(-130,130)
    if float(stroke_distance(np.array(cx),np.array(cy),flightxy))<260:continue
    rx=rng.uniform(45,105);ry=rng.uniform(55,150);rise=rng.uniform(85,170)
    theta=rng.uniform(-.8,.8);angles=np.arange(7)*2*np.pi/7
    polygon=np.stack([np.cos(angles)*rx,np.sin(angles)*ry],axis=-1)
    polygon*=rng.uniform(.78,1.16,(7,1))
    polygon=polygon@np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
    h0=float(height(np.array(cx),np.array(cy)));offset=len(rockverts)
    tops=[]
    for level in range(4):
        scale=[1.25,1.06,.95,.68][level]
        for k,xy in enumerate(polygon):
            xx=cx+xy[0]*scale+level*12;yy=cy+xy[1]*scale-level*7
            zbase=float(height(np.array(xx),np.array(yy)))
            zz=zbase-95 if level==0 else h0+rise*[-.5,.0,.7,1.0][level]+rng.uniform(-16,16)
            rockverts.append((xx,yy,zz))
            if level==3:tops.append((xx,yy,zz))
    for level in range(3):
        for k in range(7):
            rockfaces.append(tuple(offset+i for i in [level*7+k,level*7+(k+1)%7,(level+1)*7+(k+1)%7,(level+1)*7+k]))
            tone=rng.uniform(.76,1.18);rockcolors.append(np.clip(hexrgb('#75808C')*tone,0,1))
    rockfaces.append(tuple(offset+21+k for k in range(7)));rockcolors.append(hexrgb('#647086'))
    # A small thick snow bank follows each cap rather than floating above it.
    off=len(snowverts);tops=np.array(tops);center=tops.mean(axis=0);center[2]+=8
    snowverts.extend(tops.tolist());snowverts.append(center.tolist())
    for k in range(7):snowfaces.append((off+k,off+(k+1)%7,off+7))
rockmesh=bpy.data.meshes.new('Fractured_Buttress_Geometry');rockmesh.from_pydata(rockverts,[],rockfaces);rockmesh.update()
rocks=obj('Hero_Fractured_Buttresses',rockmesh,work);rocks.hide_render=True;rocks.hide_set(True)
color=rockmesh.color_attributes.new(name='Rock_Pigment',type='FLOAT_COLOR',domain='CORNER')
for face,c in zip(rockmesh.polygons,rockcolors):
 for loop in face.loop_indices:color.data[loop].color=(*linear(c),1)
mat=material('Layered_Cliff_Rock',color='#FFFFFF');nodes=mat.node_tree.nodes;attribute=nodes.new('ShaderNodeVertexColor');attribute.layer_name='Rock_Pigment';mat.node_tree.links.new(attribute.outputs['Color'],next(n for n in nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color']);rockmesh.materials.append(mat)
bevel=rocks.modifiers.new('Small_Broken_Edges','BEVEL');bevel.width=5;bevel.segments=2
sn=bpy.data.meshes.new('Buttress_Snow_Shelves');sn.from_pydata(snowverts,[],snowfaces);sn.update();so=obj('Hero_Snow_Shelves',sn,work);so.hide_render=True;so.hide_set(True);sn.materials.append(material('Snow_Shelves',color='#E5EBEC'))
for poly in sn.polygons:poly.use_smooth=True
# Actual snow cornice volume along selected parts of the crest.
snowmat=material('Snow_Cornice_Handpainted',color='#E8E5D8')
for k,(ia,ib) in enumerate([(3,5),(6,8),(8,10)]):
    pts=np.array(MAIN[ia:ib+1],float); out=[]
    for p,q in zip(pts[:-1],pts[1:]):
        direction=(q[:2]-p[:2]);direction/=np.linalg.norm(direction);side=np.array([-direction[1],direction[0]])
        for t in np.linspace(0,1,28,endpoint=False):
            xy=p[:2]*(1-t)+q[:2]*t
            for u in np.linspace(-1,1,7):
                xx,yy=xy+side*u*52;zz=float(height(np.array(xx),np.array(yy)))+18+12*(1-u*u)
                out.append((xx,yy,zz))
    rows=len(out)//7;faces=[]
    for r in range(rows-1):
        for c in range(6):a=r*7+c;faces.append((a,a+1,a+8,a+7))
    me=bpy.data.meshes.new(f'Cornice_{k}');me.from_pydata(out,[],faces);me.update();o=obj(f'Snow_Cornice_Construction_{k}',me,work);o.data.materials.append(snowmat);o.hide_render=True;o.hide_set(True)
    for p in me.polygons:p.use_smooth=True
# Reference image empty and art directions are retained for editing, outside export.
refimg=bpy.data.images.load(str(ROOT/'references/frames/hero-77s.jpg'));refimg.pack();ref=obj('Hero_Reference_01_17',None,refcol);ref.empty_display_type='IMAGE';ref.data=refimg;ref.hide_render=True;ref.hide_set(True)
# Camera and deliberately controlled cinematic corridor.
def camera(name,pos,target,lens=31):
    c=bpy.data.cameras.new(name);c.lens=lens;c.clip_start=2;c.clip_end=50000
    o=obj(name,c,cams);o.rotation_mode='QUATERNION';o.location=pos;o.rotation_quaternion=(Vector(target)-o.location).to_track_quat('-Z','Y');return o
hero=camera('Web_Default_Camera',(-6200,-7000,3700),(200,650,1750),31)
fpv=camera('FPV_Camera',(0,0,3500),(0,2000,2000),24)
control=np.array([[-2750,-4700],[-2300,-3150],[-1650,-1750],[-1100,-690],[-760,130],[-120,1050],[1010,1880],[2020,2310],[2950,2900],[2300,4600],[500,6200]],float)
def path(t):
    s=np.clip(t,0,.999999)*(len(control)-1);i=int(s);f=s-i;p0=control[max(0,i-1)];p1=control[i];p2=control[min(len(control)-1,i+1)];p3=control[min(len(control)-1,i+2)]
    return .5*(2*p1+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f**3)
FRAMES=1561
T=np.linspace(0,1,FRAMES);XY=np.array([path(t) for t in T]);ground=height(XY[:,0],XY[:,1])
# Forward terrain envelope gives breathing room before each climbing section without 12-frame staircase steps.
safe=ground.copy()
for offset in range(-24,150):safe=np.maximum(safe,ground[np.clip(np.arange(FRAMES)+offset,0,FRAMES-1)])
alt=safe+145+480*np.exp(-T*15)+200*np.clip((T-.86)/.14,0,1)
for _ in range(3):alt=np.maximum(np.convolve(np.pad(alt,(32,32),mode='edge'),np.ones(65)/65,mode='valid'),safe+115)
for _ in range(2):alt=np.convolve(np.pad(alt,(24,24),mode='edge'),np.ones(49)/49,mode='valid')+4
P=np.column_stack([XY,alt])
curve=bpy.data.curves.new('FPV_Path_Control_Curve','CURVE');curve.dimensions='3D';spline=curve.splines.new('POLY');spline.points.add(len(P[::15])-1)
for p,co in zip(spline.points,P[::15]):p.co=(*co,1)
pathobj=obj('FPV_Path',curve,work);pathobj.hide_render=True
previous=None
for f,pos in enumerate(P):
    look=P[min(FRAMES-1,f+105)].copy() if f<FRAMES-106 else P[-1]+(P[-1]-P[-106])
    look[2]=pos[2]-np.linalg.norm(look[:2]-pos[:2])*.16
    quat=(Vector(look)-Vector(pos)).to_track_quat('-Z','Y')@Quaternion((0,0,1),.08*math.sin(T[f]*math.pi*3)*math.sin(T[f]*math.pi))
    if previous and previous.dot(quat)<0:quat.negate()
    previous=quat.copy();fpv.location=pos;fpv.rotation_quaternion=quat;fpv.keyframe_insert(data_path='location',frame=f+1);fpv.keyframe_insert(data_path='rotation_quaternion',frame=f+1)
fpv.animation_data.action.name='FPV_Flight'
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=FRAMES;scene.render.fps=30;scene.frame_set(1);scene.camera=hero;scene.unit_settings.system='METRIC'
world=bpy.data.worlds.new('Painterly_Alpine_Ambience');scene.world=world;world.use_nodes=True;n=world.node_tree.nodes;n.clear();bg=n.new('ShaderNodeBackground');bg.inputs['Color'].default_value=(*linear(hexrgb('#A1AACA')),1);bg.inputs['Strength'].default_value=.65;out=n.new('ShaderNodeOutputWorld');world.node_tree.links.new(bg.outputs[0],out.inputs[0])
ld=bpy.data.lights.new('Warm_Southwest_Sun','SUN');ld.energy=3.0;ld.color=(1,.89,.73);lo=obj('Warm_Southwest_Sun',ld,lights);lo.rotation_euler=Vector((-5000,3000,-4900)).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.view_settings.view_transform='AgX'
scene['art_direction']='European graphic novel; warm ivory snow, blue-violet shadow; no cel bands or outlines'
scene['hero_reference']='01:06-01:27';scene['design_units']='meters, artistic scale not surveyed'
name='blockout' if BLOCK else 'snow_mountain_world'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/f'{name}.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in web.all_objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'exports'/f'{name}_baseline.glb'),export_format='GLB',export_tangents=True,use_selection=True,export_cameras=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_extras=True)
report={'blender':bpy.app.version_string,'frames':FRAMES,'duration':52,'minimum_analytic_vertical_clearance_m':float(np.min(P[:,2]-ground)),'objects':len(web.all_objects),'terrain_triangles':sum(len(o.data.polygons)*2 for o in terrainobjects),'texture_sizes':sorted(set((i.size[0],i.size[1]) for i in bpy.data.images if i.name.startswith(('Hero','Midground','Background'))))}
(ROOT/'docs'/f'{name}-source.json').write_text(json.dumps(report,indent=2))
print('SCENE_READY',name,flush=True)
