"""Export the current Assignment 2 Blender scene for the local Three.js site.

Run from Blender 3.6 with the project file as the active blend file:
  blender --background blender/PageScape_Assignment2.blend --python web/tools/export_a2_world.py

The source blend is read-only. The GLB is written into web/dist/models.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "models" / "pagescape-assignment2-world.glb"
EXCLUDED_COLLECTIONS = {"WGTS_rig", "WEB_EXPORT_GUIDES", "COLLIDERS", "LIGHTING_AND_CAMERA"}


scene = bpy.context.scene
selected = []
for obj in scene.objects:
    if any(collection.name in EXCLUDED_COLLECTIONS for collection in obj.users_collection):
        continue
    if obj.type in {"CAMERA", "LIGHT"}:
        continue
    # Blender support controls are not artwork and need not ship to the browser.
    if obj.name.startswith(("cgt_", "COLLIDER_")):
        continue
    selected.append(obj)

if not any(obj.name == "Player_Root" for obj in selected):
    raise RuntimeError("Player_Root is missing from the web export selection.")
if not any(obj.name == "Terrain_Outer_Visual" for obj in selected):
    print("WARNING: Terrain_Outer_Visual was not selected; the web game will fall back to model bounds.")

bpy.ops.object.select_all(action="DESELECT")
for obj in selected:
    obj.select_set(True)
bpy.context.view_layer.objects.active = next((obj for obj in selected if obj.name == "Player_Root"), selected[0])

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_frame_range=False,
    export_frame_step=1,
    export_force_sampling=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_materials="EXPORT",
    export_texcoords=True,
    export_normals=True,
    export_colors=True,
)
print(f"A2 web GLB exported: {OUTPUT} ({len(selected)} scene objects selected)")
