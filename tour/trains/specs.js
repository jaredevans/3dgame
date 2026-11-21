// The five trains of the Scenic Tour, one per leg. Pure data, no three.js.
// top speed in m/s, acceleration and braking in m/s²; sound is the horn or whistle, cab the interior built for it.
// cars: [kit part key, knobs, flip?] from `kit` (Countryside Railway unless named); or a `builder` for a train made in code.
// ride: a kit train's cars stand this far up from the formation (the line's level) if not on it.
import { KITS } from '../config.js';
import { SHUTTLE } from './shuttle-shape.js';

const coach = (extra = {}) => ({ colorway: 'royal-blue', era: 'royal-blue', length: 18, wear: 0.2, ...extra });

export const TRAIN_SPECS = {
  // City -> Oceanside: a blue mainline diesel with coaches, the seaside excursion
  cityOcean: {
    name: 'Seaside Excursion', sound: 'diesel', cab: 'diesel', top: 100 / 3.6, accel: 1.0, brake: 1.2,
    kit: KITS.railway,
    cars: [
      ['mainline-diesel', { colorway: 'royal-blue', livery: 'royal-blue', bogies: 'bo-bo', wear: 0.15 }],
      ['passenger-carriage', coach()],
      ['passenger-carriage', coach({ wear: 0.3 })],
      ['brake-coach', coach()],
    ],
  },
  // Oceanside -> Mountain: a saddle-tank engine and two old green coaches, slow up the climb
  oceanMountain: {
    name: 'Highland Climber', sound: 'steam', cab: 'steam', top: 60 / 3.6, accel: 0.5, brake: 0.8,
    kit: KITS.railway,
    cars: [
      ['tank-locomotive', { colorway: 'signal-red', livery: 'signal-red', tanks: 'saddle' }],
      ['passenger-carriage', { colorway: 'green', era: 'green', length: 15.5 }],
      ['passenger-carriage', { colorway: 'green', era: 'green', length: 15.5 }],
    ],
  },
  // Mountain -> Wild West: a tender engine and wooden (teak) cars
  mountainWest: {
    name: 'Canyon Express', sound: 'steam', cab: 'steam', top: 90 / 3.6, accel: 0.7, brake: 1.0,
    kit: KITS.railway,
    cars: [
      ['tender-locomotive', { colorway: 'deep-green', livery: 'deep-green' }],
      ['coal-tender', { colorway: 'deep-green', livery: 'deep-green' }],
      ['passenger-carriage', { colorway: 'teak', era: 'teak' }],
      ['passenger-carriage', { colorway: 'teak', era: 'teak' }],
      ['passenger-carriage', { colorway: 'teak', era: 'teak' }],
      ['brake-coach', { colorway: 'teak', era: 'teak' }],
    ],
  },
  // Wild West -> Futuristic: the bullet train, built in code (Polyfork has none)
  westFuture: {
    name: 'Silver Arrow', sound: 'bullet', cab: 'future', top: 300 / 3.6, accel: 2.5, brake: 2.5,
    builder: 'bullet', carCount: 4,
  },
  // Futuristic -> City: a short rake of the Chrome Arcology's guideway shuttles, a raked nose at each end of the unit (the
  // last car turned round) and a blunt one between them, gliding just over the guideway's deck and the rails
  futureCity: {
    name: 'Metro Glide', sound: 'future', cab: 'future', top: 120 / 3.6, accel: 1.0, brake: 1.2,
    kit: KITS.future, ride: SHUTTLE.ride,
    cars: [
      ['guideway-rail-shuttle', {}],
      ['guideway-rail-shuttle', { nose: 0 }],
      ['guideway-rail-shuttle', {}, true],
    ],
  },
};
