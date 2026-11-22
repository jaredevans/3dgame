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

Drive a full-size train round a ring of five places in a big open world, get out at each station, walk across the town to its other station, and take the next train on. The design is in [`docs/superpowers/specs/2026-11-20-scenic-tour-design.md`](docs/superpowers/specs/2026-11-20-scenic-tour-design.md).

The ring, each leg about 90 seconds at the train's normal speed, with its own train:

| From | To | Train | On the way |
|---|---|---|---|
| Downtown City | Oceanside | Seaside Excursion (a blue diesel and coaches) | along the cliff tops above the sea |
| Oceanside | Mountain | Highland Climber (a saddle-tank engine and two green coaches) | up through the forest, a tunnel, a viaduct over a waterfall's valley |
| Mountain | Wild West | Canyon Express (a tender engine and teak cars) | over the snowy pass and a trestle, down the canyon |
| Wild West | Futuristic | Silver Arrow (a bullet train) | 4 km across the desert on an elevated guideway |
| Futuristic | Downtown City | Metro Glide (guideway shuttles) | through the suburbs and over the river, into the sunrise behind the towers |

One lap is one day: morning at the City, midday by the sea, sunset over the red rock, night at the Futuristic place, and dawn on the way back into the City. You can go round either way: the train you came in on waits at your platform, turned round to take you back, and the one onwards waits at the town's other station. The driver's panel shows your speed, throttle, and the next station and how far it is.

You start in the Seaside Excursion's cab at the City. The world streams in round you as you go, but nothing is built while you're moving (only the land, a slice a frame): when you stop at a platform, what lies beyond that place is built behind a short "Arriving at <town>…" cover, and you can get out (or set off again) once it lifts. If something is still being built when you reach a train, its prompt says "Getting <town> ready…" until it's in, or that the way couldn't be loaded if a part of it failed. Neither the cover nor a wait to board lasts more than a few seconds on anything the train doesn't need: past that you can go, and what's still coming in is built at your next stop.

