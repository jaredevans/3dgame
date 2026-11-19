# Basement Empire — project brief

A model railway simulator. You stand in a basement where someone has built a big train layout on a table: three loops of track, a country station, an engine shed, a goods yard and a row of houses. Three trains run on it and you drive them, from above like the owner leaning over the table, or riding along at track level. The scene is shown as a tilt-shift diorama so the whole room reads as a miniature.

It is a sandbox, not a challenge: no score, no timer, no way to lose. This first version is deliberately simple.

The decisions below describe the game as built. Change any of them before the next round of development.

## Decisions

**Platform and view**
- Desktop browser, mouse and keyboard. No mobile or touch, no gamepad.
- Overview camera: orbit, zoom and pan with the mouse around the table, with a narrow 24° lens. It cannot go below the table top.
- The walls between the camera and the table are hidden as the camera moves, like an open dollhouse.
- Ride-along camera (`C`): behind and above the picked train's leading vehicle (its tail vehicle when reversing), looking down the line.
- Diorama effect: horizontal and vertical tilt-shift blur at the top and bottom of the screen, plus a little extra colour saturation. `T` turns the blur off. It is weaker in ride-along view.

**Scale**
- The layout is about 1:32 (roughly gauge 1). The railway is built in the kit's own real-world metres, and the room is built in real metres and scaled up 32 times around it. That keeps the railway parts, their 4 m grid and the kit's lighting at their native size.
- Real sizes: room 8 × 6 m, table 3.6 × 2.25 m with its top at 0.95 m.

**The room (the basement)**
- Grey walls with two casement windows, charcoal floor tiles, a staircase coming down in the back corner, a sofa with a rug and an arc floor lamp, a bookcase, a radiator, framed pictures.
- A hobby corner: a workbench, two shelving racks of supplies, cardboard boxes, and a desk with a monitor and office chair.
- Lit as bright daylight by the railway kit's `stage()` helper (`'noon'`), with its sky and fog turned off. No ACES tone mapping. Only the layout casts shadows; the room only receives them, so the walls never shade the table.

**The layout (on the table)**
- A grass baseboard with a dark wooden fascia and four legs.
- Three concentric ovals at the kit's 4 m track centres, each with 48 m straights and curve radii of 20, 16 and 12 m, built from the kit's straight and 45° curved track pieces. No points or junctions: each train keeps to its own loop.
- Front edge: a station on the outer loop with platforms, a canopy, the station building, lamps, benches, a clock, a running-in board and a cobbled forecourt with a car and a lorry.
- Back edge: a street of six houses from the Neighborhood kit, with street lights and trees.
- Left end: engine shed, water tower and coal stage. Right end: goods shed, yard crane and containers.
- Inside the inner loop: a signal box with its signalman, a picnic shelter, a lineside hut and trees.
- Signals, telegraph poles, lineside trees and wildflowers around the edges, kept clear of the trains' swept path on curves.
- A few figures (station master, passengers, porter, trainspotter, a waving child, a platelayer, a carter) standing with an idle animation.

**The trains**

| Train | Loop | Vehicles | Starts |
|---|---|---|---|
| The Express | outer (R 20 m) | green tender steam engine, coal tender, three maroon-and-cream coaches, brake coach | running |
| The Freight | middle (R 16 m) | blue mainline diesel, hopper, tank wagon, timber wagon, covered van, cattle wagon, guard's van | running |
| The Branch Line | inner (R 12 m) | red saddle-tank engine, coal wagon, milk tank, guard's van | stopped |

- Each vehicle stands on two pivots (its bogie centres, or its outer axles), each placed on the track path, so bodies swing out on curves the way real ones do. Bogies turn to follow the rails and wheels spin with distance travelled.
- Throttle from full reverse to full forward. Top speed 22 m/s in layout metres (about 80 scale km/h), with gentle acceleration and braking. The card shows scale km/h and the direction.
- Trains never meet, so there are no collisions.

**Controls**
- Pick a train with `1` `2` `3`, by clicking it on the layout, or by clicking its card. A small marker floats over the picked train's engine.
- `W`/`S` or `↑`/`↓` move the picked train's throttle 5% per key press (holding the key repeats). `Space` sets it to zero.
- `H` sounds a steam whistle or a diesel horn, made with WebAudio.
- A card per train at the bottom of the screen: throttle slider, speed, direction, and Stop, Whistle and Ride buttons.

**How it's built and run**
- One file, `index.html`: the page, its styles and all the game code. No framework, no build step, no backend.
- three.js 0.180.0 from jsDelivr, through the page's import map: post-processing from its examples (`EffectComposer`, the two tilt-shift shaders, hue/saturation, `OutputPass`) and `OrbitControls`.
- Every model is a Polyfork part loaded from `https://polyfork.dev/cdn/<asset id>.mjs` and built with its own `createAsset(params)`. Lighting and the figures' idle animation use Polyfork's `stage.mjs` and `clips.mjs` from the same CDN. All of these are free and need no account.
- All downloads start at once when the page opens. Parts are named in the code by their kit key, and an `IDS` table maps each key to its asset id.
- The railway kit's composed place was not used, because its track is a through line with sidings, not a loop.
- Needs internet. Hosted on GitHub Pages; for local testing, any static web server.

## Assets

Nothing is copied into the repo; everything loads from CDNs at run time.

| What | Source |
|---|---|
| three.js 0.180.0 | `https://cdn.jsdelivr.net/npm/three@0.180.0/` |
| Trains, track, station, sheds, signals, people | Polyfork Countryside Railway kit (`countryside-railway-9b4c57`) |
| Basement walls, floor and furniture | Polyfork Open Plan kit (`open-plan-b2ebd3`) |
| Town houses, street, trees, car | Polyfork Neighborhood Pathways kit (`neighborhood-pathways-kit-a992cf`) |
| Shelving, boxes, workbench | Polyfork single models `supply-shelving-rack-ae446a`, `cardboard-delivery-box-59cc68`, `field-workbench-70f706` |
| Lighting and animation helpers, idle clip | `https://polyfork.dev/cdn/stage.mjs`, `clips.mjs` |

Track-building notes, read from the kits rather than assumed:
- Straight and curved track run from their own origin along +z, centred on x = 0. The code measures which way the curve piece bends and lays it end-first when it needs the other hand.
- Platform pieces and the station building are drawn relative to the track centre line, so they are placed on the track's line and turned to the side they belong on.
- Vehicles face +z. The rig nodes (`bogie-f`, `bogie-r`, `bogie`, `wheel-*`) are found by name.

## Ideas for later

Points and junctions so trains can change loops and use sidings, a turntable at the engine shed, coupling and uncoupling wagons, station stops with a timetable, day and night (the kits' windows and lamps can light up), switching the basement lights off, sound for wheels and engines, saving the layout.

## Out of scope for this version

Building or editing the layout, collisions and derailments, a goal or score, multiplayer, mobile.

## Done when

- The basement and layout load with no console errors, from GitHub Pages or any static server, and the walls nearest the camera hide as you orbit.
- All three trains follow their rails through the curves without leaving the track, forward and in reverse.
- Picking, the throttle, Stop, the whistle and ride-along all work from both the keyboard and the cards.
- With tilt-shift on, the scene reads as a miniature.

## What is in git

`index.html`, this brief, `README.md` and `.gitignore`. Nothing else is needed to run or publish the game.
