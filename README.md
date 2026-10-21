# PageScape

PageScape is an interactive multimedia prototype in which a physical pop-up book becomes an explorable 3D story world. The website uses original Blender assets rendered in the browser with Three.js.

## Local preview

From this folder, run:

```bash
python3 -m http.server 4174 --directory dist
```

Then open `http://127.0.0.1:4174`.

## Interaction

- Scroll to turn the page and reveal the pop-up landscape.
- Select **Enter the 3D world** to explore the expanded Assignment 2 Blender scene.
- Use **WASD** or the arrow keys to move, **Space** to jump and **Shift** to run; drag to orbit and scroll to zoom out across the wider valley.
- Change the atmosphere to update both lighting and the live scene title. The explorer is the keyboard-controlled player; fox, residents, birds and vehicles are animated scene elements.

## Main tools

- Blender 3.6
- Three.js
- HTML, CSS and JavaScript
- GIMP

This is the Assignment 2 production prototype for COMP5415 Multimedia Design and Authoring. The local build loads `dist/models/pagescape-assignment2-world.glb`, exported from the current Assignment 2 Blender file. The Blender source remains unchanged. To refresh that web asset, open the project from its root and run `blender --background blender/PageScape_Assignment2.blend --python web/tools/export_a2_world.py`. The character image uploader is a visual preview only; it does not rig arbitrary uploads.
