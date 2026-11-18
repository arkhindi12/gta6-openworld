# Vice Meridian

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the browser. A seven-by-seven street grid on the edge of a gulf, at
sunset: towers with lit windows and neon, palm-lined parks, a promenade, the sea. You walk it, steal
from it, get chased through it, and work five jobs across it before the light goes.

Built with three.js, no build step, and no network request at runtime. Every texture is painted in
Canvas 2D at load and every sound is synthesised — the game ships as JavaScript and one vendored
copy of three.js.

## Playing it

Serve the `game/` directory over HTTP (ES modules will not load from `file://`):

```sh
cd game && python3 -m http.server 8080
```

Then open <http://localhost:8080/> and press **Enter**.

### Controls

| Key | On foot | In a car |
| --- | --- | --- |
| **W A S D** | walk | throttle, brake, steer |
| **Shift** | run | — |
| **E** | take or leave the nearest car | take or leave the car |
| **Left mouse** | aim and fire | aim and fire out of the window |
| **R** | reload | reload |
| **Esc** / **P** | pause | pause |
| **M** | sound on/off | sound on/off |

The camera follows over the shoulder and leans into the aim, so the street ahead of the gun is
always in frame. It pulls back and widens as the car picks up speed.

### The loop

Five jobs, handed out in order. Each one is a marker in the world with a line in the HUD, a distance
and a cash reward:

1. **The Gutter Run** ($350) — reach the courier under the causeway onramp in Riviera Palms.
2. **Pink Cadence** ($600) — steal the pink drop-top on the Strip and deliver it to the Neon Heights
   lock-up.
3. **Body Count** ($900) — clear the Coral Marina crew: drop three of them inside the marker.
4. **The Long Shadow** ($1,400) — shake the VMPD, then reach the club on the Sunglass Strip.
5. **Last Tide** ($2,600) — get to the Coral Marina jetty, take the boat and do not look back.

Progress and cash are saved to `localStorage` under one key, so a reload picks the chain up where it
stopped.

Firing in the street raises the wanted level, one to five stars. Each star buys another cruiser;
cruisers arrive from out of sight, stop close enough to let their two officers out, and those
officers fire. Heat only decays once nobody has had eyes on you for a while. Get taken and you get
the arrest card and lose the run's cash; get emptied and it is the wasted card. Both put you back on
the street with the job chain intact.

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into `$MAKEFUN_OUTPUT_DIR` (default `/output`) and writes
`dossier.json` there through `buildDossier` from `./vendor/makefun-game.ts`. It is deliberately
strict: it refuses to run if `game/index.html` or `screenshots/` is missing, refuses to write a
dossier when there are no screenshots, more than four, or one over 256 KiB (naming the file and its
size), and exits non-zero on every failure. On success it prints the game file count and total
bytes, the screenshot names, and the dossier's own size.

Node 22, standard library only. Runs as `node main.ts`.

## The modules

`game/src/`, one job per file.

| Module | What it does |
| --- | --- |
| `config.js` | Every number and colour the city is built from: grid pitch, gait, driving, gun, the law, the sun. |
| `seed.js` | A seeded random source, so `?seed=7` builds the same town twice. |
| `angles.js` | Angle folding, frame-rate-independent turn rates, exponential smoothing. |
| `plan.js` | The city as records: which blocks are towers or parks, where every building stands, whether a point is walkable or in the sea. |
| `surface.js` | A geometry accumulator — many flat faces into one buffer, one draw call. |
| `surfaces.js` | Every texture, painted in Canvas 2D and cached: tarmac, windows, neon, sand, sea. |
| `carKit.js` | The shapes of the seven car kinds and the cruiser livery, merged per paint. |
| `world.js` | The renderer, camera, light, sky, sea and the static city, built from the plan. |
| `actors.js` | Poses the cast: instanced people for the crowd and officers, merged car bodies for the fleet, bullet streaks. |
| `traffic.js` | Ambient driving: lanes, cruising, turning at junctions, braking for the car ahead. |
| `crowd.js` | Pedestrians on the pavements, their walk cycle, and panic at gunfire. |
| `police.js` | The wanted level, cruiser spawning, dismounting crews, officers firing, heat decay. |
| `player.js` | The body on the street, the hands on the wheel, and the pistol. |
| `missions.js` | The five jobs as data, and the state machine that advances them. |
| `save.js` | The run remembered in one `localStorage` key. |
| `hud.js` | The whole overlay: compass minimap, money, health, ammo, stars, objective, titles and cards. |
| `audio.js` | Synthesised sound: engine, siren, gunfire, tyres, the city's hum. |
| `input.js` | Held keys, one-shot presses, pointer state. |
| `sim.js` | The world as one state machine and the fixed-step `tick` that advances all of it. |
| `shots.js` | The four staged photographs, driven by `?shot=`. |
| `main.js` | The fixed clock, the camera, input mapping, the two canvases and the render loop. |

## Screenshots

Rendered from the game itself in headless Chromium, driving the `?shot=` scenes:

- `screenshots/1-cover.jpg` — the start screen over the skyline, from out on the gulf
- `screenshots/2-foot.jpg` — on foot on the west pavement, downtown
- `screenshots/3-chase.jpg` — three stars, two cruisers, crews out and firing
- `screenshots/4-driving.jpg` — a stolen drop-top on the boulevard

##

Made for make.fun's **"Make GTA 6"** bounty — <https://make.fun/bounty/gta6-01>.