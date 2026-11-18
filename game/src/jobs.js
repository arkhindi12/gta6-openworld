// jobs.js — the five jobs, as data and as a state machine.
//
// A job is a place in the world, a radius, a line for the HUD, a cash reward and a condition. The
// player is never handed a manual: the objective line names the place, and the marker in the
// street, the minimap blip and the distance counter carry the rest.
//
// A job is passed on one of five beats:
//   reach   — stand in the marker on foot
//   deliver — arrive in a car
//   clear   — drop the crew working the marker
//   escape  — reach the marker with no stars lit
//   finish  — reach the marker, any way at all

export const JOBS = [
  {
    id: 'gutter',
    title: 'The Gutter Run',
    beat: 'reach',
    at: { x: 504, z: 1008 },
    radius: 9,
    reward: 350,
    line: 'Meet the courier under the causeway onramp, Riviera Palms',
  },
  {
    id: 'cadence',
    title: 'Pink Cadence',
    beat: 'deliver',
    at: { x: 1008, z: 756 },
    radius: 11,
    reward: 600,
    line: 'Steal the pink drop-top on the Strip and deliver it to the Neon Heights lock-up',
    car: { x: 1506.7, z: 340, kind: 'drop', paint: '#ff2f86' },
  },
  {
    id: 'bodycount',
    title: 'Body Count',
    beat: 'clear',
    at: { x: 1008, z: 1512 },
    radius: 26,
    need: 3,
    reward: 900,
    line: 'Clear the Coral Marina crew: drop three of them inside the marker',
  },
  {
    id: 'shadow',
    title: 'The Long Shadow',
    beat: 'escape',
    at: { x: 756, z: 252 },
    radius: 10,
    reward: 1400,
    line: 'Shake the VMPD, then reach the club on the Sunglass Strip',
  },
  {
    id: 'tide',
    title: 'Last Tide',
    beat: 'finish',
    at: { x: 1150, z: 1550 },
    radius: 11,
    reward: 2600,
    line: 'Get to the Coral Marina jetty, take the boat and do not look back',
  },
];

/** A fresh run: no jobs done, a little walking-around money, nothing on screen. */
export function newStory() {
  return {
    index: 0,
    done: 0,
    cash: 240,
    toast: '',
    toastT: 0,
    passed: [],
    kills: 0,
    shots: 0,
  };
}

/** The job in front of the player, or null once the chain is finished. */
export function currentJob(story) {
  return JOBS[story.index] ?? null;
}

/** Put a line on the HUD for a few seconds. */
export function announce(story, text, seconds = 3.2) {
  story.toast = text;
  story.toastT = seconds;
}

/**
 * Test the current job against the world, and bank it if it passed. `ctx` carries how many of the
 * crew are down inside the marker and the wanted level. Returns the job just passed, or null.
 */
export function testJob(story, dt, player, ctx) {
  story.toastT = Math.max(0, story.toastT - dt);
  const job = currentJob(story);
  if (!job) return null;
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
  const next = currentJob(story);
  if (next) announce(story, `JOB PASSED  +$${job.reward}   ·   NEXT: ${next.title.toUpperCase()}`, 4.2);
  else announce(story, `ALL FIVE JOBS DONE  +$${job.reward}   ·   VICE MERIDIAN IS YOURS`, 6);
  return job;
}

/**
 * The short line under the objective: what the player has to do right now, in the HUD's voice. This
 * is the only place a job's live condition is spelled out.
 */
export function liveCondition(job, player, ctx) {
  if (!job) return '';
  const d = Math.round(Math.hypot(job.at.x - player.x, job.at.z - player.z));
  switch (job.beat) {
    case 'reach':
      return d < job.radius ? 'STEP INTO THE MARKER' : 'GO TO THE MARKER';
    case 'deliver':
      return player.driving ? 'DELIVER THE CAR' : 'TAKE A CAR FIRST';
    case 'clear':
      return `${ctx.crewDown ?? 0} / ${job.need} DOWN`;
    case 'escape':
      return (ctx.stars ?? 0) > 0 ? `${ctx.stars} STARS · SHAKE THEM` : 'CLEAN · GO NOW';
    case 'finish':
      return 'THE BOAT';
    default:
      return `${d} M`;
  }
}