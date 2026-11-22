# Scenic Tour: Teleport (`T`) — short design

Date: 2026-11-21. Status: approved by the owner 2026-11-21. Builds on the base spec
(docs/superpowers/specs/2026-11-20-scenic-tour-design.md).

The owner asked: "add 't' Teleport to teleport to a location. The conductor will fizz out and fizz in like star trek
teleportation system".

## What it does

- **`T` opens a small "Teleport to…" list** of the five places, numbered 1–5 (the place you're at shown but not
  offered). A number picks one; `T` again or `Esc` cancels.
- **When:** on foot, or in the cab while the train stands still (|v| < 0.05). While the train moves, `T` does nothing.
  The train you leave stays where it stopped (as after getting out).
- **Fizz out** (~1.5 s): a column of shimmering sparkles rises round the conductor (or round the cab's seat when you
  teleport from a train) while the figure dissolves from the feet up; a rising, shimmering tone (WebAudio).
- **In between:** if the destination's place and stations aren't built yet, the view holds on a sparkle-filled beam
  (a full-screen shimmer over a faint view) until they are, then the fizz-in. This is the one accepted wait, since
  teleporting is magic. It's bounded like the arrival cover (it never locks you in: past `WAIT_MAX` it lands once the
  destination place itself is in).
- **Fizz in** (~1.5 s): the same in reverse, at the destination's arrival station, on foot where you'd step off a train
  (the station's step-out point on its platform). The two trains that serve that place are put at their platforms out
  of sight, as after a train arrival.
- **The auto tour:** if it's running, it carries on round the ring from the new place.
- An original sparkle effect in that spirit — a shimmer column and dissolve — not a copy of any show's visuals or sound.

## How it's built (decided)

- Journey: `journey.teleport(state, placeId) -> { state (on foot at placeId), trains }` (as `landed`/`arrive`).
- Streaming: the destination becomes "where you are" for the wanted set as soon as you fizz out, so it starts building
  behind the beam; nothing is built on a moving frame (you're not moving).
- The effect is a small module (shimmer column particles + a dissolve on the figure's materials by height), pure timing
  logic three-free with tests.

## Left to the builder

The list's look (match the HUD's panels), the shimmer's colours and particle count, the dissolve technique, the tone.

## Done when

`T` teleports between all five places on foot and from a stopped train, the fizz plays out and in, you land on foot at
the destination's arrival station with its trains in place, the auto tour carries on after a teleport, `T` does nothing
while moving, no console errors.
