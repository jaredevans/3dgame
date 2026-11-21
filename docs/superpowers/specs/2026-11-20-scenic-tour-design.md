# Scenic Tour — design

A second way to play Basement Empire. You leave the basement and become the driver of a full-size train in a big open world: five themed places on one ring of railway, joined by scenic 90-second routes. You drive a leg, stop at the platform, get out and walk across the town to its other station, where the next train onwards is waiting; or get back on the one you came in on to return.

Date: 2026-11-20. Status: approved 2026-11-20.

Decided with the owner: approach A (separate page, streaming world); 90 seconds per leg; walking at every place, crossing town between two stations; three simple cab interiors; places about 100 m across; Polyfork kits downloaded and self-hosted, never committed to this public repo.

## Intent

The basement is a model railway you look down on. The tour is the other half of the fantasy: being the driver, out in the landscape, going somewhere. Each place has its own kind of train, themed for where it is heading, so the ride itself changes as much as the scenery. The whole thing is centred on you as the driver: what you see from the cab, what happens around the train, and the places you arrive at.

It keeps the basement's spirit: a sandbox, beautiful to look at, no score, no timer, no way to lose.

## Goals

- A continuous world that feels expansive: you can see the next town on the horizon as you leave, and nothing stops to load while you drive.
- Five places, each with a strong, distinct theme: **Downtown City**, **Oceanside**, **Mountain**, **Wild West**, **Futuristic**.
- Five scenic routes, about 90 seconds of driving each at the train's normal speed, each with its own showpieces and events.
- A different train on each leg, themed for its destination, including a bullet train to the futuristic place.
- Get out at a station and walk across the place on foot to the departure station on the far side to travel on, or board the train you came on to go back.
- Three driving views (cab, drone, director) that you can switch between at any time.
- A sky that is a pleasure to look at: one lap of the ring is one full day, morning to the next sunrise.

## Non-goals (for this version)

- Points, junctions or choosing routes beyond "next" or "back"; the ring is the only line.
- Other places beyond the five; adding one later should be possible but is not designed for here.
- Mobile, touch or gamepad. Desktop browser, mouse and keyboard, like the basement.
- Saving progress, multiplayer, sound beyond horns, whistles and a few event sounds.
- Changing the basement mode, apart from a button that opens the tour.

## Anti-goals (a failure even if it works)

- **A fail state.** No derailing, crashing, penalties or "game over". Events never punish you.
- **Waiting.** A loading screen while driving or boarding, or the train stopping mid-route to load. (Amended 2026-11-21 by the owner: the brief 'Arriving at …' cover while you stand at a platform, a few seconds at most, is accepted.)
- **Ugly or muddy.** Flat grey skies, muddy colours (for example ACES tone mapping at exposure 1 over Polyfork models), bare empty stretches of route, or models visibly floating, sunk or wrongly scaled.
- **Samey routes.** Five legs that feel like the same track through different paint.
- **Breaking the basement.** It must load and play exactly as it does today.

## The world

One ring of railway through five places, in this order. You start in Downtown City.

```
          Mountain ─── Wild West
         /                  \
   Oceanside              Futuristic
         \                  /
          ── Downtown City ──
```

### Places

| Place | Theme | Polyfork kit for the place |
|---|---|---|
| Downtown City | towers, busy streets, a grand terminus | New York City Kit (`nyc-city-kit-fbca88`) |
| Oceanside | beach, boardwalk, harbour, beach huts, lighthouse on the headland | Coast and Boardwalk (`coast-and-boardwalk-d883fd`) |
| Mountain | alpine village in snow, pines, peaks | Alpine and Snow (`alpine-and-snow-092f66`) |
| Wild West | frontier main street, saloon, water tower, red rock | Frontier Town (`frontier-town-a0085b`) |
| Futuristic | gleaming arcology, elevated guideways, lit plazas | Chrome Arcology Transit kit (`chrome-arcology-transit-kit-87a0e1`) |

