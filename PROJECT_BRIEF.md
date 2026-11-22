# Basement Empire — project brief

A model railway simulator. You stand in a basement where someone has built a big train layout on a table: three loops of track, a country station, an engine shed, a goods yard and a row of houses. Three trains run on it and you drive them, from above like the owner leaning over the table, or riding along at track level. The scene is shown as a tilt-shift diorama so the whole room reads as a miniature.

It is a sandbox, not a challenge: no score, no timer, no way to lose. This first version is deliberately simple.

The decisions below describe the game as built. Change any of them before the next round of development.

## Decisions

**Platform and view**
- Desktop browser, mouse and keyboard. No mobile or touch, no gamepad.
- Overview camera: orbit, zoom and pan with the mouse around the table, with a narrow 24° lens. It cannot go below the table top, and it can come in close enough (about 20 cm of real table) to see a pigeon on the platform.
- The walls between the camera and the table are hidden as the camera moves, like an open dollhouse.
- Ride-along camera (`C`): behind and above the picked train's leading vehicle (its tail vehicle when reversing), looking down the line.
- Diorama effect: a tilt-shift blur towards the top and bottom of the screen that only softens the room. Everything on the table, and in the air above it, stays sharp: the blur reads each pixel's depth, works out where it is in the world, and skips it if it is over the table. Plus a little extra colour saturation. `T` turns the blur off. It is weaker in ride-along view.
- Flying tour (`F`): the camera glides along a smooth closed loop past the station, the forecourt, the garden and pond, the goods shed, the town street, the engine shed and the farm, up over the whole layout and down over the kids' park, about 90 seconds a lap. Every stop is aimed so track is in the shot. `F`, `Esc` or grabbing the view ends it where it is.

**Scale**
- The layout is about 1:32 (roughly gauge 1). The railway is built in the kit's own real-world metres, and the room is built in real metres and scaled up 32 times around it. That keeps the railway parts, their 4 m grid and the kit's lighting at their native size.
- Real sizes: room 11 × 7 m, table 5.4 × 2.25 m with its top at 0.95 m and three pairs of legs.

**The room (the basement)**
- Grey walls with two casement windows, charcoal floor tiles, a staircase coming down in the back corner, a sofa with a rug and an arc floor lamp, a bookcase, a radiator, framed pictures.
- A hobby corner: a workbench, two shelving racks of supplies, cardboard boxes, and a desk with a monitor and office chair.
- Lit as bright daylight by the railway kit's `stage()` helper (`'noon'`), with its sky and fog turned off. No ACES tone mapping. Only the layout casts shadows; the room only receives them, so the walls never shade the table.

**The layout (on the table)**
- A grass baseboard with a dark wooden fascia and four legs.
- Three concentric ovals at the kit's 4 m track centres, each with 48 m straights and curve radii of 20, 16 and 12 m, built from the kit's straight and 45° curved track pieces. No points or junctions: each train keeps to its own loop.
- Front edge: a station on the outer loop with platforms, a canopy, the station building, lamps, benches, a clock, a running-in board and a cobbled forecourt with a car and a lorry.
- Back edge: a street of six houses from the Neighborhood kit, with street lights and trees.
- Beside the loops: engine shed, water tower and coal stage on the left; goods shed, yard crane and containers on the right.
- Far left end: a farm. A fenced paddock with a farm gate, a water trough and hay bales, a farmhouse, trees.
- Far right end: a duck pond with a stone rim, lotus flowers, reeds, a bench and trees; and beside it a walled garden with gravel paths, raised flower beds, pastel flowering plants along the paths, wildflowers, a row of sunflowers, a buddleia, a flowering magnolia, a shed and a bench.
- Inside the inner loop: on the right, the signal box with its signalman walking round it, a picnic shelter, a lineside hut, a pump house and trees; on the left, the kids' park (below).
- Signals, telegraph poles, lineside trees and wildflowers around the edges, kept clear of the trains' swept path on curves.
- A few figures (station master, passengers, porter, trainspotter, a waving child, a carter) standing with an idle animation.

