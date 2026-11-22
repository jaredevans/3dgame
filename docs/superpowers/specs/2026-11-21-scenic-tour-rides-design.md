# Scenic Tour Phase 4: the other ways to travel — design

At each place, beside the onward train, a second way to the next place waits: a fishing boat, a jet-boosted hot-air
balloon, a stagecoach, a jet, a flying car. Take it and the trip runs itself: you ride along, watching, while something
spectacular happens on the way, and you're set down at the next place's arrival station to carry on as if you'd come by
train.

Date: 2026-11-21. Status: approved by the owner 2026-11-21 (builder-checked). Builds on Phases 1–3
(docs/superpowers/specs/2026-11-20-scenic-tour-design.md, the base spec, still binding).

Decided with the owner: the five rides and their spectacle as below; the Caique Fishing Boat for the boat; a giant
octopus instead of a whale; large crows instead of vultures; a UFO built in code (a flying saucer with flashing lights);
the ride waits beside the onward train at the departure station (approach A for boarding); each ride follows its own
path with its progress tied to the leg it runs beside (approach A for building); the `Z` auto tour takes the trains only.

## Intent

The trains are the tour's heart: you drive them. The rides are the other half of the fantasy: being taken somewhere in
something extraordinary, with a set piece on the way, and doing nothing but watch. They give each leg a second, very
different way through the same landscape. (The owner hasn't said more about why; this reading is the designer's.)

## Goals

- Five rides, one per leg, onward round the ring:

| Leg | Ride | Crew | On the way |
|---|---|---|---|
| City → Oceanside | the Caique Fishing Boat at speed along the coast | its captain at the wheel | a giant octopus rises out of the sea beside the boat and nearly takes it: arms reaching over the hull, the boat swerving clear |
| Oceanside → Mountain | a hot-air balloon with two jet engines on its basket, to speed it across the route | (the balloon pilot, optional) | large crows circling the canopy above the basket |
| Mountain → Wild West | a wild stagecoach ride on a dirt road over the hills | the driver on the box | a gang on horseback chases it, shooting and trying to stop it; they never do, and fall away |
| Wild West → Futuristic | a sleek jet that flies to and round the rocket launch | (the pilot) | a UFO, a flying saucer with flashing lights, appears and fires lasers at the jet, and misses every time |
| Futuristic → City | a flying car with windows all round its cabin, a 360-degree view | — | other flying cars fly with it in loose formation, some ahead, some behind |

- Fully automatic once taken: no steering, no input needed from boarding to arrival.
- The same continuous world: the ride passes through the landscape between the two places, never a cut-scene or a fade.
- Choosing is part of the walk: you still cross town to the departure station, and choose there.

## Non-goals

- Rides back the way you came: rides go onward only (the train you came on is still there to go back).
- Steering or controlling a ride; stopping or getting off mid-ride.
- The `Z` auto tour using the rides: it takes the trains only (owner).
- Any change to the trains, their events, or how a player drives or walks.

## Anti-goals (a failure even if it works)

- **A fail state.** The octopus, the gang and the UFO never win: no crash, no damage, no "game over". Set pieces are
  scripted near-misses, every ride.
- **Waiting.** A loading pause mid-ride, or a ride that stutters because something is built on a moving frame.
- **Gore or real violence.** The gang's shooting is Western-film spectacle: muzzle flashes, puffs of dust, ricochet
  pings, no one hit, no blood. The lasers are bright bolts and harmless flashes.
- **Breaking the trains.** Taking a ride must leave the trains, the journey state and the next place exactly as a
  train arrival would (or as near as makes no visible difference).
- **Ugly or wrongly scaled.** Models floating, sunk or clipping; the octopus or crows reading as small or silly.

## The rides

