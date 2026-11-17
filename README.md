# Vice Meridian

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/arkhindi12/gta6-openworld/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the browser, built by an AI agent for
[make.fun](https://make.fun)'s **Make GTA 6** bounty ($1,666 in USDC).

Sun-soaked gulf-side city, three.js, no build step, no network requests: every script,
texture and sound the game loads is a file under `game/`.

## Play it

Serve `game/` with any static file server and open `index.html` in desktop Chrome:

```
node serve.ts          # http://localhost:8080
```

Or serve the folder directly:

```
python3 -m http.server 8080 --directory game
```

## What is in it

- **The city** — a 2.4 km street grid: asphalt with lane markings, kerbs and crossings,
  blocks of towers with lit windows and neon signs, palm-lined parks, a promenade and the sea.
- **On foot** — WASD to walk, Shift to run, a third-person camera that follows and leads
  in the aim direction.
- **Driving** — E to take or leave the nearest car. Traffic drives the lanes, turns at
  junctions and brakes for the car ahead; any of it can be stolen.
- **Crowds** — pedestrians walk the kerbs, scatter at gunfire and go down when hit.
- **The police** — a five-star wanted level. Cruisers spawn out of sight and close in,
  officers dismount and fire, the heat cools when you stay unseen, and they will bust you.
- **Missions** — five jobs with markers in the world, an objective line, cash rewards and
  saved progress.
- **HUD** — compass minimap with the roads, buildings, the player, police and the mission
  blip; money, health, ammo, wanted stars and the distance to the objective.

## Hand it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and writes
`dossier.json` with the vendored `vendor/makefun-game.ts` library.

## Layout

```
game/index.html        the page: one canvas, one module script
game/src/              the game's own source, one module per job
  main.js              boot, the frame loop, camera, input wiring
  city.js              the street grid and building blocks
  world.js             the three.js scene: ground, road paint, buildings, parks, sea
  mesh.js              batched geometry helpers
  vehicles.js          car bodies and liveries
  cast.js              the people and cars the renderer poses each frame
  traffic.js           lane driving, turning, braking
  crowd.js             pedestrians and panic
  police.js            wanted level, pursuit, officers, arrest
  player.js            walking, driving, shooting, health
  missions.js          the five jobs and their markers
  hud.js               minimap and the whole HUD
  shots.js             the staged scenes behind ?shot=cover|foot|chase|driving
  paint.js             canvas-drawn textures
  audio.js             the WebAudio graph
  tuning.js            every tunable number
  rng.js               the seeded generator
  input.js             keys, mouse, presses
game/vendor/three/     three.js, vendored
screenshots/           four real renders of the game
```

## Screenshots

Four real renders of the game's own code, taken headless at 1280x720:
`1-cover.jpg` (start screen over the skyline), `2-foot.jpg` (on foot downtown),
`3-chase.jpg` (a three-star police chase) and `4-driving.jpg` (a stolen drop-top on the
boulevard).

## Licence

MIT — see `LICENSE`.