**Two stations per place, on opposite sides of town, each running alongside it.** The line does not run through the town, and a town never sits behind a station's buffers: each station lies beside the town, with its platform and building on the town side, so you step off the train and walk straight in. The route from the previous place ends at a terminus along one edge of the town; the route to the next place starts from a terminus along the opposite edge. To travel on, you walk through the town from one station to the other. The town has streets, buildings, people going about and the place's landmarks, and the walk through it is part of the journey.

```
        route to next place ◀══════════════[ Departure station ]═══
                                            platform · building
                              ┌──────────────────────────────────┐
                              │               town               │
                              └──────────────────────────────────┘
                                            platform · building
  ═══ route from previous place ════════════[ Arrival station ]
```

(Revised 2026-11-20 at the owner's request: places sit to the side of their stations, not behind them.)

**Size: about 100 m across, a one-to-two-minute walk end to end** (so station to station, through town). Each kit's composed place is the core (most are 40–60 m; Chrome Arcology is about 116 × 139 m and needs little more), extended with a ring of streets and buildings from the same kit around the station. Not a full town of several hundred metres.

### Legs, trains and scenery

| Leg | Train | Route character |
|---|---|---|
| City → Oceanside | blue mainline diesel with coaches, a seaside excursion | out through the city edge, then a cliff-top line above the sea |
| Oceanside → Mountain | tank steam engine with two old coaches | climbing through forest, a dark tunnel, a high viaduct beside a waterfall |
| Mountain → Wild West | tender steam engine with wooden cars | over the snowy pass, down to the plains, through a red-rock canyon, across a wooden trestle |
| Wild West → Futuristic | bullet train | a long, dead-straight elevated guideway across the desert at speed |
| Futuristic → City | sleek commuter train | into the suburbs, over a long river bridge, into the downtown towers |

The Countryside Railway kit (already used by the basement) supplies the steam engines, diesel, coaches and wagons. The futuristic side has the Guideway Rail Shuttle and Maglev Guideway Run; Polyfork has no bullet train, so one is needed (see "Left to the builder").

**Leg length follows speed.** Each leg takes about 90 seconds to drive at that train's normal running speed, including pulling away and stopping. A faster train therefore gets a longer route: the bullet train's leg is several kilometres long and should feel genuinely fast; the steam climb to the mountains is short and slow. Real-world metres throughout, at the trains' real size.

## Driving

- **Throttle and brake.** `W`/`S` or `↑`/`↓` for the throttle, a separate brake (`Space` holds the brake), `H` for the horn or whistle. A small driver's panel on screen shows speed, throttle and distance to the next station.
- **Stopping at the station** is up to you. A marker shows where the platform's stopping point is. Overshooting is fine: you can reverse back. You can get out once the train is stopped with the cab alongside the platform.
- **Map.** `M` shows the whole ring, the five places, and a dot for where you are.
- **No fail state.** The train cannot leave the rails or collide. If an event needs you to stop (below) and you don't, the train brakes itself gently and a short message explains why.

## At a station: walking

- When stopped at a platform, a prompt offers "Get out" (`E`). You step down as a person on the platform.
- **On foot:** third-person, over the shoulder. `WASD` to walk, `Shift` to run, mouse to look. You stay on the ground and cannot walk through buildings, fences or other solid things. The walkable area is the place itself; its edges are bounded naturally (water, cliffs, fences, scenery), not by invisible walls in the middle of open ground.
- **Boarding:** the train onwards round the ring waits at the place's **other** station, across town, so going on always means walking through the place. The train you arrived on stays at the same town-side platform where you got off, turned to face back the way it came, so you can return without crossing town. Walk up to a waiting train and a prompt names it ("Board the Canyon Express to the Wild West"); press `E` and you are in its cab.
- Signs and the map (`M`, which also works on foot) point the way to the departure station.
- The walker is a Polyfork humanoid figure animated with Polyfork's `clips.mjs` (`animate()`, walk and idle).

## Cameras

While driving, `V` cycles through the views, or `1` `2` `3` picks one:

1. **Cab.** First-person from the driver's seat, inside a simple modelled cab, looking ahead over the nose or boiler. The mouse looks around, so you can turn and watch the sea out of the side window. The Polyfork engines are outside shells with no interior, so the tour builds **three cab interiors in code**, in the same low-poly style, each fitted inside its shells: **steam** (firebox backhead, gauges, regulator, open sides; both steam engines), **diesel** (desk, windscreen frames, controls), and **futuristic** (wraparound glass, a sleek console; the bullet train and the commuter). The outside shell is hidden where it would block the view.
2. **Drone.** Follows the train from above and around. Mouse to orbit, scroll to zoom. It keeps pace with the train.
3. **Director.** An automatic cinematic camera that cuts every 5–8 seconds between dramatic shots: low at the trackside as the train comes at you and roars past; far below a viaduct as the train crosses; wide across a canyon with the train small against the cliffs; a helicopter tracking shot alongside; a slow arc round the nose of the bullet train. Each route has hand-placed shots at its showpieces (tunnel mouth, viaduct, trestle, cliff edge, skyline), and when the train is between them, general shot types (trackside, chase, high wide) fill in. The director cuts to events when they happen.

You can drive in any view. On foot, the camera is always the over-the-shoulder view.

## Sky, light and atmosphere

One lap of the ring is one full day. The light changes continuously through each leg, so every route looks different:

| Leg | Light and sky |
|---|---|
| City → Oceanside | bright morning, puffy white clouds, sparkling sea |
| Oceanside → Mountain | crisp midday blue, high wispy cloud, mist lying in the valleys |
| Mountain → Wild West | warm afternoon turning to an orange-and-pink sunset over red rock |
| Wild West → Futuristic | dusk into night, stars coming out, the futuristic place glowing ahead |
| Futuristic → City | pre-dawn blue into sunrise behind the skyline |

Time of day follows your position on the ring, so going back the way you came reverses it, and standing at a station holds that station's time. The sky has soft gradients, layered drifting clouds, a sun with glow, and distance haze that blends far terrain into the sky. After dusk, the places' windows, lamps and signs light up (Polyfork's `has_night` parts do this through `stage()`).

Lighting follows Polyfork's guidance: `stage()` from `https://polyfork.dev/cdn/stage.mjs`, no ACES tone mapping at exposure 1.

## Things to see and things that happen

Each route has a set of sights and events. Most are spectacle; one per leg asks something light of you.

| Leg | Spectacle | You react |
|---|---|---|
| City → Oceanside | gulls following the train, a lighthouse, dolphins leaping off the cliff line, sailboats and a big ship on the horizon, a freight train passing the other way | a level crossing with gates and waiting cars: sound the horn as you approach |
| Oceanside → Mountain | the tunnel that bursts out onto the viaduct by the waterfall, an eagle soaring alongside, deer on the slopes, a passing rain shower that clears to a rainbow | a signal at red before the viaduct while a work train clears it: stop, wait, it goes green |
| Mountain → Wild West | snow falling at the pass, rocks tumbling down a slope behind the train, a herd of horses galloping alongside, riders on horseback racing the train, tumbleweeds, a stagecoach on the dirt road | cattle wandering on the line: horn and brake, they amble off |
| Wild West → Futuristic | wind turbines and a solar farm, a rocket launch on the horizon, drones flying in formation, another bullet train flashing past the other way with a whoosh | a marked high-speed stretch: open the throttle fully and the panel shows your top speed |
| Futuristic → City | flying vehicles between the towers, a plane coming in low overhead, the long river bridge, road traffic alongside as the sun comes up | a level crossing into the city: horn as you approach |

Events fire every time you drive the leg, in either direction where it makes sense. If you ignore a "you react" event, nothing bad happens: the train eases to a stop by itself for the signal and the cattle, and a horn you didn't sound simply isn't heard.

## Approaches considered

**A. A separate page that streams the world around you — chosen.** The tour is its own page with its code in a few files, no build step. Only what's near you is in memory: the station you're at and the routes and places either side. While you walk round a station, the legs you might take next load in the background, so boarding never waits. Chosen because it is the only option that keeps the world continuous without a long initial load, it leaves the basement untouched, and adding places later stays cheap. Its cost is the streaming code.

**B. One page with the whole world loaded at once.** Simplest code and an instant switch from the basement, but a ring of roughly 15–20 km of scenery means a long first load and heavy memory alongside the basement, and it gets worse with every place added.

**C. Separate scenes with a loading screen per leg.** Least engineering, but you could never see the next town on the horizon, and a loading screen between legs breaks the feeling of one world (an anti-goal).

## How it's built (decided)

- **Pages.** The basement stays in `index.html`; its only change is a button that opens the tour. The tour is `tour.html` plus ES modules in `tour/`, with a "Back to the basement" button. No framework, no build step, no backend: static files only, served from any static server that can also reach the kit files.
- **three.js 0.180.0** from jsDelivr through an import map, as the basement does.
- **Polyfork kits are downloaded and self-hosted.** The kit zips (each with `kit.mjs`, `stage.mjs`, `clips.mjs`, the parts, `LAYOUT.json`, `PARTS.json` and the kit's `terrain.mjs`) are served from the owner's own server and kept in a private repo. They are **never committed to this public repo**: locally they sit in `kits/`, which is gitignored. The tour reads every kit from one base-URL setting (`./kits/` for local testing, the owner's server in production). If the tour page and the kit server are on different origins, the kit server must send CORS headers for ES module imports.
  - Kits downloaded (2026-11-20, in `kits/<kit-id>/`): New York City, Coast and Boardwalk, Alpine and Snow, Frontier Town, Chrome Arcology Transit (the five places), Countryside Railway (trains, track furniture, stations), Nature & Forest (scenery between places). About 430 MB unzipped in all, 43–94 MB per kit, as flat `<key>.glb` + `<key>.mjs` part pairs plus `kit.mjs`, `LAYOUT.json`, `PARTS.json`, `API.md`. Only the parts a place actually uses are fetched, so download size is set by what's placed, not by kit size; streaming keeps it spread through play.
  - New York City has **no terrain program** (`"terrain": false`); its ground is the ring's landscape with paving. The other six kits have `terrain.mjs`, all with `island` edges by default.
  - The `city: { seed, blocks }` generator should work for New York City, Frontier Town (`dirt-street-tile`) and Chrome Arcology (`two-lane-street-tile`), since each has street tiles; untested.
  - Parts from other kits (aircraft, rocket, animals) can still come from Polyfork's free per-part CDN.
- **Each place is built with its kit's `buildKit()`**, starting from the composed place and extending it to the target size with the same kit's parts (for street kits such as New York City, the kit's `city: { seed, blocks }` generator can lay the extra streets). `buildKit` merges static parts into a few draw calls and provides walking support: `place.blocked(x, z, r)` for collision, `groundAt` / `surfaceAt` for what's underfoot, `openSpot` / `spots` for clear points, and people who already walk. Parts added outside `buildKit` need their own collision boxes.
- **Terrain.** One heightfield landscape for the whole ring, generated by the tour: shaped hills, mountains, coastline and sea, canyon, plains, with the track bed cut and filled to grade. Ground colour varies by region (sand, grass, snow, red earth, paving). Each place's ground comes from its kit (its `terrain.mjs` and knobs, or `setting: true` for the wider ground and the kit's own trees and rocks) and must blend seamlessly into the ring's landscape at its edges; the kits' default `island` edges are not used.
- **Double track on the routes, left-hand running** (designer's call, as on the British railway the kit models): the outbound line is the left-hand one, and its platform and station building are on the town side. You drive both ways on that town-side line, so the train you came on is always at the town-side platform; the other line carries passing trains. The work train at the viaduct signal runs on your own line ahead of you. Each route ends in a terminus at each end; the stations are termini, not through stations.
- **Track is a smooth 3D curve** (gentle gradients and banked curves), with rails, sleepers and ballast generated along it, plus bridges, viaducts, the trestle, the tunnel and the elevated guideway as the route needs. The kit's straight and 45° track pieces cannot follow it.
- **Trains** reuse the basement's way of sitting a vehicle on the path: each vehicle on two pivots (bogie centres or outer axles), bogies turning and wheels spinning with distance. The tour has its own copy of that code; it does not import from `index.html`.
- **Streaming window.** In memory: the current place, the two routes touching it, and the places at their far ends (at least as distant scenery). Nothing loads while you're moving: driving a leg keeps only that leg and its two places (and its train). When you stop at a platform, the place's other route, the place beyond it and its train load, behind a short "Arriving at …" cover (a place's kit builds in one go and can't be spread across frames), and the train is held while they come in, for a few seconds at most: past that you can get out, board or drive on, and anything still coming in waits for your next standstill to be built. A download is given up on (and the way it was for said to be unloadable) only once nothing has come in for it for a minute and a half of play; while the page first loads, never. What you drive away from unloads, and is freed at your next stop. (Amended in Task 11: this replaced loading the next leg's far place while driving away, which stalled mid-route.)

## Constraints

- Desktop browser, mouse and keyboard; Chrome, Safari and Firefox current versions.
- Smooth to drive on a machine that runs the basement smoothly. Distant scenery uses lower detail.
- First load of the tour (city plus what's needed to leave it) should feel quick, comparable to the basement's first load; later loads happen during play.
- three.js loads from jsDelivr; Polyfork kits load from the owner's server (or `./kits/` locally); nothing to install.
- The basement must keep working exactly as now, on GitHub Pages from Polyfork's free CDN, with no dependency on the owner's kit server.

## Left to the builder

- **The bullet train.** No Polyfork bullet train exists. Build one in code in the same low-poly style (long sculpted nose, several cars, the elevated guideway beneath), or adapt the Guideway Rail Shuttle. It must read instantly as a bullet train and look at home beside the Polyfork models.
- **The sleek commuter train** for Futuristic → City: the Guideway Rail Shuttle in a short rake is the obvious start.
- **Exact routes, gradients, showpiece positions and leg lengths,** within "about 90 seconds at normal speed" and the route character above.
- **Normal running speeds** per train (roughly: diesel 100 km/h, tank steam 60, tender steam 90, bullet 300, commuter 120).
- **Which parts make each event** (Polyfork search first: animals, birds, boats, aircraft, rocket from the Space Base kit, drones, vehicles). Where Polyfork has nothing suitable, a simple procedural model in the same style, or drop the event and note it.
- **How waiting trains are placed** so that the onward train is always at the departure station across town and the train you came on is at your arrival station, each facing out along its route. They can simply be placed there when you arrive; you never see both ends of a leg at once. How a train is turned to go back (run-round, turntable, or just re-placed while you are away from it) is the builder's call, as long as you never see it happen unconvincingly.
- **Sky and cloud technique,** within the look described. `stage()`'s `setTime()` only runs day → golden → dusk → night, with sunrise as a separate fixed `'dawn'` preset, so the full-day cycle needs the tour's own blending on top of it.
- **How each place's kit ground is blended into the ring's landscape,** and how each place's walkable edge is shaped.
- **Collision for parts placed outside `buildKit`** (for example boxes from each part's bounds).
- **File layout inside `tour/`,** module boundaries, and level-of-detail strategy.
- **Key bindings** beyond those named here, and the look of the driver's panel and map.
- **Updating `README.md` and `PROJECT_BRIEF.md`** to describe the tour.

## Done when

- The basement still loads and plays as before, and its button opens the tour; the tour's button returns.
- You can drive the whole ring both ways, all five legs, with no loading pause while driving or boarding, and no console errors.
- Every train stays on its rails through curves and gradients, forwards and in reverse.
- At every place you can get out, walk across town to the departure station without passing through solid things, and board the onward train there; or board the train you came on to go back.
- Cab, drone and director views all work while driving; the director cuts to showpieces and events.
- The sky changes through a full day over one lap, and night places light up.
- Each leg's events happen as described, and none of them can make you fail.
