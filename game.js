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
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

function updateAudio(dt) {
  if (!audioCtx) return;
  if (player.vehicle) {
    const v = player.vehicle;
    const max = v.maxSpeed || 50;
    const speedRatio = (v.speed || 0) / max;
    engineOsc.frequency.setTargetAtTime(80 + speedRatio * 200, audioCtx.currentTime, 0.1);
    engineFilter.frequency.setTargetAtTime(200 + speedRatio * 1500, audioCtx.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(0.011 + speedRatio * 0.033, audioCtx.currentTime, 0.1);
    
    if (screechGain) {
      const handbrake = keys.has("Space");
      const speed = Math.hypot(v.vx || 0, v.vy || 0);
      let drift = 0;
      if (speed > 20) {
        const dirX = Math.cos(v.dir);
        const dirY = Math.sin(v.dir);
        const velX = v.vx / speed;
        const velY = v.vy / speed;
        const dot = dirX * velX + dirY * velY;
        drift = Math.max(0, 1 - Math.abs(dot));
      }
      if (speed > 40 && (handbrake || drift > 0.15)) {
        const intensity = Math.min(1, (speed - 40) / 100 + (handbrake ? 0.3 : 0) + drift);
        screechGain.gain.setTargetAtTime(0.4 * intensity, audioCtx.currentTime, 0.05);
        screechFilter.frequency.setTargetAtTime(800 + intensity * 600, audioCtx.currentTime, 0.05);
      } else {
        screechGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      }
    }
  } else {
    engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    if (screechGain) screechGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
  }
  
  let closestSirenDist = Infinity;
  let activeSirenValue = 0;
  let activeSirenKind = null;
  
  for (const v of vehicles) {
    if (v.kind === "police" && Math.abs(v.speed) > 5 && v !== player.vehicle) {
      const d = dist(v, player);
      if (d < 1500 && d < closestSirenDist) { closestSirenDist = d; activeSirenValue = v.siren; activeSirenKind = "police"; }
    }
  }
  for (const amb of ambulances) {
    if (amb.phase === "arrive" || amb.phase === "leave") {
      const d = dist(amb, player);
      if (d < 1500 && d < closestSirenDist) { closestSirenDist = d; activeSirenValue = amb.siren; activeSirenKind = "ambulance"; }
    }
  }
  for (const ft of firetrucks) {
    if (ft.phase === "arrive" || ft.phase === "leave") {
      const d = dist(ft, player);
      if (d < 1500 && d < closestSirenDist) { closestSirenDist = d; activeSirenValue = ft.siren; activeSirenKind = "firetruck"; }
    }
  }
  
  if (closestSirenDist < 1500) {
    const vol = Math.max(0, 0.2 - (closestSirenDist / 1500));
    sirenGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.1);
    
    const targetFreq = (activeSirenValue % 10) < 5 ? 750 : 950;
    sirenOsc.type = "sine";
    sirenOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.05);
  } else {
    sirenGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
  }

  if (waveGain) {
    const islandLeft = roadXs[0] - 40;
    const islandRight = roadXs[roadXs.length-1] + 40;
    const islandTop = roadYs[0] - 40;
    const islandBottom = roadYs[roadYs.length-1] + 40;
    const distToLeft = player.x - islandLeft;
    const distToRight = islandRight - player.x;
    const distToTop = player.y - islandTop;
    const distToBottom = islandBottom - player.y;
    let waterDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    if (waterDist < 0) waterDist = 0;
    
    const waveVol = Math.max(0, 0.2 - (waterDist / 400));
    const t = Date.now() * 0.0003;
    const waveCycle = Math.sin(t) * 0.5 + Math.sin(t * 1.3) * 0.5;
    const crash = Math.max(0, waveCycle);
    
    waveGain.gain.setTargetAtTime(waveVol * (0.1 + crash * 0.9), audioCtx.currentTime, 0.2);
    waveFilter.frequency.setTargetAtTime(150 + crash * 1500, audioCtx.currentTime, 0.2);
  }
}
// --- END AUDIO SYSTEM ---

