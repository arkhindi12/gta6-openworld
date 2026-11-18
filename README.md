# Vice Meridian

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game that runs in a browser tab. You are dropped on a promenade on the edge of
a gulf at sunset, in a city laid out on a seven-by-seven street grid: glass towers with lit windows
and neon boards, palm-lined parks, a beach and a marina. You can walk it, run it, steal any car on
it, shoot your way out of it, and work five jobs across it before the light goes.

Three.js, one vendored copy of it, no build step, and not a single network request at runtime. Every
texture is painted into a Canvas 2D surface at load and every sound is synthesised through WebAudio,
so the whole game is JavaScript and a static server.

## What you do

Five jobs are handed out in order, each one a marker in the world with a line in the HUD, a live
condition and a cash reward:

1. **The Gutter Run** ($350) — reach the courier under the causeway onramp in Riviera Palms.
2. **Pink Cadence** ($600) — steal the pink drop-top on the Strip and deliver it to the Neon Heights
   lock-up.
3. **Body Count** ($900) — clear the Coral Marina crew: drop three of them inside the marker.
4. **The Long Shadow** ($1,400) — shake the VMPD, then reach the club on the Sunglass Strip.
5. **Last Tide** ($2,600) — get to the marina jetty and do not look back.

Cash and the job chain are written to `localStorage` after every job and after an arrest, so a
reload picks the career up where it stopped.

Firing in the street raises the wanted level, one to five stars. Each star puts another cruiser on
the road; cruisers arrive from out of sight, brake near you, and let two officers out, and those
officers shoot. Heat only cools once nobody has had eyes on you for a while. Get taken at gunpoint
and the arrest card comes up and the run's cash is cut; get emptied and it is the wasted card. Both
put you back on the promenade with the chain intact.

## Controls

| Key | On foot | In a car |
| --- | --- | --- |
| **W A S D** | walk | throttle, brake, steer |
| **Shift** | run | — |
| **E** | take or leave the nearest car | get out |
| **Left mouse** | aim and fire | fire out of the window |
| **R** | reload | reload |
| **Esc** / **P** | pause | pause |
| **M** | sound on/off | sound on/off |

The camera sits over the shoulder and leans along the aim, so the street the gun points down is
always in frame; in a car it pulls back, rises and widens as the speed climbs.

## Running it locally

ES modules will not load from `file://`, so serve the `game/` directory over HTTP. The repository
ships a two-hundred-line static server for exactly this:

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Then open <http://localhost:8080/> and press **Enter**. Any static server works the same way
(`python3 -m http.server 8080` from inside `game/`, for instance) — there is nothing to compile and
nothing to install.

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into `$MAKEFUN_OUTPUT_DIR` (default `/output`) and writes
`dossier.json` there with `buildDossier` from `./vendor/makefun-game.ts`, under the bounty's caps.
It is deliberately strict: it checks that `game/index.html` and `screenshots/` exist before copying
anything, refuses to write a dossier when there are no screenshots, more than four, or one over
256 KiB (naming the file and its size), prints the game's file count and total bytes, the screenshot
names and the dossier's own size, and exits non-zero on every failure. The dossier is built from the
staged copy, not the source tree, so the numbers it carries describe the files beside it.

Node 22, standard library only, run as `node main.ts`.

## The modules

Everything lives in `game/src/`, one job per file.

| Module | What it does |
| --- | --- |
| `scale.js` | Every measurement and colour the city is built from: grid pitch, gait, driving, gun, the law, the sun. |
| `random.js` | One seeded random stream, so `?seed=7` builds the same town twice. |
| `mathKit.js` | Angle folding, frame-rate-independent turn rates, exponential smoothing, quadratic curves. |
| `cityPlan.js` | The town as records: which blocks are towers or parks, where each building stands, whether a point is walkable or in the sea. |
| `batch.js` | A geometry accumulator: many flat faces into one buffer, one draw call. |
| `textures.js` | Every texture, painted in Canvas 2D and cached — tarmac, pavements, windows, neon, sand, sea, sky, sun. |
| `vehicle.js` | The seven car shapes and the cruiser livery, merged per paint; the roof bar and its sprites. |
| `world.js` | The renderer, camera, light, sky, sea and the static city, built once from the plan. |
| `cast.js` | Poses the moving cast: instanced bodies for the crowd and officers, merged cars for the fleet, rounds and flashes. |
| `traffic.js` | Ambient driving: lanes, cruising, turning at junctions, braking for whatever is ahead. |
| `crowd.js` | Pedestrians on the pavements, their walk cycle, panic at gunfire, and falling when hit. |
| `officers.js` | The wanted level, cruiser spawning, dismounting crews, officers firing, heat decay, the arrest test. |
| `player.js` | The body on the street, the hands on the wheel, the pistol, the rounds it fires and the health they cost. |
| `jobs.js` | The five jobs as data and the state machine that advances them. |
| `save.js` | The run remembered in one `localStorage` key, clamped on the way back in. |
| `hud.js` | The whole overlay: compass minimap, money, health, ammo, stars, objective, the street marker and the cards. |
| `sound.js` | Synthesised sound: engine, siren, gunfire, tyres, footsteps and the city's hum. |
| `input.js` | Held keys, one-shot presses and pointer state. |
| `sim.js` | The world as one state machine and the fixed-step `tick` that advances all of it. |
| `scenes.js` | The four staged photographs, driven by `?shot=`. |
| `main.js` | The fixed clock, the camera, input mapping, the two canvases and the render loop. |

## Screenshots

All four are rendered from this game in headless Chromium, driving the `?shot=` scenes:

- `screenshots/1-cover.jpg` — the start screen over the city, the sun on the horizon
- `screenshots/2-foot.jpg` — on foot on the west pavement, downtown
- `screenshots/3-chase.jpg` — three stars, two cruisers, crews out and firing
- `screenshots/4-driving.jpg` — a stolen drop-top flat out on the boulevard

##

Made for make.fun's **"Make GTA 6"** bounty — <https://make.fun/bounty/gta6-01>.
