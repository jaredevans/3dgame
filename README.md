# Candy Dash

A small 3D browser game built with [three.js](https://threejs.org) and free low-poly models from [Polyfork](https://polyfork.dev). You're a kid in a caped hero costume, out trick-or-treating at dusk: collect candy from all 8 front doors before the 90-second timer runs out, while a ghost drifts after you.

The game was built by an AI coding agent from [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) as a classroom demo of writing a detailed brief before development starts.

## Controls

| Key | Action |
|---|---|
| `W` / `S` or `↑` / `↓` | Walk forward / back |
| `A` / `D` or `←` / `→` | Turn left / right |
| `Shift` | Run |
| `Enter` | Start, or play again |

Walk up to a neighbour (under the pink marker) to collect their candy. The ghost passes through walls; each touch costs one of your 3 hearts.

## Setup

The repo holds only the game's own code. three.js and the 3D models (about 55 MB) are downloaded once into four folders that git ignores. You need `curl`, `tar`, `unzip` and Python 3, and a free Polyfork account for step 2.

Run every command from the repo root.

### 1. three.js

```sh
mkdir -p vendor/three
curl -sL https://registry.npmjs.org/three/-/three-0.180.0.tgz \
  | tar -xz --strip-components=1 -C vendor/three \
      package/build/three.module.js package/build/three.core.js package/examples/jsm
```

### 2. The neighbourhood kit

The streets, houses and ground come from Polyfork's Neighborhood Pathways kit, which downloads as one zip and needs a free Polyfork account. Get `kit.zip` one of these ways:

- **With an AI agent that has the Polyfork MCP server connected:** ask it to call `get_kit` for `neighborhood-pathways-kit-a992cf`. The reply contains a `curl` command with a signed link that lasts 15 minutes. This is how the kit was downloaded for this project.
- **With a Polyfork API key:** Polyfork's documentation says the zip at `https://polyfork.dev/dl/kit-neighborhood-pathways-kit-a992cf.zip` accepts a free account's key as a Bearer token. This route has not been tested for this project.

Then unpack it into `kit/`:

```sh
unzip -q -o kit.zip -d kit && rm kit.zip
```

### 3. Characters, decorations and the ghost

These are free downloads that need no account.

```sh
mkdir -p halloween models
for id in kid-in-a-caped-663f11 neighbour-handing-out-candy-2c1159 jack-o-lantern-0b1ddb \
          foam-yard-gravestone-d64ffc giant-yard-skeleton-770f04 giant-yard-spider-70ddce; do
  curl -sfL -o "halloween/$id.mjs" "https://polyfork.dev/cdn/$id.mjs"
done
curl -sfL -o models/sea-ghost.glb https://polyfork.dev/cdn/sea-ghost-base.glb
```

### 4. Animation clips

```sh
mkdir -p kit/clips
for c in idle walk run; do
  curl -sfL -o "kit/clips/anim-$c.json" "https://polyfork.dev/cdn/anim-$c.json"
done
```

The kit loads animation clips from polyfork.dev by default. This one-line change points it at the local copies, so the game runs with no internet connection:

```sh
sed -i.bak "s#'https://polyfork.dev/cdn/'#new URL('../clips/', import.meta.url).href#" kit/_internal/clips.mjs \
  && rm kit/_internal/clips.mjs.bak
```

## Run

The game uses JavaScript modules, so it needs a local web server; opening `index.html` straight from the file system will not work.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/index.html> in a desktop browser and press `Enter`.

## Troubleshooting

- **Stuck on "Loading the neighbourhood…":** a file is missing. Open the browser's developer console; the first error names the file, which tells you which setup step to redo.
- **Changes to the code don't show up:** the browser cached the old module. Do a hard reload (`Cmd+Shift+R` on macOS, `Ctrl+Shift+R` elsewhere).

## Project layout

| Path | In git | What it is |
|---|---|---|
| `index.html` | yes | The page: HUD, start and end screens, import map |
| `src/main.js` | yes | All game code; the tunable numbers (timer, speeds, hearts) are at the top |
| `PROJECT_BRIEF.md` | yes | The brief the game was built from, including asset sources |
| `vendor/three/` | no | three.js 0.180.0 |
| `kit/` | no | The Neighborhood Pathways kit and animation clips |
| `halloween/`, `models/` | no | The individual Polyfork models |

## Credits and licence of the assets

All 3D models and the kit's helper modules are from [Polyfork](https://polyfork.dev) and are used under its licence (<https://polyfork.dev/licensing>), which is why they are downloaded rather than redistributed in this repo. three.js is MIT licensed.
