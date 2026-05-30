const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const hudWeapon = document.querySelector("#weapon");
const hudStatus = document.querySelector("#status");
const hudEvents = document.querySelector("#events");
const hudScore = document.querySelector("#score-hud");
const hudControls = document.querySelector(".controls");
let lastVehicleState = null;

let gameStarted = false;
let score = 0;
let highScore = localStorage.getItem("gta_highscore") || 0;

const WORLD = { w: 3140, h: 1950 };
const ROAD_HALF_W = 28;
const BUILDING_ROAD_BUFFER = 16;
const keys = new Set();
const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

let gameTime = 60;
let isRaining = false;
let weatherTimer = 30;
let rainParticles = [];

// --- AUDIO SYSTEM ---
let audioCtx = null;
let engineOsc = null;
let engineFilter = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let noiseBuffer = null;
let waveFilter = null;
let waveGain = null;
let waveSource = null;
let screechFilter = null;
let screechGain = null;
let screechSource = null;

function createNoiseBuffer() {
  const bufferSize = audioCtx.sampleRate * 0.5;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  engineOsc = audioCtx.createOscillator();
  engineFilter = audioCtx.createBiquadFilter();
  engineGain = audioCtx.createGain();
  
  engineOsc.type = "sawtooth";
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 400; // Muffled engine rumble
  
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineGain.gain.value = 0;
  engineOsc.start();
  
  sirenOsc = audioCtx.createOscillator();
  sirenGain = audioCtx.createGain();
  sirenOsc.type = "sine";
  sirenOsc.frequency.value = 700;
  sirenOsc.connect(sirenGain);
  sirenGain.connect(audioCtx.destination);
  sirenGain.gain.value = 0;
  sirenOsc.start();
  
  noiseBuffer = createNoiseBuffer();
  
  waveFilter = audioCtx.createBiquadFilter();
  waveFilter.type = "lowpass";
  waveFilter.frequency.value = 400;
  waveGain = audioCtx.createGain();
  waveGain.gain.value = 0;
  waveSource = audioCtx.createBufferSource();
  waveSource.buffer = noiseBuffer;
  waveSource.loop = true;
  waveSource.connect(waveFilter);
  waveFilter.connect(waveGain);
  waveGain.connect(audioCtx.destination);
  waveSource.start();

  screechFilter = audioCtx.createBiquadFilter();
  screechFilter.type = "bandpass";
  screechFilter.frequency.value = 1200;
  screechFilter.Q.value = 2.5;
  screechGain = audioCtx.createGain();
  screechGain.gain.value = 0;
  screechSource = audioCtx.createBufferSource();
  screechSource.buffer = noiseBuffer;
  screechSource.loop = true;
  screechSource.connect(screechFilter);
  screechFilter.connect(screechGain);
  screechGain.connect(audioCtx.destination);
  screechSource.start();

  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playBirdSound(distance) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(2000 + Math.random() * 1000, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(3000 + Math.random() * 2000, audioCtx.currentTime + 0.1);
  osc.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 500, audioCtx.currentTime + 0.2);
  
  const vol = Math.max(0, 0.12 - (distance / 3000));
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.05);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

function playHornSound(distance) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = "sawtooth";
  osc.frequency.value = 400 + Math.random() * 50;
  osc2.type = "sawtooth";
  osc2.frequency.value = osc.frequency.value * 1.25;
  
  const vol = Math.max(0, 0.18 - (distance / 1200));
  const duration = 0.3 + Math.random() * 0.4;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.setValueAtTime(0, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  osc2.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc2.start();
  osc.stop(audioCtx.currentTime + 1.0);
  osc2.stop(audioCtx.currentTime + 1.0);
}

function playGunshot(distance) {
  if (!audioCtx || !noiseBuffer) return;
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3000, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
  
  const vol = Math.max(0, 0.6 - (distance / 2000));
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  
  noiseSource.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  noiseSource.start();
}

function playScream(distance) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400 + Math.random() * 150, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(350 + Math.random() * 100, audioCtx.currentTime + 0.4);
  const vol = Math.max(0, 0.3 - (distance / 2000));
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