const factions = {
  citizen: { name: "Citizen", color: "#6cb6ff", weapon: null, speed: 30 },
  police: { name: "Police", color: "#3158d4", weapon: "Pistol", speed: 38 },
  gang: { name: "Gang", color: "#cf3f50", weapon: "SMG", speed: 36 },
  medic: { name: "Medic", color: "#f7f7f7", weapon: null, speed: 42 },
};

const npcLooks = {
  citizen: [
    { shirt: "#6cb6ff", pants: "#27313d", hair: "#d7aa7b", hat: null },
    { shirt: "#80c97a", pants: "#3b4050", hair: "#7c5135", hat: "#e8b84d" },
    { shirt: "#d7a35b", pants: "#232936", hair: "#2f251f", hat: null },
    { shirt: "#c58bdb", pants: "#303745", hair: "#e0b487", hat: "#4b5564" },
  ],
  police: [{ shirt: "#3158d4", pants: "#17223f", hair: "#d7aa7b", hat: "#1b2e76" }],
  gang: [
    { shirt: "#cf3f50", pants: "#232936", hair: "#2f251f", hat: "#111111" },
    { shirt: "#8c3bd1", pants: "#1f2430", hair: "#d7aa7b", hat: null },
  ],
  medic: [{ shirt: "#f7f7f7", pants: "#2f6f68", hair: "#d7aa7b", hat: "#d93434" }],
};

const roadXs = [260, 720, 1180, 1850, 2400, 2880];
const roadYs = [200, 720, 1260, 1750];
const crosswalks = [];
const terrain = [];
const trees = [];
const buildings = [];
let hospital = null;
let policeStation = null;
let fireStation = null;
const water = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
const bridges = [];
const npcs = [];
const vehicles = [];
const bullets = [];
const drops = [];
const bodies = [];
const ambulances = [];
const firetrucks = [];
const sparks = [];
const skidmarks = [];
const birds = [];

const player = {
  x: 500,
  y: 245,
  w: 16,
  h: 18,
  dir: 0,
  speed: 75,
  weapon: null,
  ammo: 0,
  vehicle: null,
  cooldown: 0,
  attackTimer: 0,
  attackHitDone: false,
  frame: 0,
  action: null,
  entering: null,
  wanted: 0,
  knockdownTimer: 0,
  hp: 200,
  maxHp: 200,
  combatTimer: 0,
  state: "idle"
};

function isRoad(x, y, extra = 0) {
  const hw = ROAD_HALF_W + extra;
  if (x < roadXs[0] - hw || x > roadXs[roadXs.length-1] + hw || y < roadYs[0] - hw || y > roadYs[roadYs.length-1] + hw) return false;
  return roadXs.some((rx) => Math.abs(x - rx) < hw) || roadYs.some((ry) => Math.abs(y - ry) < hw);
}

function rectTouchesRoad(x, y, w, h, extra = 0) {
  const hw = ROAD_HALF_W + extra;
  if (x+w < roadXs[0] - hw || x > roadXs[roadXs.length-1] + hw || y+h < roadYs[0] - hw || y > roadYs[roadYs.length-1] + hw) return false;
  return roadXs.some((rx) => rx > x - hw && rx < x + w + hw)
    || roadYs.some((ry) => ry > y - hw && ry < y + h + hw);
}

function onRoadCenter(x, y) {
  const vertical = roadXs.reduce((best, rx) => (Math.abs(rx - x) < Math.abs(best - x) ? rx : best), roadXs[0]);
  const horizontal = roadYs.reduce((best, ry) => (Math.abs(ry - y) < Math.abs(best - y) ? ry : best), roadYs[0]);
  return Math.abs(vertical - x) < Math.abs(horizontal - y)
    ? { x: vertical, y: clamp(y, 0, WORLD.h) }
    : { x: clamp(x, 0, WORLD.w), y: horizontal };
}

function nearestRoadX(x) {
  return roadXs.reduce((best, rx) => (Math.abs(rx - x) < Math.abs(best - x) ? rx : best), roadXs[0]);