| Input | Action |
|---|---|
| `W` / `S` or `↑` / `↓` | Throttle up / down (below zero is reverse) |
| `Space` (hold) | Brake |
| `H` | Horn |
| `V` | Change view: cab, nose, drone, director |
| `1` `2` `3` `4` | Cab, drone, director, nose (drag to look or orbit, scroll to zoom the drone) |
| `E` | Get out when stopped at a platform; board a train when you're next to it; at a departure station, take the ride waiting there when you're next to it (see [Rides](#rides)) |
| On foot: `W` / `S`, `A` / `D`, `Shift` | Walk forwards and back, turn, run (the camera follows behind you) |
| On foot: drag | Standing still, look round you; it swings back behind you when you move |
| `M` | The map (`Esc` closes it) |
| `Z` | Auto tour: it drives, gets out, runs across each town to the next train and boards it, round the whole ring, cycling the nose, drone and director views. `Z` again, or any driving or walking key, gives you the controls back where you are |
| `T` | Teleport: a list of the five places (`1`–`5` picks one, `T` or `Esc` closes it). On foot, or in the cab standing still, you fizz out in a column of sparkles and fizz in on foot on that place's arrival platform, its two trains waiting; the train you leave stays where it stopped, unless its line serves the destination, where it's put at its platform (one train per line). `Esc` with the map open only closes the map; a second `Esc` takes you back, till you've been moved. Does nothing while the train moves; the auto tour carries on from where you land |
| `K` | Hide the help panel and title (the "Hide HUD" button does the same); again to show them |

On a phone or tablet, every key the help panel shows, the prompt and the teleport list's places can be tapped: a tap is that key pressed, held as long as your finger is down.

**Views.** The cab is the driver's seat; the nose rides just above the front of the train; the drone orbits it. The director's view cuts between dramatic shots on its own: from the trackside, below a viaduct, a helicopter alongside, a chase, a wide or high view, round the nose, and at a tunnel's portal as you go in. It cuts to each leg's showpieces (the cliffs, the tunnel, the viaduct and trestle, the guideway, the bridge, the skyline) and to each event as it begins.

**On the way.** Every leg has things happening along it, some of them for you to answer:

| Leg | What happens | You react |
|---|---|---|
| City to Oceanside | a lighthouse on the cliff top, sailboats, a fishing boat and a container ship at sea, gulls flying with the train, dolphins leaping along the cliffs, a freight coming the other way | a level crossing: sound the horn as you come up to it ("Heard at the crossing"); its gates close and the cars wait |
| Oceanside to Mountain | deer that bound off the slope, a shower that clears to a rainbow, an eagle circling over the valley | going up, a red signal before the tunnel: the train stops at it while a work train clears the viaduct, then it turns green |
| Mountain to Wild West | snow on the pass, boulders tumbling down behind the train, riders racing it, wild horses galloping alongside, tumbleweeds, a stagecoach on its road into town | cattle on the line at the canyon's mouth: sound the horn and they move off; if you don't, the train stops for them and they wander off |
| Wild West to Futuristic | a wind farm and a solar farm on the desert, another Silver Arrow flashing past, a rocket launch on the horizon, a formation of drones alongside | the high-speed stretch: when you leave it, it tells you your top speed |
| Futuristic to Downtown City | hover pods and cargo skiffs flying round the Futuristic place's towers, helicopters and drones over Downtown City, traffic on the suburbs' streets, an airliner coming in low over the line to land | a level crossing among the suburbs, as on the first leg |

None of them can make you fail: the guard brakes for the signal and the cattle if you don't, and a crossing you didn't sound the horn for still lets you through.

**Finding your way.** Each arrival platform has a green sign saying where the next train leaves from across the town ("Departures across town: Highland Climber to Mountain"). On foot, the top of the screen points to that platform from the way you're looking, with how far it is, and the map (`M`) shows the ring, where you are and a green flag on the departure platform.

### Rides

Each place also has a ride onward, a second way along its leg that carries you there by itself in about 90 seconds while a set piece plays out round you. It waits beside the departure station's platform, so at every departure you can take either the train or the ride. Walk up to it and press `E` when the prompt says "Take the … (E)". The City's ride is the exception: the speedboat waits at a jetty on the City's seafront, reached by a walkway out of the town's south-east corner. The departure station has its own board pointing the way, and a sign stands where the walkway leaves the town.

| From | Ride | What happens on the way | Where it sets you down |
|---|---|---|---|
| Downtown City | the **speedboat** (Polyfork's caique fishing boat, run flat out, its captain at the wheel) | it skims along the coast; a giant octopus rises beside it, its arms out of the water, and the boat swerves hard away | at Oceanside's harbour jetty, beside the Highland Climber's station |
| Oceanside | a **hot-air balloon** pushed along by two jet engines on its basket, its burners roaring | it lifts off over the forest and the waterfall's valley while a flock of big black crows wheels round the envelope, one now and then swooping past the basket | beside the Mountain's arrival platform |
| Mountain | a **stagecoach** behind two galloping horses, on its own dirt road cut into the hillside as a level bench (part of the land, so you can see it from the Canyon Express too) | early in the ride a gang of five outlaws breaks from ambush and chases it, firing wide; nobody is hit, and they fall back | on the Wild West's station pad |
| Wild West | Polyfork's **Agile Starfighter**, hovering up off its pad | it buzzes the rocket launch 12 to 15 seconds into the rocket's flight; a UFO with flashing white and green lights drops in and fires laser bolts that pass 3 to 6 m from you; the starfighter fires a missile and blows the UFO up | it hovers down onto its apron by the Futuristic place's arrival platform |
| Futuristic | a **flying car** (the Chrome Arcology kit's hover pod with a glass cabin, so you see all round) | other hover pods and cargo skiffs fly with it in loose formation, and one passes it over the river | beside Downtown City's arrival platform |

Once you've set off, the ride goes on its own and can't fail. `V` cycles three views: your seat, the chase (the drone) and the director, who cuts to the set piece as it begins. `1`–`3` pick one directly (a ride has no nose view). `M` shows the map with your dot moving along the leg. The sky and what's streamed in follow the ride along its leg. The leg's train events don't play during a ride, so the signal's work train stays where it is. At the end you step off on foot by the next place's station, with the train you didn't take back standing at its platform, so you can carry on by either. The auto tour (`Z`) takes the trains only. Pressed during a ride, it starts once you've landed (`Z` again cancels that).

### The kit files

The tour builds its places with Polyfork kits' own `kit.mjs` (`buildKit`), which Polyfork serves only from its Pro CDN or from a kit's download, so the kits are hosted by us and **never committed to this repo** (`kits/` is gitignored). It uses seven kits, each unzipped into its own folder named by its id:

`nyc-city-kit-fbca88`, `coast-and-boardwalk-d883fd`, `alpine-and-snow-092f66`, `frontier-town-a0085b`, `chrome-arcology-transit-kit-87a0e1`, `countryside-railway-9b4c57`, `nature-forest-kit-f29d6a`

Locally they live in `kits/<id>/`. In production, serve the same folders from any web server and point the tour at it with `?kits=`:

```
https://<your-site>/tour.html?kits=https://<kit-server>/kits/
```

If the kit server is on a different origin from the page, it must send CORS headers (`Access-Control-Allow-Origin`) or the browser refuses the modules. If a kit file can't be loaded, the loading screen names the file.

### Developer aids

`node --test tour/test/` runs the unit tests (Node 20+, nothing to install). `?free=<metres>` opens an orbit camera at that distance along the City to Oceanside leg; `?debug` adds `__tour.snap(position, target)` for stills from any viewpoint, `__tour.frame(dt)` to step the tour by hand, and `__tour.jump(legS)` to put your train, stopped, that far along the leg you're driving.

A few single parts aren't from those kits: the suburbs' houses along the Metro Glide's line, the animals and props of the routes' events, and the rides' own parts: the speedboat (`caique-fishing-boat-262c24`), the giant octopus (`octopus-base`), the balloon's crows (`crow-base`), the stagecoach's and the gang's horses (`saddled-horse-da86d3`), the starfighter (`agile-starfighter-89805f`) and its missile (`missile-0717d1`). The rides' other parts come from the kits themselves: the coast kit's fisherman at the boat's wheel, the Alpine kit's mountaineer flying the balloon, the Frontier kit's stagecoach, prospector and outlaws, and the Chrome Arcology kit's hover pods and cargo skiffs. The balloon and the UFO are built in code. They are self-hosted too, in `kits/parts/` beside the kits (so `?kits=` moves them with the kits). Copy them out of your Polyfork catalogue download with:

```
node scripts/extract-parts.mjs path/to/polyfork-catalog.zip
```

It copies every part the tour's code (or a Scenic Tour plan) names, and nothing else; run it again when the tour starts using another part. A part that isn't there yet is loaded from Polyfork's free public CDN instead, with a warning in the console.

With a paid Polyfork account, the parts can come from your account's own CDN link instead: copy `tour/local.example.js` to `tour/local.js` and put your `cdn_base` in it. That file is gitignored, since the link is yours; with it the tour tries your account first, then `kits/parts/`, then the public CDN. (Without it, the browser notes one missing `tour/local.js` (a 404 in the console: a static page can't know a file isn't there without asking for it) and carries on.) Two other 404s are expected once the Wild West is built (as you near it, or teleport to the Mountain next door): its kit's own layout asks Polyfork's CDN for two figures' clips it hasn't got (`anim-laughing.json`, `anim-drinking.json`), and those two stand idle instead. `?cdn=<base url>` loads these parts from that address only; if they can't be loaded, the tour goes on without them (the suburbs, or that event).

With the account link configured, the trains and animals that have an HD edition (a high-poly model with its own materials) are loaded from your account in HD; `?hd=0` turns HD off, to compare or on a slow machine (`?cdn=` turns it off too). If an HD model doesn't arrive in time, the flat one is used. HD's animal materials use Polyfork's `materials.mjs`, which `scripts/extract-parts.mjs` copies into `kits/parts/` with the parts.

## Run it locally

Serve the folder with any static web server and open the page:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/> in a desktop browser. The first load downloads about 15 MB of models; the browser caches them after that. For the tour, open <http://127.0.0.1:8765/tour.html> with the kits in `kits/`.

## Publish on GitHub Pages

The site is published by a GitHub Actions job (`.github/workflows/pages.yml`) on every push to `main`. The kits aren't in the repo, so the published tour builds them from your Polyfork account's CDN (Polyfork says that link is safe in a page: it only reads files). The link is kept out of the repo too: the job writes it into `tour/local.js` from a repository secret.

1. In the repo, go to **Settings → Secrets and variables → Actions**, add a repository secret named `POLYFORK_CDN`, and paste your account's `cdn_base` link (`https://polyfork.dev/c/<token>/`) as its value.
2. Go to **Settings → Pages** and set **Source** to "GitHub Actions".
3. Push to `main` (or run the job from the **Actions** tab). After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

The job stops without publishing if the secret is missing. To try the CDN-built tour locally, add `kits: 'cdn'` to your `tour/local.js`, or open `tour.html?kits=cdn`. If the link is ever misused, make a new one at polyfork.dev/account#cdn and update the secret (and your `tour/local.js`). The part ids it needs are in `tour/kit-ids.js`; run `node scripts/kit-ids.mjs` after adding or updating a kit.

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