**Choosing and boarding** (approach A). At each place's departure station, the ride waits beside the onward train: the
balloon on a launch pad, the stagecoach in the station yard, the jet on a hardstanding by the line, the flying car on a
landing pad. **The boat is the one exception** (owner, 2026-11-21): neither of its stations is at the water (Downtown
City's departure platform stands ~300 m inland with the town between it and the sea), so it waits at a jetty on the
City's seafront, signposted from the departure station (the walk through town to it is still a walk across town), and
lands at Oceanside's harbour, beside the station the Highland Climber leaves from (so there you can board the onward
train without crossing town). On foot, walking up to it gives the prompt "Take the <ride> to <next place> (E)";
walking up to the train gives the train's prompt as now. Boarding waits on the same readiness as the train
(the leg, both places and the next place's arrival station built: `readyToLeave`), with the same "Getting … ready"
message.

**Riding.** About 90 seconds, like a train leg. You start in a seat aboard (beside the captain at the wheel; in the
basket; on the coach's roof seat beside the driver; in the jet's cockpit; inside the glass cabin) and `V` cycles that
seat view, a chase view and the director (which films the ride and its set piece the way it films the trains). Mouse
look works in the seat view as in the cab. The map (`M`) shows your dot moving along the ride's path. The HUD shows the
ride and where it's going ("Speedboat to Oceanside"), no throttle or speed panel.

**The paths** (near the railway, each its own):
- Boat: from the jetty on Downtown City's seafront, along the coast at sea level (the cliffs on the right, as the train
  sees them on the left), into Oceanside's harbour by its shore station (the Highland Climber's).
- Balloon: up from the launch pad to about 150 m over the forest, the viaduct and the waterfall, jets pushing it along,
  descending to a pad by the Mountain's arrival station.
