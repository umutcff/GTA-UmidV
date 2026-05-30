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
}

function nearestRoadY(y) {
  return roadYs.reduce((best, ry) => (Math.abs(ry - y) < Math.abs(best - y) ? ry : best), roadYs[0]);
}

function buildRoadRoute(from, to) {
  const startX = nearestRoadX(from.x);
  const startY = nearestRoadY(from.y);
  const endX = nearestRoadX(to.x);
  const endY = nearestRoadY(to.y);
  return [
    { x: startX, y: startY },
    { x: endX, y: startY },
    { x: endX, y: endY },
  ];
}

function nearestFreePoint(x, y, radius = 18) {
  if (!blocked(x, y, radius)) return { x, y };
  for (let ring = 22; ring < 220; ring += 18) {
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      const px = clamp(x + Math.cos(a) * ring, 30, WORLD.w - 30);
      const py = clamp(y + Math.sin(a) * ring, 30, WORLD.h - 30);
      if (!blocked(px, py, radius)) return { x: px, y: py };
    }
  }
  return onRoadCenter(x, y);
}

function randomSidewalkPoint() {
  for (let i = 0; i < 100; i++) {
    const x = rand(70, WORLD.w - 70);
    const y = rand(70, WORLD.h - 70);
    if (!blocked(x, y, 16) && !isRoad(x, y, 2)) return { x, y };
  }
  return { x: rand(80, WORLD.w - 80), y: rand(80, WORLD.h - 80) };
}

function buildCity() {
  crosswalks.length = 0;
  buildings.length = 0;
  terrain.length = 0;
  
  terrain.push({ type: "rect", x: roadXs[0] - 120, y: roadYs[0] - 120, w: roadXs[roadXs.length-1] - roadXs[0] + 240, h: roadYs[roadYs.length-1] - roadYs[0] + 240, color: "#363a36" });

  for (const x of roadXs) {
    for (const y of roadYs) {
      if (x !== roadXs[0] && x !== roadXs[roadXs.length-1]) {
         crosswalks.push({ x: x - ROAD_HALF_W, y: y - ROAD_HALF_W - 20, w: ROAD_HALF_W * 2, h: 16 });
         crosswalks.push({ x: x - ROAD_HALF_W, y: y + ROAD_HALF_W + 4, w: ROAD_HALF_W * 2, h: 16 });
      }
      if (y !== roadYs[0] && y !== roadYs[roadYs.length-1]) {
         crosswalks.push({ x: x - ROAD_HALF_W - 20, y: y - ROAD_HALF_W, w: 16, h: ROAD_HALF_W * 2 });
         crosswalks.push({ x: x + ROAD_HALF_W + 4, y: y - ROAD_HALF_W, w: 16, h: ROAD_HALF_W * 2 });
      }
    }
  }

  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 3; r++) {
      const left = roadXs[c] + ROAD_HALF_W + 16;
      const right = roadXs[c+1] - ROAD_HALF_W - 16;
      const top = roadYs[r] + ROAD_HALF_W + 16;
      const bottom = roadYs[r+1] - ROAD_HALF_W - 16;
      const bw = right - left;
      const bh = bottom - top;
      
      terrain.push({ type: "rect", x: left, y: top, w: bw, h: bh, color: "#2b2e2d" });

      if (c === 0 && r === 0) {
          hospital = { x: left + 20, y: top + 20, w: bw - 40, h: bh - 40 };
          buildings.push({ ...hospital, c: "#aeb3b1", roofColor: "#d3d8d6", type: "hospital" });
      } 
      else if (c === 2 && r === 0) {
          policeStation = { x: left + 20, y: top + 20, w: bw - 40, h: bh - 40 };
          buildings.push({ ...policeStation, c: "#1e3a5f", roofColor: "#222222", type: "police" });
      }
      else if (c === 2 && r === 1) {
          terrain.push({ type: "rect", x: left, y: top, w: bw, h: bh, color: "#2f6f48" });
          terrain.push({ type: "circle", x: left + bw/2, y: top + bh/2, radius: 15, color: "#3377dd" });
          for(let i=0; i<8; i++) {
              const tx = left + 30 + Math.random()*(bw-60);
              const ty = top + 30 + Math.random()*(bh-60);
              terrain.push({ type: "circle", x: tx, y: ty, radius: 18, color: "#1b4028" });
              trees.push({ x: tx, y: ty, radius: 18 });
          }
      }
      else if (c === 0 && r === 2) {
          buildings.push({ x: left + 10, y: top + 10, w: bw - 20, h: bh - 20, c: "#4a423e", roofColor: "#555", type: "garage" });
      }
      else if (c === 3 && r === 2) {
          fireStation = { x: left + 20, y: top + 20, w: bw - 40, h: bh - 40 };
          buildings.push({ ...fireStation, c: "#a83232", roofColor: "#801d1d", type: "firestation" });
      }
      else {
          if (Math.random() < 0.5) {
             buildings.push({ x: left + 15, y: top + 15, w: bw - 30, h: bh - 30, c: "#3c3c45", roofColor: "#5c5c65", type: "classic" });
          } else {
             buildings.push({ x: left + 10, y: top + 10, w: bw - 20, h: bh/2 - 15, c: "#4a4a4a", roofColor: "#333", type: "modern" });
             buildings.push({ x: left + 10, y: top + bh/2 + 5, w: bw - 20, h: bh/2 - 15, c: "#554444", roofColor: "#443333", type: "brick" });
          }
      }
    }
  }
}

