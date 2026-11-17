// Sound, synthesised: no audio file ships with the game and nothing is sampled from anyone.
//
// The engine is two detuned oscillators through a low-pass filter that opens with speed; the siren
// is a sine swept by a slow LFO; gunfire is a short noise burst with a fast decay over a low thump;
// the city is a quiet bed of filtered noise. All of it is built on the WebAudio graph the first
// time the player clicks or presses a key, because browsers refuse to start a context before a
// gesture — and the whole bus is muted with M.

export function makeAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let siren = null;
  let bed = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx = new AudioCtor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // The engine: two oscillators into a filter into a gain the frame loop writes.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 46;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 69;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    oscA.start();
    oscB.start();
    engine = { gain: engineGain, filter, oscA, oscB };

    // The siren: one sine, swept between two notes by a triangle LFO.
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 720;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.55;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 210;
    lfo.connect(lfoDepth);
    lfoDepth.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    lfo.start();
    siren = { gain: sirenGain, osc: sirenOsc };

    // The city: brown-ish noise through a band-pass, very quiet.
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.6;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.05;
    src.connect(band);
    band.connect(bedGain);
    bedGain.connect(master);
    src.start();
    bed = { gain: bedGain, src };
    return ctx;
  }

  /** Called on the first click or key: browsers will not start a context without a gesture. */
  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  /** Called every frame with the player's speed, whether they drive, and the wanted level. */
  function frame({ speed = 0, driving = false, stars = 0, near = 1 } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const s = Math.min(1, Math.abs(speed) / 40);
    engine.gain.gain.setTargetAtTime(driving ? 0.05 + s * 0.13 : 0, t, 0.08);
    engine.filter.frequency.setTargetAtTime(280 + s * 1900, t, 0.1);
    engine.oscA.frequency.setTargetAtTime(38 + s * 74, t, 0.12);
    engine.oscB.frequency.setTargetAtTime(57 + s * 96, t, 0.12);
    siren.gain.gain.setTargetAtTime(stars > 0 ? 0.018 + near * 0.02 : 0, t, 0.2);
    siren.osc.frequency.setTargetAtTime(560 + stars * 40, t, 0.3);
    bed.gain.gain.setTargetAtTime(0.045, t, 0.5);
  }

  /** A pistol shot: a noise crack over a low thump. `loud` scales with how close the shooter is. */
  function gunshot(loud = 1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const dur = 0.22;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const k = i / data.length;
      data[i] = (Math.random() * 2 - 1) * (1 - k) ** 5 * (0.8 + Math.random() * 0.2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5 * loud;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 2400;
    src.connect(low);
    low.connect(gain);
    gain.connect(master);
    src.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(0.35 * loud, t);
    thump.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(thump);
    thump.connect(master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** The cash register: three rising triangle notes. */
  function cash() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    [880, 1320, 1760].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.24);
    });
  }

  /** Mute or unmute everything. Returns the new state. */
  function toggle() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    return muted;
  }

  return {
    resume,
    frame,
    gunshot,
    cash,
    toggle,
    get muted() {
      return muted;
    },
  };
}