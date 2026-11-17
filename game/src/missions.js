// The five jobs, as data and as a state machine.
//
// A job is a place in the world, a radius, a line for the HUD, a cash reward and a condition. The
// player is never handed a manual: the objective line names the place, and the marker on the
// street, the minimap blip and the distance counter carry the rest.
//
// Each job has a beat that decides how it is passed:
//   reach   - stand in the marker on foot
//   deliver - arrive in a car
//   clear   - drop the crew working the marker
//   escape  - reach the marker with no stars lit
//   finish  - reach the marker, any way at all
//
// The chain, in five beats:
//   1. The Gutter Run    a bag waits under the causeway onramp in Riviera Palms. Pick it up.
//   2. Pink Cadence      take the pink drop-top on Sunglass Strip to the Neon Heights lock-up.
//   3. Body Count        the crew that lifted the bag is holding court at Coral Marina. Clear it.
//   4. The Long Shadow   shake the law, then reach the club on Sunglass Strip.
//   5. Last Tide         get to the marina jetty and leave on the boat.

export const JOBS = [
  {
    id: 'gutter',
    title: 'The Gutter Run',
    beat: 'reach',
    at: { x: 560, z: 1000 },
    radius: 7,
    reward: 350,
    line: 'Meet the courier under the causeway onramp, Riviera Palms',
  },
  {
    id: 'cadence',
    title: 'Pink Cadence',
    beat: 'deliver',
    at: { x: 930, z: 960 },
    radius: 9,
    reward: 600,
    line: 'Steal the pink drop-top on Sunglass Strip and deliver it to the Neon Heights lock-up',
    car: { x: 1500, z: 360, kind: 'drop', paint: '#ff2f86' },
  },
  {
    id: 'bodycount',
    title: 'Body Count',
    beat: 'clear',
    at: { x: 1130, z: 1720 },
    radius: 26,
    need: 3,
    reward: 900,
    line: 'Clear the Coral Marina crew: drop three of them inside the marker',
  },
  {
    id: 'shadow',
    title: 'The Long Shadow',
    beat: 'escape',
    at: { x: 760, z: 120 },
    radius: 8,
    reward: 1400,
    line: 'Shake the Vice Meridian PD, then reach the Sunglass Strip club',
  },
  {
    id: 'tide',
    title: 'Last Tide',
    beat: 'finish',
    at: { x: 1680, z: 1860 },
    radius: 9,
    reward: 2600,
    line: 'Get to the Coral Marina jetty. Take the boat and do not look back.',
  },
];

/** A fresh run: no jobs done, a little walking-around money, no toast on screen. */
export function newStory() {
  return {
    index: 0,
    done: 0,
    cash: 240,
    toast: '',
    toastT: 0,
    timer: 0,
    passed: [],
    kills: 0,
    shots: 0,
  };
}

/** The job in front of the player, or null when the chain is finished. */
export function currentJob(story) {
  return JOBS[story.index] ?? null;
}

/** Put a line on the HUD for a few seconds. */
export function announce(story, text, seconds = 3.2) {
  story.toast = text;
  story.toastT = seconds;
}

/**
 * Test the current job against the world and bank it if it passed. `ctx` carries the player, how
 * many of the crew are down inside the marker, and the wanted level. Returns the job that was
 * passed on this call, or null.
 */
export function testJob(story, dt, player, ctx) {
  story.toastT = Math.max(0, story.toastT - dt);
  const job = currentJob(story);
  if (!job) return null;
  story.timer += dt;
  const d = Math.hypot(job.at.x - player.x, job.at.z - player.z);

  let passed = false;
  switch (job.beat) {
    case 'reach':
      passed = d < job.radius && !player.driving;
      break;
    case 'deliver':
      passed = d < job.radius && !!player.driving;
      break;
    case 'clear':
      passed = (ctx.crewDown ?? 0) >= job.need;
      break;
    case 'escape':
      passed = d < job.radius && (ctx.stars ?? 0) === 0;
      break;
    case 'finish':
      passed = d < job.radius;
      break;
    default:
      passed = false;
  }
  if (!passed) return null;

  story.cash += job.reward;
  story.done += 1;
  story.passed.push(job.id);
  story.index += 1;
  story.timer = 0;
  const next = currentJob(story);
  if (next) announce(story, `JOB PASSED  +$${job.reward}   ·   NEXT: ${next.title.toUpperCase()}`, 4.2);
  else announce(story, `ALL FIVE JOBS DONE  +$${job.reward}   ·   VICE MERIDIAN IS YOURS`, 6);
  return job;
}

/**
 * The short line under the objective: what the player has to do right now, in the HUD's voice.
 * This is the only place the live condition of a job is spelled out.
 */
export function liveCondition(job, player, ctx) {
  if (!job) return '';
  const d = Math.round(Math.hypot(job.at.x - player.x, job.at.z - player.z));
  switch (job.beat) {
    case 'reach':
      return d < job.radius ? 'STEP INTO THE MARKER' : `${d} M`;
    case 'deliver':
      return player.driving ? `${d} M · IN A CAR` : `${d} M · NEED A CAR`;
    case 'clear':
      return `${ctx.crewDown ?? 0} / ${job.need} DOWN`;
    case 'escape':
      if ((ctx.stars ?? 0) > 0) return `${ctx.stars} STARS · SHAKE THEM`;
      return d < job.radius ? 'CLEAN · IN THE MARKER' : `${d} M · CLEAN`;
    case 'finish':
      return `${d} M · THE BOAT`;
    default:
      return `${d} M`;
  }
}
