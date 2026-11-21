// The Metro Glide's car: the Chrome Arcology's guideway-rail-shuttle at its defaults (length 10, nose 0.6, glazing 0.5),
// measured in the page (its box, and rays cast at its middle) for its cab. Pure numbers, no three.js: cabs/shuttle.js
// lines the cab from them and the Node tests check them.
// The car faces +z, its origin on the ground at its middle. Its body is lofted up through levels, each a rounded
// rectangle in plan: half-width hw, front zf (the raked windscreen leans back as it rises), front corners rounded cf.
// Under the body a skirt pod at each end runs down to y 0, the widest thing on it (1.505 m from its centre line).

export const SHUTTLE = {
  tip: 5.14,          // the pods' noses, past the body's front (5.0)
  width: 3.01,        // across the pods
  roof: 3.2,
  door: 1.9,          // its side doors and their pockets, within this of its middle
  lamps: 0.95,        // the head lamp band across its front, 0.82..0.95
  // its pods' undersides this far above the formation: a few cm over the guideway's deck (0.30, structures.js
  // GUIDE_DECK) and, off the guideway, over the rail tops (0.30)
  ride: 0.33,
};

// the glass band round its flanks and across the windscreen, from the belt line up to its head
export const GLASS = [1.37, 2.74];

// the body's levels from the white band up to the roof: [y, hw, zf]
const LEVELS = [
  [0.45, 1.25, 4.95], [0.52, 1.3, 5.0], [0.82, 1.327, 5.0], [0.95, 1.328, 5.0],
  [1.37, 1.317, 5.0], [2.12, 1.266, 4.6], [2.74, 1.225, 4.02], [3.0, 1.07, 3.51], [3.13, 0.96, 3.24], [3.2, 0.86, 3.06],
];
const CORNER = 0.55;

function at(y, k) {
  if (y <= LEVELS[0][0]) return LEVELS[0][k];
  for (let i = 1; i < LEVELS.length; i++) {
    const [y0] = LEVELS[i - 1], [y1] = LEVELS[i];
    if (y <= y1) return LEVELS[i - 1][k] + (LEVELS[i][k] - LEVELS[i - 1][k]) * (y - y0) / (y1 - y0);
  }
  return LEVELS[LEVELS.length - 1][k];
}
// the body's half-width and its front (on the centre line), at height y
export const halfAt = (y) => at(y, 1);
export const frontAt = (y) => at(y, 2);
// the front corners' radius at height y
export const cornerAt = (y) => Math.min(CORNER, halfAt(y) - 0.12);
// the heights the lining is lofted through, from the cab's floor to the roof
export const levelsFrom = (floor) => [floor, ...LEVELS.map(([y]) => y).filter((y) => y > floor + 0.01)];

// the cab fitCab clips out of the front car: from behind the windscreen's pillars back to a wall clear of the doors,
// above a floor just over the head lamps (the lamps and the lower nose stay on the shell), the whole windscreen and the
// front of the roof with it (the shell's glass is opaque: cabs/shuttle.js puts glass where it was). The driver sits in
// the middle, eye 1.23 m over the floor and 1.5 m behind the windscreen at that height: far enough back that the
// windscreen's pillars, its sill and head and the console frame the line ahead (nearer, the glass fills the whole view).
export const SHUTTLE_CAB = { zBack: 2.2, zFront: 5.2, floor: 0.97, roof: SHUTTLE.roof, half: 1.33, eye: [0, 2.2, 3.0] };
