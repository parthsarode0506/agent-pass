// Web Audio API Y2K Sound Effects Synthesizer
// Synthesizes authentic retro computer chimes, dial-up handshakes, and sirens.

let audioCtx = null;
let isMuted = false;

function getAudioContext() {
  if (isMuted) return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setMuted(muted) {
  isMuted = muted;
  if (muted && audioCtx) {
    audioCtx.close().then(() => { audioCtx = null; });
  }
}

export function getMuted() {
  return isMuted;
}

/**
 * Ascending futuristic Y2K startup chime (ascending chord with FM bell quality)
 */
export function playStartup() {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4 to C6 chord
  
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const gain = ctx.createGain();
    
    // Add metallic ring modulator quality
    modulator.frequency.setValueAtTime(freq * 1.5, now + idx * 0.05);
    modGain.gain.setValueAtTime(100, now + idx * 0.05);
    modGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.6);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.05);
    
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.setValueAtTime(0.05, now + idx * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.8);
    
    modulator.connect(modGain);
    modGain.connect(osc.frequency);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    modulator.start(now + idx * 0.05);
    osc.start(now + idx * 0.05);
    
    modulator.stop(now + idx * 0.05 + 0.8);
    osc.stop(now + idx * 0.05 + 0.8);
  });
}

/**
 * 1.5-second clipped modem dial-up handshake sound (synthesized squelch and sweeps)
 */
export function playDialUp() {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  
  // Wave 1: dial tone
  const toneOsc = ctx.createOscillator();
  const toneGain = ctx.createGain();
  toneOsc.type = 'sine';
  toneOsc.frequency.setValueAtTime(350, now); // Dual-frequency mix simulation
  toneGain.gain.setValueAtTime(0.03, now);
  toneGain.gain.setValueAtTime(0, now + 0.3);
  toneOsc.connect(toneGain);
  toneGain.connect(ctx.destination);
  toneOsc.start(now);
  toneOsc.stop(now + 0.35);
  
  // Wave 2: frequency sweep / dialing beeps
  const sweepOsc = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweepOsc.type = 'triangle';
  
  // Beep-beep beeps
  sweepOsc.frequency.setValueAtTime(800, now + 0.3);
  sweepGain.gain.setValueAtTime(0.04, now + 0.3);
  sweepGain.gain.setValueAtTime(0, now + 0.45);
  
  sweepOsc.frequency.setValueAtTime(1200, now + 0.5);
  sweepGain.gain.setValueAtTime(0.04, now + 0.5);
  sweepGain.gain.setValueAtTime(0, now + 0.65);
  
  // Modem handshake scratching (filtered noise)
  // Create noise buffer
  const bufferSize = ctx.sampleRate * 0.8;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = buffer;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, now + 0.7);
  filter.frequency.exponentialRampToValueAtTime(1800, now + 1.5);
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.06, now + 0.7);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  
  noiseNode.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  
  sweepOsc.connect(sweepGain);
  sweepGain.connect(ctx.destination);
  
  sweepOsc.start(now + 0.3);
  sweepOsc.stop(now + 0.7);
  
  noiseNode.start(now + 0.7);
  noiseNode.stop(now + 1.5);
}

/**
 * Standard Y2K Alert sound (ZoneAlarm notification open)
 */
export function playAlert() {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(450, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
  
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.25);
}

/**
 * Access Granted sparkling upward chime
 */
export function playChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5 to G6 arpeggio
  
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.05);
    
    gain.gain.setValueAtTime(0.06, now + idx * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now + idx * 0.05);
    osc.stop(now + idx * 0.05 + 0.2);
  });
}

/**
 * Access Denied low harsh warning buzz (with shake animation trigger)
 */
export function playBuzz() {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(100, now);
  
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(101.5, now); // Detuned for fatness
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);
  
  osc1.start(now);
  osc2.start(now);
  
  osc1.stop(now + 0.35);
  osc2.stop(now + 0.35);
}

/**
 * Aggressive dual-tone siren for Intrusion Detected escalation
 */
export function playSiren() {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  const duration = 2.5; // Play for 2.5 seconds
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, now);
  
  // Sweep frequency up and down aggressively
  for (let t = 0; t < duration; t += 0.4) {
    osc.frequency.setValueAtTime(450, now + t);
    osc.frequency.setValueAtTime(300, now + t + 0.2);
  }
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.linearRampToValueAtTime(0.08, now + duration - 0.2);
  gain.gain.linearRampToValueAtTime(0.001, now + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + duration);
}
