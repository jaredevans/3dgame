// On foot: how the keys steer you and where the camera sits. Pure maths, no three.js.
// The camera stays above and behind you, looking the way you face, so W always walks into the screen: A and D turn you,
// W and S walk forwards and back. Standing still, dragging the mouse looks round you (an offset from the way you face, and
// a pitch); as soon as you walk, run or turn, the view swings back behind you.
// Yaw convention as walk.js: yaw 0 faces +z, forward is (sin yaw, cos yaw), turning right lowers yaw.

export const FOOT_VIEW = {
  turn: 2.2,        // rad/s, turning on A / D
  distance: 5.4,    // m from the point the camera looks at (your head) back to the camera
  head: 1.6,        // m above your feet: what the camera looks at
  pitch: -0.34,     // rad, looking down at you from above and behind
  minPitch: -1.1, maxPitch: 0.35,
  recentre: 5,      // per second: how fast the view swings back behind you once you move
  drag: { yaw: 3, pitch: 2 },   // rad per screen height dragged
};

// keys { fwd, right: -1..1, run } and a frame's dt -> what the walker does: walk along your heading, turn with A / D
export function footControls({ fwd = 0, right = 0, run = false } = {}, dt) {
  return { fwd: Math.sign(fwd), right: 0, run, yawDelta: -Math.sign(right) * FOOT_VIEW.turn * Math.min(0.1, Math.max(0, dt)) };
}

// view { yaw (offset from your heading), pitch }; moving: walking, running or turning; drag { dx, dy } in screen heights
export function stepFootView(view, { moving, drag = null }, dt) {
  dt = Math.min(0.1, Math.max(0, dt));
  let { yaw, pitch } = view;
  if (moving) {
    const k = 1 - Math.exp(-dt * FOOT_VIEW.recentre);
    yaw -= Math.atan2(Math.sin(yaw), Math.cos(yaw)) * k;   // the short way back round
    pitch += (FOOT_VIEW.pitch - pitch) * k;
  } else if (drag) {
    yaw -= drag.dx * FOOT_VIEW.drag.yaw;
    pitch = Math.min(FOOT_VIEW.maxPitch, Math.max(FOOT_VIEW.minPitch, pitch - drag.dy * FOOT_VIEW.drag.pitch));
  }
  return { yaw, pitch };
}

// where the camera goes and what it looks at, for you at p { x, y, z, yaw } and the view; groundAt(x, z) keeps it out of
// the ground
export function footCamera(p, view, groundAt = () => -Infinity) {
  const h = p.yaw + view.yaw, c = Math.cos(view.pitch);
  const target = { x: p.x, y: p.y + FOOT_VIEW.head, z: p.z };
  const d = FOOT_VIEW.distance;
  const pos = { x: target.x - Math.sin(h) * c * d, y: target.y - Math.sin(view.pitch) * d, z: target.z - Math.cos(h) * c * d };
  pos.y = Math.max(pos.y, groundAt(pos.x, pos.z) + 0.4);
  return { pos, target };
}
