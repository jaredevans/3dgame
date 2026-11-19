# Candy Dash — project brief

You're a kid in a caped hero costume, out trick-or-treating at dusk. Run through the neighbourhood and collect candy from every front door before the timer runs out, while a ghost drifts after you.

Every line under "Decisions" answers a question a developer would otherwise have to stop and ask. They are proposed defaults: change any of them before development starts.

## Decisions

**Platform and view**
- Desktop browser only, keyboard only. No mobile or touch, no gamepad.
- Controls: WASD or arrow keys to move, Shift to run. No jump, no mouse.
- Camera: third-person, behind and above the player, following automatically.

**The place**
- The Polyfork Neighborhood Pathways kit, built whole with its own layout and ground (about 80 x 90 m), with its trees set to autumn. Exact sources are under "Assets and where to get them".
- Halloween models from the Polyfork Halloween Night kit are added on top, one by one: jack-o'-lanterns at every candy door, plus gravestones, a giant skeleton and spiders on open lawn.
- Lit as dusk using the kit's own lighting (`stage.mjs`), so windows and lamps glow. No ACES tone mapping.
- Buildings, fences and vehicles block the player.
- The few residents and children already standing in the kit stay as decoration; the player walks through them.

**Player**
- The Kid in a Caped Hero Costume, with walk and run animation.
- Starts at a clear spot near the central crossroads.

**Candy points**
- One Neighbour Handing Out Candy stands a few metres in front of each house's front door. Door positions are read at load time from the door part of each house model (8 houses in this kit).
- Coming within 2 m collects that door's candy once. The neighbour's marker then goes dark.
- A glowing marker floats over each door still to visit, so the next target is visible from the street.

**Ghost**
- One Mist-Bound Sea Ghost (loaded separately; it is not part of the kit). It floats and bobs.
- It moves straight toward the player and passes through walls. No pathfinding.
- It starts on the far side of the map, slower than the player's walk, and speeds up as time passes.
- A touch costs one of 3 hearts and sends the ghost back to the far side.

**Winning and losing**
- Win: all doors collected before the timer hits zero.
- Lose: the timer runs out, or all 3 hearts are gone.
- Starting values, to be tuned by playing: 90 second timer, walk 3 m/s, run 6 m/s, ghost 2 m/s rising to 5 m/s.

**Screens and sound**
- Start screen with the title, the controls and a "press Enter" prompt.
- HUD: time left, candy collected out of total, hearts.
- End screen: win or lose, time taken, "press Enter to play again".
- No sound in this version.

**How it's built and run**
- three.js (version 0.180.0) with plain JavaScript modules. No framework, no build step, no backend.
- All 3D models come from Polyfork (https://polyfork.dev), a library of free low-poly models for three.js.
- Runs from a local static web server (it will not open straight from the file system), for example `python3 -m http.server 8765 --bind 127.0.0.1`.
- three.js, the kit, the models and the animation clips are all stored locally, so the game runs without internet during the demo.

## Assets and where to get them

Nothing below is committed to the repo, so a rebuild has to fetch all of it. Folder names are the ones the game code expects.

**three.js 0.180.0 → `vendor/three/`**
- Source: the npm package, https://registry.npmjs.org/three/-/three-0.180.0.tgz
- Keep `build/three.module.js`, `build/three.core.js` and `examples/jsm/`.
- The page needs an import map: `three` → `./vendor/three/build/three.module.js`, and `three/addons/` → `./vendor/three/examples/jsm/`. Every Polyfork model module imports from both.

**Neighborhood Pathways kit → `kit/`**
- Kit id: `neighborhood-pathways-kit-a992cf`. Page: https://polyfork.dev/kit/neighborhood-pathways-kit-a992cf
- Download: one zip, `https://polyfork.dev/dl/kit-neighborhood-pathways-kit-a992cf.zip`. It needs a free Polyfork account. With the Polyfork MCP server connected, call `get_kit` with the kit id: the reply contains a ready-to-run `curl` command with a signed link that lasts 15 minutes.
- The zip holds every part, `LAYOUT.json` (where each part stands), the ground, and three helper modules: `kit.mjs` (`buildKit` builds the whole place with collision data), `stage.mjs` (lighting) and `clips.mjs` (character animation). `API.md` in the zip documents all three in one paragraph.

**Individual Polyfork models → `halloween/` and `models/`**
- Each is a free download with no account, at `https://polyfork.dev/cdn/<id>.mjs` (a three.js module exporting `createAsset`) or `https://polyfork.dev/cdn/<id>.glb`.

| Model | Polyfork id | Used as | File |
|---|---|---|---|
| Kid in a Caped Hero Costume | `kid-in-a-caped-663f11` | the player | `.mjs` |
| Neighbour Handing Out Candy | `neighbour-handing-out-candy-2c1159` | candy points | `.mjs` |
| Jack-o'-Lantern | `jack-o-lantern-0b1ddb` | door and lawn decoration | `.mjs` |
| Foam Yard Gravestone | `foam-yard-gravestone-d64ffc` | lawn decoration | `.mjs` |
| Giant Yard Skeleton | `giant-yard-skeleton-770f04` | lawn decoration | `.mjs` |
| Giant Yard Spider | `giant-yard-spider-70ddce` | lawn decoration | `.mjs` |
| Mist-Bound Sea Ghost | `sea-ghost-base` | the ghost | `.glb`, saved as `models/sea-ghost.glb` |

**Animation clips → `kit/clips/`**
- `https://polyfork.dev/cdn/anim-idle.json`, `anim-walk.json` and `anim-run.json`.
- `clips.mjs` fetches clips from polyfork.dev by default. To run offline, pass `base: './kit/clips/'` to `animate()`, and change the `CDN` constant in `kit/_internal/clips.mjs` to the local folder so the kit's own people use it too.

**Why not the Halloween Night kit as the place**
- The original plan was to build on the Halloween Night kit (`halloween-night-46ade4`). On 2026-11-18 its zip returned "404, this file does not exist for this kit", even with a fresh signed link, while other kits' zips downloaded normally.
- Halloween Night is an expansion of Neighborhood Pathways (same streets and houses), so the game uses that kit and adds the Halloween models individually.
- If the Halloween Night zip works on a later rebuild, it can replace `kit/` and give the full Halloween dressing; the candy doors would then need re-checking.

## Out of scope

Multiplayer, mobile, sound and music, saved high scores, multiple levels, difficulty settings, more than one ghost.

## Done when

- The neighbourhood loads at dusk and the player can run around it without passing through buildings.
- Every candy door gives candy exactly once and the HUD counts it.
- The ghost chases, costs a heart on touch, and resets.
- Both ways of losing and the one way of winning reach the end screen, and Enter restarts a fresh game.

## What is in git

Only the game's own files: this brief, `index.html` and `src/`. The downloaded assets (`kit/`, `vendor/`, `halloween/` and `models/`, about 47 MB) are listed in `.gitignore` and are fetched again on each machine as "Assets and where to get them" describes.