**Life on the layout**
- Every person, animal and bird is at its real size in metres, the same as the trains, so they are in true proportion to the rolling stock. Birds are therefore tiny (about 1.5 cm on the real table) and are best seen zoomed in or riding along.
- In the paddock: three cows, two horses and five sheep. Each ambles to a random spot, stops, grazes with its head down or looks about, then moves on. They keep a little space from each other and from the trough and hay. Legs are driven by Polyfork's walker (`walk.mjs`), so feet stay planted.
- People walking with the humanoid walk and idle clips: two passengers pacing the platform; three townsfolk on the street at the back, one with a dog at heel; the farmer between the farmhouse and the paddock gate with a sheepdog; an old man strolling round the pond. Dogs trot to keep up with their person.
- Pigeons pecking and pottering on the platform and in the station forecourt.
- Ducks: three paddling slow circles on the pond, two waddling on the bank.
- Three crows and two gulls circling over the layout, flapping and now and then gliding, banked into their turns.
- The kids' park in the middle: a red play surface with a swing set (two kids standing on the swinging seats), a roundabout spinning with two kids riding it, a slide one kid keeps climbing and sliding down, a climbing frame, and a rope-swing tree with a kid swinging on it. Four kids play tag round the equipment, dodging it, while two parents stroll the edge. Two kite-flying kids walk the grass alongside, their kites riding the wind about 15 m up on sagging strings.
- In the garden: a gardener walking the paths, and ten butterflies (monarch orange, yellow, white, blue and pink, monarch-sized and smaller) flitting from flower to flower and settling with slow wingbeats.
- The camera can zoom right in, to about 5 cm of real table, close enough to watch a butterfly on a flower.
- Clearance: no building, tree, sign or bush stands where a train passes. This was checked by stepping every train round its loop and testing each car's footprint against everything on the layout.

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
| Animals and birds | Polyfork `cow-base`, `horse-base`, `sheep-base`, `dog-base`, `farm-dog-723730`, `duck-base`, `pigeon-base`, `crow-base`, `herring-gull-base` |
| Town people | Polyfork `suburban-resident-a9db9c`, `neighborhood-child-8cc5ac` |
| Kids' park | Polyfork `backyard-swing-set-38637e`, `playground-roundabout-e4d43b`, `playground-slide-8b764c`, `climbing-frame-e917d5`, `rope-swing-on-a-ada4bb`, `kite-kid-base`, `kite-kid-0a7d70`, `volantin-398e88`, `village-child-bef09e`, `child-with-a-painted-b8a19f`, `pupil-standing-0bd6d5`, `kid-in-a-caped-663f11` |
| Farm | Polyfork `wooden-fence-section-d72055`, `farm-gate-8ab320`, `hay-bale-079e8c`, `water-trough-df3ced` |
| Garden and pond | Polyfork `flower-bed-708e73`, `pastel-flowering-plant-d16a03`, `wildflower-68d3a1`, `sunflower-80ce15`, `low-garden-wall-run-a34d05`, `backyard-garden-shed-38d79f`, `flowering-magnolia-dd76cb`, `lotus-flower-cluster-bc129a`, `reed-bed-bbbefb`, `butterfly-base` |
| Walking for legged animals | `https://polyfork.dev/cdn/walk.mjs` |
| Lighting and animation helpers, idle clip | `https://polyfork.dev/cdn/stage.mjs`, `clips.mjs` |

Track-building notes, read from the kits rather than assumed:
- Straight and curved track run from their own origin along +z, centred on x = 0. The code measures which way the curve piece bends and lays it end-first when it needs the other hand.
- Platform pieces and the station building are drawn relative to the track centre line, so they are placed on the track's line and turned to the side they belong on.
- Vehicles face +z. The rig nodes (`bogie-f`, `bogie-r`, `bogie`, `wheel-*`) are found by name.

## Scenic Tour

