# Candy Dash — project brief

You're a kid in a caped hero costume, out trick-or-treating at dusk. Run through the neighbourhood and collect candy from every front door before the timer runs out, while a ghost drifts after you.

Every line under "Decisions" answers a question a developer would otherwise have to stop and ask. They are proposed defaults: change any of them before development starts.

## Decisions

**Platform and view**
- Desktop browser only, keyboard only. No mobile or touch, no gamepad.
- Controls: WASD or arrow keys to move, Shift to run. No jump, no mouse.
- Camera: third-person, behind and above the player, following automatically.

**The place**
- The Polyfork Halloween Night kit, built whole with its own layout and ground (about 86 x 88 m).
- Lit as dusk using the kit's own lighting, so windows, lamps and jack-o'-lanterns glow. No ACES tone mapping.
- Buildings, fences and vehicles block the player.
- The 50 or so kids and parents already standing in the kit stay as decoration; the player walks through them.

**Player**
- The Kid in a Caped Hero Costume, with walk and run animation.
- The four copies of that model already standing in the kit are removed so the player is the only one.
- Starts at a clear spot near the central crossroads.

**Candy points**
- One Neighbour Handing Out Candy stands at each front door marked by a wreath. Door positions are read from the kit at load time (expect about 8).
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
- three.js with plain JavaScript modules. No framework, no build step, no backend.
- Runs from a local static web server (it will not open straight from the file system).
- three.js, the kit and the ghost model are all stored locally, so the game runs without internet during the demo.

## Out of scope

Multiplayer, mobile, sound and music, saved high scores, multiple levels, difficulty settings, more than one ghost.

## Done when

- The neighbourhood loads at dusk and the player can run around it without passing through buildings.
- Every wreath-marked door gives candy exactly once and the HUD counts it.
- The ghost chases, costs a heart on touch, and resets.
- Both ways of losing and the one way of winning reach the end screen, and Enter restarts a fresh game.

## Open question

Should the downloaded kit files be committed to the GitHub repo, or kept out of git and re-downloaded on each machine? This affects repo size and how the Polyfork licence applies to a public repo.
