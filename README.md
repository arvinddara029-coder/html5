# APEX — Endless Horizons

A playable Three.js endless highway racing game, rebuilt from the repository's previous 2D prototype. Real imported GLB cars and environment assets, locally bundled audio, reflective car paint, curved roads, and responsive desktop/touch controls.

## Run locally

Requires Node.js 22.12+ (Vite 8).

```sh
npm ci
npm run dev
```

Open the address printed by Vite. The server binds to `0.0.0.0` and accepts the Arena preview host. All runtime models, fonts, decoder files, and audio are local; there are no third-party asset requests while playing.

```sh
npm run build     # production files in dist/
npm run preview   # preview a production build
```

Deploy `dist/` to a static host with WebAssembly support. WebGL2 / hardware acceleration is required. If the device struggles, select **Settings → Graphics → Performance**.

## Driving

| Input | Action |
| --- | --- |
| A / D or ← / → | Steer |
| W or ↑ | Accelerate |
| S / ↓ / Space | Brake |
| Shift | Nitro (regenerates while inactive) |
| C | Chase / hood / high camera |
| P / Esc | Pause / resume |
| M | Mute / unmute |

Touch controls appear on mobile/coarse-pointer devices. Auto-cruise is enabled by default and accelerates toward 125 km/h; disable it in Settings for manual throttle. Audio starts only after a Start Engine gesture, as required by browsers. Tab loss automatically pauses the race and clears held controls.

## Features

- **Three environments:** Alpine Pass, Desert Run, Midnight City. Thumbnails are actual render captures, not promotional images.
- **Endless road:** curved, recycled road segments with imported road tiles, guardrails, trees, skyline, terrain and signs. Endless routes are procedurally assembled—not imported pre-made geographic maps.
- **Traffic:** imported sedan, SUV and truck models, slower same-direction vehicles and oncoming traffic, three density settings, collision damage, near-miss rewards and roadside barriers.
- **Roadwork hazards:** imported cones, lane closures, advance warnings and traffic avoidance. Hazards become more frequent with distance.
- **Modes:** endless distance runs and 90-second time attack; near misses add three seconds in time attack.
- **Garage:** three distinct handling/acceleration profiles and six paint colors. The X Trail receives less collision damage.
- **Progress:** three achievements, milestone bonuses, local best score/distance, and the last 20 run records.
- **Audio:** an imported engine recording with speed-dependent pitch, imported crash/boost effects, synthesized wind and UI feedback. Volume and mute controls.
- **Presentation:** metallic materials, local HDR reflections, real-time shadows, atmospheric fog, night headlights, three cameras, nitro camera feedback and a race HUD.

Records/settings are saved in browser localStorage. No backend, multiplayer, accounts, or global leaderboard is claimed. Imported assets are stylized; this is a browser arcade racer, not a photorealistic driving simulator.

## Verification

With the development server running on port 5173:

```sh
npm test
npm run test:visual
```

The smoke test launches Chromium, checks asset loading, route/car/paint/settings interactions, real keyboard steering/throttle, boost/braking, pause/resume, collision/game over, time attack, local records and mobile overflow. Software WebGL is used in the sandbox. After the initial rendering check, the smoke test disables GPU draws to run deterministic simulation checks quickly. The separate visual test captures the actual rendered desktop, mobile, and gameplay scenes.

Set `TEST_URL` to another running preview ending in `?test=1` if needed. The opt-in `?test=1` debug interface is absent in normal play. `CHROME_PATH` can select another installed Chromium. The npm-distributed test browser is a dev dependency and is not bundled into the game.

## Structure

- `src/main.js` — menus, input, persistence, game states, collision/scoring and challenges
- `src/world.js` — asset loading, 3D environments, batched scene geometry, vehicles and cameras
- `src/audio.js` — imported samples and Web Audio mixing
- `src/style.css` — responsive lobby, garage, dialogs, touch controls and racing HUD
- `public/models/`, `public/textures/`, `public/audio/` — locally bundled imported assets
- `public/ASSET_CREDITS.md` — source links and licensing notes
- `scripts/` — reproducible browser smoke and visual tests

See [asset credits](public/ASSET_CREDITS.md). Source assets retain their own licenses and attribution. Ferrari names/emblems identify the depicted model; there is no affiliation with the vehicle manufacturer. Review the original model's terms before any separate commercial redistribution.