function spawnNpc(type, x, y, options = {}) {
  const f = factions[type];
  const point = x === undefined || y === undefined ? randomSidewalkPoint() : nearestFreePoint(x, y, 16);
  npcs.push({
    id: crypto.randomUUID(),
    type,
    x: point.x,
    y: point.y,
    w: 15,
    h: 18,
    dir: rand(0, Math.PI * 2),
    targetDir: rand(0, Math.PI * 2),
    change: rand(0.5, 2.2),
    speed: f.speed,
    weapon: f.weapon,
    hp: 100,
    cooldown: rand(0, 1),
    frame: rand(0, 4),
    look: pick(npcLooks[type]),
    alerted: Boolean(options.alerted),
    stun: options.stun || 0,
    state: options.state || "walk",
  });
}

function roadTargetFor(v) {
  const laneOffset = 14;
  if (Math.abs(Math.cos(v.dir)) > Math.abs(Math.sin(v.dir))) {
    const nextX = v.dir === 0 ? roadXs.find((rx) => rx > v.x + 8) : [...roadXs].reverse().find((rx) => rx < v.x - 8);
    const y = v.laneY + (v.dir === 0 ? laneOffset : -laneOffset);
    return { x: nextX ?? (v.dir === 0 ? roadXs[roadXs.length-1] + 100 : roadXs[0] - 100), y };
  }
  const nextY = v.dir > 0 ? roadYs.find((ry) => ry > v.y + 8) : [...roadYs].reverse().find((ry) => ry < v.y - 8);
  const x = v.laneX + (v.dir > 0 ? -laneOffset : laneOffset);
  return { x, y: nextY ?? (v.dir > 0 ? roadYs[roadYs.length-1] + 100 : roadYs[0] - 100) };
}

function chooseTurn(v) {
  const options = [];
  const nearX = roadXs.find((rx) => Math.abs(rx - v.x) < 30);
  const nearY = roadYs.find((ry) => Math.abs(ry - v.y) < 30);
  if (nearX !== undefined && nearY !== undefined) {
    if (nearX < roadXs[roadXs.length-1]) options.push(0);
    if (nearY < roadYs[roadYs.length-1]) options.push(Math.PI / 2);
    if (nearX > roadXs[0]) options.push(Math.PI);
    if (nearY > roadYs[0]) options.push(-Math.PI / 2);
    
    const validOptions = options.filter(opt => Math.abs(angleDiff(opt, v.dir)) < Math.PI - 0.1);
    if (validOptions.length === 0) validOptions.push(...options);
    
    if (Math.random() < 0.55 && validOptions.includes(v.dir)) validOptions.push(v.dir, v.dir);
    v.dir = pick(validOptions);
    v.laneX = nearX;
    v.laneY = nearY;
  }
  v.target = roadTargetFor(v);
}

