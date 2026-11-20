# Basement Empire

A small model railway simulator for the browser, built with [three.js](https://threejs.org) and free low-poly models from [Polyfork](https://polyfork.dev). A basement holds a big table layout with three loops of track, a station, an engine shed, a little town, a farm, a duck pond, a walled garden and a kids' park, with people, animals, birds and butterflies going about their day. Three trains run on it, and you drive them. The whole room is seen as a tilt-shift diorama, so it reads as something small on a table.

**▶ Play it in your browser: <https://jaredevans.github.io/3dgame/>**

It runs in a desktop browser with a mouse and keyboard. Press `F` for a flying tour of the layout.

The whole game is one file, `index.html`. three.js comes from jsDelivr and every model comes from Polyfork's free CDN, so there is nothing to install or download. It needs an internet connection.

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

## Run it locally

Serve the folder with any static web server and open the page:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/> in a desktop browser. The first load downloads about 15 MB of models; the browser caches them after that.

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
