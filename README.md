# Basement Empire

A small model railway simulator for the browser, built with [three.js](https://threejs.org) and free low-poly models from [Polyfork](https://polyfork.dev). A basement holds a big table layout with three loops of track, a station, an engine shed, a little town, a farm, a duck pond, a walled garden and a kids' park, with people, animals, birds and butterflies going about their day. Three trains run on it, and you drive them. The whole room is seen as a tilt-shift diorama, so it reads as something small on a table.

**▶ Play it in your browser: <https://jaredevans.github.io/3dgame/>**

It runs in a desktop browser with a mouse and keyboard. Press `F` for a flying tour of the layout.

The basement is one file, `index.html`. three.js comes from jsDelivr and every model comes from Polyfork's free CDN, so there is nothing to install or download. It needs an internet connection.

The **Scenic Tour** (the "Scenic Tour ▸" button) is a second way to play, in `tour.html` and `tour/`. It needs Polyfork kit files that are self-hosted rather than committed: see [Scenic Tour](#scenic-tour) below.

What the game is and the decisions behind it are in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).

## Controls

| Input | Action |
|---|---|
| `1` `2` `3`, or click a train | Pick a train |
| `W` / `S` or `↑` / `↓` | Throttle up / down (below zero is reverse) |
| `Space` | Stop the picked train |
| `H` | Whistle or horn |
| `C` | Ride along with the picked train (again, or `Esc`, to step back) |
| `F` | Flying tour round the layout (again, `Esc`, or grabbing the view to stop) |
| `T` | Miniature blur on/off (it softens the room, never the table) |
| Drag / scroll | Orbit / zoom (right-drag pans) |

Each train also has a card at the bottom of the screen with a throttle slider and Stop, Whistle and Ride buttons.

## Scenic Tour

Drive a full-size train through a big open world, get out at the stations and walk round. The design is in [`docs/superpowers/specs/2026-11-20-scenic-tour-design.md`](docs/superpowers/specs/2026-11-20-scenic-tour-design.md). It is being built in phases; **phase 1** is one leg: the Seaside Excursion (a blue diesel and three coaches) from Downtown City along the cliff tops to Oceanside and back, with the cab and drone views, walking at both ends and a morning sky.

| Input | Action |
|---|---|
| `W` / `S` or `↑` / `↓` | Throttle up / down (below zero is reverse) |
| `Space` (hold) | Brake |
| `H` | Horn |
| `V`, `1`, `2` | Change view, cab, drone (drag to look or orbit, scroll to zoom the drone) |
| `E` | Get out when stopped at a platform; board a train when you're next to it |
| `WASD`, `Shift`, drag | On foot: walk, run, look |

### The kit files

The tour builds its places with Polyfork kits' own `kit.mjs` (`buildKit`), which Polyfork serves only from its Pro CDN or from a kit's download, so the kits are hosted by us and **never committed to this repo** (`kits/` is gitignored). It uses seven kits, each unzipped into its own folder named by its id:

`nyc-city-kit-fbca88`, `coast-and-boardwalk-d883fd`, `alpine-and-snow-092f66`, `frontier-town-a0085b`, `chrome-arcology-transit-kit-87a0e1`, `countryside-railway-9b4c57`, `nature-forest-kit-f29d6a`

Locally they live in `kits/<id>/`. In production, serve the same folders from any web server and point the tour at it with `?kits=`:

```
https://<your-site>/tour.html?kits=https://<kit-server>/kits/
```

If the kit server is on a different origin from the page, it must send CORS headers (`Access-Control-Allow-Origin`) or the browser refuses the modules. If a kit file can't be loaded, the loading screen names the file.

### Developer aids

`node --test tour/test/` runs the unit tests (Node 20+, nothing to install). `?free=<metres>` opens an orbit camera at that distance along the leg; `?debug` adds `__tour.snap(position, target)` for stills from any viewpoint.

## Run it locally

Serve the folder with any static web server and open the page:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/> in a desktop browser. The first load downloads about 15 MB of models; the browser caches them after that. For the tour, open <http://127.0.0.1:8765/tour.html> with the kits in `kits/`.

## Publish on GitHub Pages

1. Push the repo to GitHub.
2. In the repo, go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
3. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

Every push to `main` republishes it. No build step is needed.

## Troubleshooting

- **The loading screen says "Could not load: …":** a file from a CDN didn't arrive. The message names it. Check the internet connection and reload. If a Polyfork model name in the message ends without a six-character id (for example `…/cdn/lineside-tree.mjs`), that part is missing from the `IDS` map near the top of the script.
- **Changes to the code don't show up:** the browser cached the old page. Do a hard reload (`Cmd+Shift+R` on macOS, `Ctrl+Shift+R` elsewhere).

## Changing the game

Everything is in the `<script type="module">` inside `index.html`:

- The tunable numbers (scale, table and room size, top speed, acceleration, tilt-shift strength) are at the top.
- `IDS` maps each part's kit name to its Polyfork asset id. To use another Polyfork model, add its id there, or pass the id straight to `part()`.
- `TRAINS` lists each train's vehicles and their colours. The part options (liveries, loads, lengths) are listed on each model's Polyfork page.
- `scenery()` places the buildings, trees, signals and standing people on the layout. The "life on the layout" block adds the farm, the pond and everything that moves: `wander()` for animals, `flier()` for birds, `stroller()` for walking people. The block after "the basement" furnishes the room.

## Credits and licence of the assets

All 3D models and the `stage.mjs` and `clips.mjs` helpers are from [Polyfork](https://polyfork.dev) and are loaded from its CDN under its licence (<https://polyfork.dev/licensing>); none of them are copied into this repo. The models come from three of its kits: Countryside Railway, Open Plan and Neighborhood Pathways. three.js is MIT licensed.