function spawnVehicle(kind = "car") {
  const horizontal = Math.random() > 0.5;
  const laneX = pick(roadXs);
  const laneY = pick(roadYs);
  const dir = horizontal ? pick([0, Math.PI]) : pick([Math.PI / 2, -Math.PI / 2]);
  const laneOffset = 14;
  
  let spawnX, spawnY;
  if (horizontal) {
     spawnX = dir === 0 ? roadXs[0] - 20 : roadXs[roadXs.length-1] + 20;
     spawnY = laneY + (dir === 0 ? laneOffset : -laneOffset);
  } else {
     spawnX = laneX + (dir > 0 ? -laneOffset : laneOffset);
     spawnY = dir > 0 ? roadYs[0] - 20 : roadYs[roadYs.length-1] + 20;
  }
  
  const speed = kind === "ambulance" ? 95 : kind === "police" ? 70 : rand(40, 58);
  const v = {
    id: crypto.randomUUID(),
    kind,
    x: spawnX,
    y: spawnY,
    w: kind === "ambulance" ? 34 : 30,
    h: kind === "ambulance" ? 18 : 16,
    dir,
    speed: speed,
    maxSpeed: speed,
    color: kind === "ambulance" ? "#f4f4ec" : kind === "police" ? "#244aa8" : pick(["#e6ba4c", "#3fa76d", "#d55345", "#58a3c9", "#b46ad9"]),
    driver: kind === "ambulance" ? "medic" : kind === "police" ? "police" : pick(["citizen", "citizen", "gang"]),
    occupied: true,
    ai: true,
    stolen: false,
    dispatched: false,
    waitTimer: 0,
    stuckTimer: 0,
    siren: 0,
    laneX,
    laneY,
    target: null,
    hp: 300,
    maxSpeedOriginal: speed,
  };
  v.target = roadTargetFor(v);
  for (let i = 0; i < 40; i++) {
    if (!isVisibleToPlayer(v) && !vehicles.some((other) => dist(other, v) < 70)) break;
    v.x = horizontal ? rand(80, WORLD.w - 80) : laneX + (dir > 0 ? -laneOffset : laneOffset);
    v.y = horizontal ? laneY + (dir === 0 ? laneOffset : -laneOffset) : rand(80, WORLD.h - 80);
    v.target = roadTargetFor(v);
  }
  
  if (isVisibleToPlayer(v) || vehicles.some((other) => dist(other, v) < 70)) return;
  vehicles.push(v);
}

function setup() {
  buildCity();
  const start = nearestFreePoint(player.x, player.y, 20);
  player.x = start.x;
  player.y = start.y;
  for (let i = 0; i < 15; i++) spawnNpc("citizen");
  for (let i = 0; i < 5; i++) spawnNpc("police");
  for (let i = 0; i < 38; i++) {
    birds.push({
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      dir: rand(0, Math.PI * 2),
      speed: rand(30, 70),
      flap: rand(0, Math.PI * 2)
    });
  }
  for (let i = 0; i < 6; i++) spawnNpc("gang");
  for (let i = 0; i < 23; i++) spawnVehicle();
  for (let i = 0; i < 5; i++) spawnVehicle("police");
  if (policeStation) {
      vehicles.push({ id: crypto.randomUUID(), kind: "police", x: policeStation.x - 30, y: policeStation.y + 20, w: 30, h: 16, dir: Math.PI/2, speed: 0, color: "#244aa8", driver: "police", occupied: false, ai: false, stolen: false, dispatched: false, waitTimer: 0, stuckTimer: 0, siren: 0, laneX: 0, laneY: 0, target: null, hp: 300, maxSpeedOriginal: 70 });
  }
  for (let i = 0; i < 12; i++) {
     let pt = null;
     for (let tries = 0; tries < 50; tries++) {
         const side = pick(["left", "right", "top", "bottom"]);
         let cx, cy;
         if (side === "left") {
             cx = rand(roadXs[0] - 80, roadXs[0] - 50);
             cy = rand(roadYs[0], roadYs[roadYs.length-1]);
         } else if (side === "right") {
             cx = rand(roadXs[roadXs.length-1] + 50, roadXs[roadXs.length-1] + 80);
             cy = rand(roadYs[0], roadYs[roadYs.length-1]);
         } else if (side === "top") {
             cx = rand(roadXs[0], roadXs[roadXs.length-1]);
             cy = rand(roadYs[0] - 80, roadYs[0] - 50);
         } else {
             cx = rand(roadXs[0], roadXs[roadXs.length-1]);
             cy = rand(roadYs[roadYs.length-1] + 50, roadYs[roadYs.length-1] + 80);
         }
         
         if (!isRoad(cx, cy, 15) && !blocked(cx, cy, 22)) {
             pt = { x: cx, y: cy };
             break;
         }
     }
     if (pt) {
         vehicles.push({ id: crypto.randomUUID(), kind: "car", x: pt.x, y: pt.y, w: 30, h: 16, dir: pick([0, Math.PI/2, Math.PI, -Math.PI/2]), speed: 0, color: pick(["#e6ba4c", "#3fa76d", "#d55345", "#58a3c9", "#b46ad9"]), driver: "citizen", occupied: false, ai: false, stolen: false, dispatched: false, waitTimer: 0, stuckTimer: 0, siren: 0, target: null, hp: 300, maxSpeedOriginal: 50 });
     }
  }
}

function inBridge(x, y) {
  return bridges.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
}