- Stagecoach: a new dirt road over the hills from the Mountain's station yard to the Wild West's arrival station (the
  railway's canyon is a slot too narrow for a road: the road takes its own way over the land beside it). The road is
  drawn on the land; the coach follows the ground, bouncing.
- Jet: a short take-off from a hardstanding by the Wild West's departure station, out across the desert, a wide circle
  round the rocket pad (Task 6's launch, where it already stands, ~5.5 km off the line: the jet's pass and the rocket's
  flight timed together, the ride triggering the launch itself), and a landing on an apron by the Futuristic place's
  arrival station. That's some 15–17 km in about 90 s: **the jet is fast**, cruising at ~750–800 km/h low over the
  desert (owner, 2026-11-21: the speed is the thrill; the pad is not moved).
- Flying car: up from a pad at the Futuristic place's departure station, over the suburbs and the river, in among the
  downtown towers, down to a pad by the City's arrival station.

**What else happens on the way** (designer's call): during a ride, the leg's train events don't play — the crossings,
the signal and work train, the cattle, the passing freight and bullet, and the animals that follow or race the train
(gulls, dolphins, riders, horses, tumbleweeds, Task 5's stagecoach) are all keyed to the train you drive. What you see
is the ride's own set piece, the leg's static scenery (the lighthouse, the boats offshore, the wind and solar farm, the
flying pods round the towns) and, on the jet ride, the rocket launch. That also keeps the boat clear of the dolphins,
who swim where it runs, and avoids a second stagecoach on the canyon leg.

**Arriving.** The ride sets down at its landing spot by the next place's arrival station (the boat at Oceanside's
harbour) and you step off onto the walk there, on foot, exactly as after getting out of a train. The train that runs back along that leg is
standing at that arrival platform facing back (as if it had brought you), put there before you land and out of your
sight, so going back is the same as after a train.

**The sky** follows your progress along the ride as it would along the leg, so each ride passes through its leg's light
(the boat in the morning, the jet at dusk into night, the flying car at sunrise).

## Models

| Thing | Source |
|---|---|
| Boat | Polyfork Caique Fishing Boat `caique-fishing-boat-262c24` (7.3 m; rigged) |
| Captain | the Coast and Boardwalk kit's `fisherman` (a humanoid; Polyfork's clips for the seated/standing pose) |
| Giant octopus | Polyfork `octopus-base` (3.45 m with its arms splayed, clips Idle, Swim, Swim fast, Swim backward), **scaled up to a giant** (~5×, some 15–20 m across) — the owner's decision; Polyfork advises never scaling models, so this is a deliberate exception. Whether its arms can be posed one by one (for "arms reaching over the hull") is checked in planning; if not, the clips and the scale carry it |
| Balloon | built in code (Polyfork's only hot-air balloon is a 2.6 m miniature): an envelope ~20 m tall in bright panels, a wicker basket, burners, and two jet engines on the basket's sides with exhaust glow |
| Large crows | Polyfork `crow-base` (0.45 m, clips Walk, Idle, Run, Fly), **scaled up 3–4×** — the owner's decision, as above |
| Stagecoach, horses | the Frontier Town kit's `stagecoach`; Polyfork `saddled-horse-da86d3` / `wild-horse-047e93` (clips Walk, Idle, Run) — as Task 5 uses |
| Gang | the Frontier Town kit's `outlaw-character` on saddled horses (the `Sitting` clip, as Task 5's riders) |
| Jet | Polyfork `business-jet-684611` (17 m, swept wings, rear engines; rigged) |
| UFO | built in code: a flying saucer, a ring of flashing lights, a glowing underside, laser bolts |
| Flying car and escort | the Chrome Arcology kit's `commuter-hover-pod` (and `hover-cargo-skiff` for variety in the escort), with a glass cabin all round for the one you ride in (a code-built glazed cabin fitted to it if the pod's own windows don't give a 360-degree view) |

All Polyfork parts load through the tour's existing loaders (`cdnPart`, `loadAnimal`, kit `part`), self-hosted in
`kits/parts/` by `scripts/extract-parts.mjs`, HD where an HD edition exists (as the trains and animals now are).

## Sound

Each ride its own engine and air: the boat's outboard roar and spray; the balloon's burner whoosh and the jets' whine;
hooves, wheels and the coach's creak; the jet's engines; the flying car's hum. Set-piece sounds: the octopus's splash
and surge; Western gunshots as cap-gun cracks and ricochet pings; laser zaps; the escort's passing whoosh. Made with
WebAudio, like the horns (no sound files).

## How it's built (decided)

- **Each ride follows its own path, its progress tied to the leg it runs beside** (approach A). A ride's path is its own
  smooth 3D curve (in the world's metres), and its timeline (speed along the path, set pieces, camera moments) is pure
  data, like the legs' events. As you ride, your position is converted to the matching position along the railway leg
  (the nearest leg-s, or a mapping laid out with the path), and that drives everything already keyed to the leg: what's
  loaded (the streaming), the time of day, the director's camera.
- **A ride is a new way of being on the journey** beside driving and walking: journey.js gains it (riding a leg's ride,
  onward), so the page, the HUD, the map and the views know where you are.
- **Approaches considered.** A (chosen): own paths keyed to the leg — fits five very different vehicles and keeps the
  world continuous. B: rides as "trains" on invisible tracks driven by the train code — reuses more, but the train
  logic (platforms, buffers, stopping marks, the reactions) would have to be switched off piece by piece, and a gang
  chase or a loop round the rocket doesn't fit it. C: a cut-scene with a fade — cheapest, but breaks the one
  continuous world (the base spec's anti-goal "a loading screen between legs").
- **Nothing is built on a moving frame**: the rides, their set pieces and their landing spots are built while you stand
  at the place (as the trains are), and boarding waits for them.

## Constraints

- The base spec's constraints stand: three.js 0.180.0 through the import map, no build step, static files; Polyfork kits
  self-hosted and never committed; `stage()` lighting with no ACES at exposure 1; real metres (bar the owner's two
  scaling exceptions); desktop browser, mouse and keyboard.
- No fail state; nothing built on a moving frame; no loading pause while riding.
- The trains, their events, the director's train shots, the map and the signs keep working as now.
- Smooth on a machine that runs the tour smoothly now.

## Left to the builder

- Each path's exact line, heights and speeds, within "about 90 seconds" and the descriptions above; where each jetty,
  pad, yard, hardstanding and apron stands (beside its station, on the town side or the other, clear of the line and
  the walk).
- The set pieces' choreography and timing: when and where the octopus rises, how close its arms come; how many crows and
  how they circle; the gang's size, how they ride up and fall away; the UFO's approach and its lasers' misses; the
  escort's formation.
- The stagecoach road's line over the hills and how it's drawn on the land.
- The camera views per ride (the seat's place and look, the chase distance), and the director's shots for each ride's
  set piece.
- How the ride's progress maps to leg-s (nearest point, or laid out along the path).
- The balloon's and the UFO's look in the low-poly style; whether the balloon has a pilot; the escort's size.
- How the walk worlds take in the new jetties and pads (solids, approaches), so the walk across town still works.

## Done when

- At every place's departure station, the ride waits beside the train, and either can be taken.
- All five rides run start to finish on their own, about 90 seconds each, with their set piece every time, and none can
  fail.
- Each ride sets you down at the next place's arrival station, on foot, with the train back waiting at its platform.
- `V` cycles the seat, chase and director views on every ride; the map shows you moving.
- No loading pause during a ride; no console errors; the trains and the `Z` auto tour work as before.
