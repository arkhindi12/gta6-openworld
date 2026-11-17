# Vice Meridian
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Vice Meridian is a small 3D open-world crime game that runs in a desktop browser with no build step and no network: a seven-by-seven grid of avenues and blocks about 1.6 km across, a gulf and a beach on the west side, a marina to the south, traffic that queues behind stalled cars, a crowd that runs from gunfire, a five-star police response, and a chain of five jobs. It is written against three.js, vendored locally under `game/vendor/three/`, and every texture and every sound is generated in code — nothing is downloaded and no image or audio file ships with the game.

## What you do

You are one person on the promenade with a pistol and $240, working a job chain the HUD names for you: a bag under the causeway onramp, a pink drop-top to steal and deliver, a marina crew to clear out, a wanted level to shake before you reach a club, and finally a boat. Each job pays cash on completion, and the run is saved to `localStorage` between visits. Getting shot to death or arrested in the street doesn't end the save — you wake up on the promenade 10% poorer and the job chain carries on.

## Running the hand-in

From the repository root:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` (default `/output`) and writes `dossier.json` there with `buildDossier` from `./vendor/makefun-game.ts`. It checks its inputs before it copies anything — a missing `game/index.html`, a missing or short `screenshots/`, more than four screenshots, or one over 256 KiB all fail with a message naming the problem and a non-zero exit code. On success it prints the game file count and byte total, the screenshot names, and the dossier's size.

## Serving it locally

```
node serve.ts
```

Then open http://localhost:8080. `node serve.ts --port 9000` picks another port. The server sends only files under `game/` and does nothing else clever.

## Controls

| Input | On foot | In a car |
| --- | --- | --- |
| W A S D (or arrows) | walk, mapped to the camera's heading | throttle, brake and steer |
| Shift | run | — |
| E | take the car you are standing next to | leave the car |
| Left mouse (or J) | shoot at the pointer | shoot at the pointer |
| R | reload the pistol | reload the pistol |
| Esc or P | pause | pause |
| M | mute or unmute sound | mute or unmute sound |
| Enter | start from the title card | — |
| R or Enter on a busted / wasted / all-done card | get back out (or restart the run) | — |

The crosshair follows the mouse, and the camera leans toward wherever you are aiming so the street ahead of the gun stays in frame.

## The screenshots

`screenshots/` holds four 1280x720 JPEG renders taken from the game's own code, not mock-ups:

- `1-cover.jpg` — the cover
- `2-foot.jpg` — on foot on the avenue
- `3-chase.jpg` — the wanted level and the pursuit
- `4-driving.jpg` — behind the wheel at speed

The address bar can stage each one: `index.html?shot=cover`, `?shot=foot`, `?shot=chase`, `?shot=driving`, with an optional `&seed=N`. A staged shot builds the same seeded city, walks the simulation into pose on a script of inputs, and then holds the frame (the page sets `window.__shotReady` when it is ready to capture).

## Modules

Everything in `game/src/`, one line each:

- `main.js` — the front door: the fixed 1/60 s clock, the two canvases, the camera and its easing, WASD-to-world input mapping, the render loop, and the staged-shot entry point.
- `sim.js` — one tick that advances player, traffic, crowd, police, bullets and the job chain in a fixed order; owns the title / play / paused / busted / wasted / complete modes.
- `settings.js` — every number the world is made of: grid spacing, walk and drive speeds, the pistol's stats, crowd and traffic counts, the police caps and the whole colour palette.
- `layout.js` — the avenues, blocks, coast and districts as plain data, plus the solid-point tests that the player, crowd and bullets ask about walls.
- `random.js` — a seeded mulberry32 generator with range / int / pick / chance helpers, so a seed builds the same city twice.
- `city.js` — builds the three.js scene from the layout: merged buildings and shopfronts, neon, palms, the sea, the low sun and its shadow box, the renderer and the camera.
- `geometry.js` — a `Batch` accumulator that merges many boxes and quads into one buffer with one draw call, with metre-scaled UVs and explicit normals.
- `textures.js` — every surface texture, painted with Canvas 2D from a fixed seed and cached: asphalt, paving, sand, lawn, facades, shopfronts, neon, palms, sea ripples, sky.
- `actors.js` — the moving cast: instanced body parts for people, merged meshes for cars, contact shadows, officers and bullet streaks, all posed into pools with no per-frame allocation.
- `vehicles.js` — the car shapes (`sedan`, `coupe`, `drop`, `suv`, `cab`, `van`, `cruiser`), one merged geometry per kind and paint, and how a cruiser is dressed.
- `traffic.js` — the ambient fleet: cars holding a lane, accelerating to a cruise speed, sensing the gap in front and queueing, turning on curved paths at junctions, parked and stolen cars.
- `crowd.js` — the pedestrians: walking the pavements without entering walls, scattering from gunfire and from the sight of a body, and falling where they are shot.
- `police.js` — the wanted system: stars from 1 to 5, cruisers spawning out of view and driving at the player, officers dismounting and shooting, and the search that drains stars once you are out of sight.
- `player.js` — the body on the street and the hands on the wheel: walking with wall slide, entering and leaving cars, driving, the pistol and its reload, armour, damage, and the `localStorage` save.
- `missions.js` — the five jobs as data (`reach`, `deliver`, `clear`, `escape`, `finish` beats) and the state machine that tests and banks them.
- `input.js` — held keys and one-shot presses, the pointer in canvas pixels, and the WASD axis read.
- `hud.js` — the 2D overlay: round minimap with blips, wanted stars and search meter, wallet, health, ammo, job panel, door prompt, toasts, crosshair and the title / paused / busted / wasted / all-done cards.
- `audio.js` — synthesised WebAudio with no sound files: engine, siren, gunshots, cash and a city bed, started on the first gesture and muted with M.
- `shots.js` — the four staged pictures, placing cast and camera by avenue, heading and distance so each render is the game's own frame.

## About the bounty

This is my entry for make.fun's **"Make GTA 6"** bounty, gta6-01: [https://make.fun/bounty/gta6-01](https://make.fun/bounty/gta6-01). The game is original code written for it; three.js is vendored under `game/vendor/three/` under its own MIT licence.

## Licence

See `LICENSE`.