function inWater(x, y) {
  const islandLeft = roadXs[0] - 40;
  const islandRight = roadXs[roadXs.length-1] + 40;
  const islandTop = roadYs[0] - 40;
  const islandBottom = roadYs[roadYs.length-1] + 40;
  return x < islandLeft || x > islandRight || y < islandTop || y > islandBottom;
}

function blocked(x, y, radius = 10) {
  if (inWater(x, y) && !inBridge(x, y)) return true;
  if (hospital && x > hospital.x - radius && x < hospital.x + hospital.w + radius && y > hospital.y - radius && y < hospital.y + hospital.h + radius) return true;
  if (policeStation && x > policeStation.x - radius && x < policeStation.x + policeStation.w + radius && y > policeStation.y - radius && y < policeStation.y + policeStation.h + radius) return true;
  if (trees.some((t) => dist({x, y}, t) < t.radius + radius)) return true;
  return buildings.some((b) => x > b.x - radius && x < b.x + b.w + radius && y > b.y - radius && y < b.y + b.h + radius);
}

function inCrosswalk(x, y) {
  return crosswalks.some(cw => x > cw.x && x < cw.x + cw.w && y > cw.y && y < cw.y + cw.h);
}

function moveEntity(e, dir, speed) {
  const dx = Math.cos(dir) * speed;
  const dy = Math.sin(dir) * speed;
  const nx = clamp(e.x + dx, 12, WORLD.w - 12);
  const ny = clamp(e.y + dy, 12, WORLD.h - 12);
  let blockX = blocked(nx, e.y, Math.max(e.w || 16, e.h || 18) * 0.45);
  let blockY = blocked(e.x, ny, Math.max(e.w || 16, e.h || 18) * 0.45);

  if (e === player || npcs.includes(e)) {
    const isNPC = npcs.includes(e);
    if (isNPC && !e.alerted) {
      const onRoadNow = isRoad(e.x, e.y, 2);
      if (!onRoadNow) {
          if (!blockX && isRoad(nx, e.y, 2)) { blockX = true; e.targetDir = e.dir + Math.PI; }
          if (!blockY && isRoad(e.x, ny, 2)) { blockY = true; e.targetDir = e.dir + Math.PI; }
      }
    }
    const allV = [...vehicles, ...ambulances];
    const radius = e === player ? 6 : 4;
    const checkCarHit = (x, y, v, r) => {
      const dx = Math.abs(Math.cos(v.dir) * (x - v.x) + Math.sin(v.dir) * (y - v.y));
      const dy = Math.abs(-Math.sin(v.dir) * (x - v.x) + Math.cos(v.dir) * (y - v.y));
      return dx < v.w/2 + r && dy < v.h/2 + r;
    };
    if (!blockX && allV.some(v => v !== player.vehicle && checkCarHit(nx, e.y, v, radius))) blockX = true;
    if (!blockY && allV.some(v => v !== player.vehicle && checkCarHit(e.x, ny, v, radius))) blockY = true;
  }

  if (!blockX) e.x = nx;
  if (!blockY) e.y = ny;
}

function camera() {
  const subject = player.vehicle || player;
  return {
    x: clamp(subject.x - canvas.width / 2, 0, WORLD.w - canvas.width),
    y: clamp(subject.y - canvas.height / 2, 0, WORLD.h - canvas.height),
  };
}

function isVisibleToPlayer(e) {
  const cam = camera();
  return e.x > cam.x - 50 && e.x < cam.x + canvas.width + 50 && e.y > cam.y - 50 && e.y < cam.y + canvas.height + 50;
}

function getWantedLevel() {
  if (score >= 120) return 3;
  if (score >= 60) return 2;
  if (player.wanted > 0) return 1;
  return 0;
}

function makeWanted(seconds = 15) {
  let policeSees = false;
  for (const npc of npcs) {
    if (npc.type === "police" && isVisibleToPlayer(npc)) {
      policeSees = true;
      break;
    }
  }
  if (!policeSees) return;

  player.wanted = 15;
  for (const npc of npcs) {
    if (npc.type === "police" && dist(npc, player) < 230) npc.alerted = true;
  }
  dispatchPoliceCars(player);
}

function dispatchPoliceCars(source) {
  for (const car of vehicles) {
    if (car.kind !== "police" || car.dispatched || car === player.vehicle || !car.occupied) continue;
    if (isVisibleToPlayer(car)) {
      car.pullingOver = true;
      car.pullTarget = { x: source.x, y: source.y };
    }
  }
}

function shoot(owner, targetDir, hostileToPlayer = false) {
  bullets.push({
    x: owner.x + Math.cos(targetDir) * 14,
