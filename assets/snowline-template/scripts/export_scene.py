"""Re-export the editable Blender source, with clamped paint atlas edges."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender/snow_mountain_world.blend'))
for m in bpy.data.materials:
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE':n.extension='EXTEND'
for o in bpy.data.collections['Terrain'].objects:
    if o.type!='MESH' or not o.data.uv_layers.active:continue
    mesh=o.data;xs=[v.co.x for v in mesh.vertices];ys=[v.co.y for v in mesh.vertices];x0,x1=min(xs),max(xs);y0,y1=min(ys),max(ys)
    for loop in mesh.loops:
        v=mesh.vertices[loop.vertex_index].co;mesh.uv_layers.active.data[loop.index].uv=((v.x-x0)/(x1-x0),(v.y-y0)/(y1-y0))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/snow_mountain_world.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.collections['WEB_EXPORT'].all_objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'exports/snow_mountain_world_baseline.glb'),export_format='GLB',export_tangents=True,use_selection=True,export_cameras=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_extras=True)
