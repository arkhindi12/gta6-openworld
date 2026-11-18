// save.js — the run, remembered.
//
// One key in localStorage holds the job chain, the cash banked and the ids already passed. It is
// read once at boot and written after every job and after an arrest, so closing the tab loses a
// shootout and not a career.
//
// A save is a user-editable text file sitting in a browser, so loading clamps everything: an index
// past the end of the chain, a negative bank balance, a passed list full of junk. Nothing here
// trusts the file it reads.

const STORE_KEY = 'vice-meridian/career/v2';

/**
 * Remember the story. Storage can refuse — a private window, a full quota — and the run simply is
 * not remembered, which is not worth an exception.
 */
export function remember(story) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ index: story.index, done: story.done, cash: story.cash, passed: story.passed }));
  } catch {
    // Nothing to do: the game carries on from memory.
  }
}

/** Fold a saved run back into a fresh story. Returns true when there was one worth resuming. */
export function recall(story, jobCount) {
  let raw = null;
  try {
    raw = window.localStorage.getItem(STORE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    const index = Math.max(0, Math.min(jobCount, Math.floor(Number(data.index) || 0)));
    story.index = index;
    story.done = Math.max(0, Math.min(index, Math.floor(Number(data.done) || index)));
    story.cash = Math.max(0, Math.min(1e7, Math.floor(Number(data.cash) || 0)));
    story.passed = Array.isArray(data.passed) ? data.passed.slice(0, jobCount).map(String) : [];
    return index > 0;
  } catch {
    return false;
  }
}

/** Forget the run, so the title card offers a clean town. */
export function forget() {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // As above.
  }
}

export { STORE_KEY };