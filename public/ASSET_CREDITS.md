# APEX — Asset credits and sources

All listed runtime assets were downloaded from online sources and are bundled locally. Routes, collision geometry, terrain, lane markings, guardrails, roadwork boards, signs, and the city lighting composition are assembled by this game. The endless route is not an imported real-world map. Map-selection thumbnails are captured from the Three.js scene.

## Cars

### GT model — Ferrari 458 Italia

- Creator credited upstream: **vicent091036**.
- Imported file: `models/gt.glb`.
- Download source: https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/ferrari.glb
- Upstream blob: `435197c5f9b56e08c114505ee019dedbc3d033a3`.
- Upstream example / attribution: https://threejs.org/examples/webgl_materials_car.html
- Original model page: https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6
- The original Sketchfab page was disabled when checked. The model is distributed by the Three.js examples; the upstream repository's MIT license is included as `models/THREE-LICENSE.txt`. This is not a claim that the vehicle trademark or every original model right is covered by that repository license. Review the original model terms before separate commercial redistribution.
- APEX adapts scale and materials. Ferrari branding identifies the depicted car; this project is not affiliated with Ferrari.

### Traffic and garage vehicles — Kenney Car Kit

- Creator: **Kenney**.
- License: **CC0 1.0**.
- Asset page: https://kenney.nl/assets/car-kit
- Imported files: `suv.glb`, `sedan.glb`, `truck.glb`, `race.glb`.
- Download mirror: https://github.com/kidscancode/3d_car_sphere/tree/master/assets/kenney_car_kit
- Roadwork cone and palette: https://github.com/AkiraNim/CLTCrossing/tree/main/CltCrossingv2/assets/kenney_car-kit
- Cone files: `models/props/cone.glb`, `models/props/Textures/colormap.png`.

## Environment

### Road and building — Kenney City Kit

- Creator: **Kenney**.
- License: **CC0 1.0**.
- Asset pages: https://kenney.nl/assets/city-kit-roads and https://kenney.nl/assets/city-kit-suburban
- Official example repository / download source: https://github.com/KenneyNL/Starter-Kit-City-Builder/tree/main/models
- Imported files: `road-straight.glb` → `models/city/road.glb`, `building-small-a.glb` → `models/city/building.glb`, `Textures/colormap.png`.
- Roads are extended with generated asphalt, lane markings and guardrails; imported buildings are composed with additional skyline geometry.

### Pine tree — Kenney Nature Kit

- Creator: **Kenney**.
- License: **CC0 1.0**.
- Asset page: https://kenney.nl/assets/nature-kit
- Download mirror: https://github.com/BastiaanOlij/godot-vr-weapons/tree/master/assets/kenney.nl/naturekit/Models/GLTF%20format
- Imported file: `tree_pineTallA.glb` → `models/nature/pine-tall.glb`.
- Materials are adapted to the environment and the geometry is instanced for performance.

### Reflection environment — Venice Sunset

- Creator/source: **Poly Haven**.
- License: **CC0 1.0**.
- Asset page: https://polyhaven.com/a/venice_sunset
- Download mirror: https://github.com/mrdoob/three.js/blob/dev/examples/textures/equirectangular/venice_sunset_1k.hdr
- Imported file: `textures/venice_sunset_1k.hdr`.
- Used for material reflections, not as a geographic map.

## Sound

### Racing engine loop

- Creator: **domasx2**.
- License: **CC0 1.0** (the author's description/comments state the loops were remade using a public-domain sample).
- Asset page: https://opengameart.org/content/racing-car-engine-sound-loops
- Original file: https://opengameart.org/sites/default/files/loop_0.wav
- Download mirror: https://github.com/DwoaC/RickNRollRacing/tree/main/assets/sound/engines
- Imported file: `loop_0.wav` → `audio/engine.wav`.
- Playback pitch and gain vary with driving speed.

### Impact and nitro

- Creator: **Kenney**.
- License: **CC0 1.0**.
- Asset pages: https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/sci-fi-sounds
- Impact source: https://github.com/drwhut/tabletop-club/blob/master/game/Sounds/MetalHeavy/impactMetal_heavy_000.ogg
- Nitro source: https://github.com/blal1/neon-protocol/blob/main/audio/sfx/combat/forceField_000.ogg
- Imported files: `audio/impact.ogg`, `audio/nitro.ogg`.
- Additional wind noise, countdown, near-miss and UI tones are synthesized locally using Web Audio. Not all audio is a downloaded recording.

## Software, icons and fonts

- **Three.js** — MIT, https://threejs.org/. License included in `models/THREE-LICENSE.txt`.
- **Draco decoder** — Google, Apache 2.0. Distributed with Three.js; see `draco/DRACO-LICENSE.txt`.
- **Lucide** — ISC, https://lucide.dev/. Installed via npm.
- **Inter** — SIL Open Font License 1.1, https://rsms.me/inter/.
- **Barlow Condensed** — SIL Open Font License 1.1, https://tribby.com/fonts/barlow/.
- Fonts are bundled using Fontsource. License texts are included under `licenses/`.

CC0 details: https://creativecommons.org/publicdomain/zero/1.0/

No attribution to Kenney is legally required for CC0 assets, but it is gratefully retained here. Asset authors retain any rights not granted by their respective licenses. Online source links may move independently of the locally bundled game.