A second mode, reached from the basement's "Scenic Tour ▸" button: a full-size ring of five themed places (Downtown City, Oceanside, Mountain, Wild West, Futuristic) joined by 90-second scenic routes, each with its own train, where you drive from the cab and walk round each place between trains. Its design is `docs/superpowers/specs/2026-11-20-scenic-tour-design.md`; it lives in `tour.html` and `tour/`, and its Polyfork kits are self-hosted (`kits/`, never committed).

Status: Phase 3 done. Phase 2 built the whole ring, all five places and their five trains, driven either way, with walking across each town between its two stations, a full day of sky over one lap (night places lit), suburbs and scenery along the lines, and streaming that builds what's beyond a place while you stand at it, so nothing loads while you drive. Phase 3 added:
- **Events on every leg**, played by actors built while you stand at a platform: the lighthouse, boats, gulls, dolphins and a freight on the coast; deer, a shower and its rainbow, an eagle and a work train on the climb; snow, a rockfall, riders, wild horses, tumbleweeds and a stagecoach down the canyon; the wind and solar farms, a passing bullet, a rocket launch and drones on the desert; fliers, suburban traffic and an airliner coming in to land on the way back to the City.
- **Four that you react to**, none of which can make you fail: a level crossing on the first and last legs (sound the horn as you come up to it; the gates close either way); a red signal on the climb (the guard stops the train at it, and it turns green once the work train has cleared the viaduct); cattle on the line at the canyon's mouth (the horn moves them on, or the guard stops for them and they wander off); and the high-speed stretch on the desert (your top speed on it, when you leave it).
- **The director's view** (`3`): cuts between dramatic shots of the train on its own, to each leg's showpieces (the cliffs, the tunnel's portals, the viaduct, the trestle, the guideway, the bridge, the skyline) and to each event as it begins; and **the nose view** (`4`), riding just above the front of the train. `V` cycles cab, nose, drone and director.
- **The map** (`M`): the ring from above, where you are, and on foot a flag on the platform the next train leaves from.
- **Signs to the departures**: a green board on each arrival platform names the train that leaves from the town's other station and where it goes, and on foot the HUD points to that platform from the way you're looking, with the distance.
- **HD trains and animals** from the owner's Polyfork account, when its CDN link is set in the gitignored `tour/local.js` (`?hd=0` turns HD off), and single parts self-hosted in `kits/parts/` (copied from the catalogue download by `scripts/extract-parts.mjs`), with Polyfork's public CDN as the fallback.

What couldn't be made as first planned, and why:
- **No eagle, wind turbine or launch rocket in Polyfork's catalogue**: the three are built in code (requests filed with Polyfork for each; they can be swapped in if they arrive).
- **The rainbow** is placed as if the sun stood no more than 30° up: the climb is at midday, with the sun about 61° up, where a real rainbow would be below the horizon.
- **The lighthouse's beam** never shows in play: the coast leg is in daylight both ways. Its lamp and beam light up after dark (checked with night forced).
- **The level crossings** stand where the land is level enough for a road over both lines: on the coast at 1610 m, short of Oceanside's platform rather than nearer the City; on the last leg at 1115 m, among the suburbs, about 970 m from the City's platform rather than at its edge.
- **The riders, wild horses, tumbleweeds and stagecoach** keep to the open land past the canyon's mouth: the canyon's walls leave no ground beside the line before it, so the riders' race lasts 6 to 10 seconds. The cattle stand at the canyon's mouth (1126 m) for the same reason.
- **The rocket** lifts off as you enter its stretch and is seen ahead going out; on a run back it is off to the side and behind (the director's wide shot shows it).
- **The airliner** crosses the line about 350 m ahead of the train, low, so it is in the cab's view: about 6 seconds going out, 3 coming back.

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

`index.html`, this brief, `README.md` and `.gitignore` for the basement; `tour.html`, `tour/` and `docs/` for the Scenic Tour. The basement needs nothing else; the tour also needs the self-hosted kits.
