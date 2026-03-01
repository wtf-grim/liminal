/**
 * LIMINAL — Backrooms Horror
 * Performance-first Three.js build
 * - Instanced geometry for walls/floors (single draw call per type)
 * - Minimal lights (~9 point lights total for entire world)
 * - Auto-narrative: story plays as you walk, no click-to-start
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const N  = 8;      // grid size (8x8)
const TK = 0.12;   // wall thickness

// Room size pools — small/medium/large/huge, each with a height
// picked per-cell so every room feels different
const ROOM_SIZES = [
  { w:4,  d:4,  h:2.6  },   // cramped corridor junction
  { w:5,  d:5,  h:2.8  },   // standard
  { w:6,  d:7,  h:2.8  },   // slightly stretched
  { w:8,  d:8,  h:3.2  },   // medium hall
  { w:10, d:10, h:3.4  },   // large open room
  { w:14, d:10, h:3.6  },   // wide hall
  { w:10, d:16, h:3.6  },   // deep hall
  { w:18, d:18, h:4.2  },   // huge warehouse room
  { w:5,  d:12, h:2.6  },   // narrow corridor
  { w:12, d:5,  h:2.6  },   // wide corridor
];

// Default for W/D/H references elsewhere
const W = 8, H = 3.2, D = 8;

const WALK_SPEED  = 3.0;
const RUN_SPEED   = 5.2;
const SENSITIVITY = 0.0016;
const BOB_SPEED   = 7.5;
const BOB_AMT     = 0.038;
const PH          = 1.62;   // player height

// Narrative lines — shown as player walks (time-based, ms)
const STORY = [
  { t:  3000, text: "you noclipped out of reality." },
  { t: 10000, text: "the hum has always been here." },
  { t: 22000, text: "someone was here before you.\nthey left something behind." },
  { t: 38000, text: "the lights never go out.\nthere is no switch." },
  { t: 55000, text: "check the walls.\nthey wrote it down." },
  { t: 75000, text: "a key.\nsomewhere on these walls." },
  { t:100000, text: "you're going in circles.\nbut the writing is still there." },
  { t:130000, text: "find it before you can't\nread anymore." },
  { t:165000, text: "the carpet is wet." },
  { t:200000, text: "it's on the wall.\nyou've seen it." },
  { t:240000, text: "take the key.\nleave this place." },
  { t:290000, text: "it has always been watching." },
];

// Lines that surface when sanity drops below 20%
const MADNESS_LINES = [
  "don't look at it",
  "i saw it again",
  "it's at the end of the hall",
  "why won't the lights stop",
  "there's something wrong with the walls",
  "it hasn't moved",
  "stop",
];

// ─────────────────────────────────────────────────────────────────────────────
// WALL INSCRIPTION — private key written on the wall in black marker
// Replace WALLET_KEY with the real key when provided.
// ─────────────────────────────────────────────────────────────────────────────
const WALLET_KEY = '5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E3M8Lf';

// Hint texts that appear alongside (or instead of) the key in random rooms
const HINT_TEXTS = [
  'find the key.\nit opens everything.',
  'the numbers on the wall\nare the only way out.',
  'you already walked past it.',
  'still here?\ncheck the walls.',
  'someone left it here.\nfor you.',
  'the key is real.\nthe exit is not.',
  'LEVEL 0\nno exit.',
  'day 47.\nstill walking.',
  'follow the hum.',
  'do not\nlook back.',
  'it was here\ntoo.',
  'i found it.\nthen i lost it.',
  'the walls\nare moving.',
  'COUNT THE DOORS\ncount them again',
  'you are not\nthe first.',
  'noclipped\n2019.04.11',
  'the carpet\nis not wet.',
  'HELP\nplease',
  'going in circles.\nnot lost.',
  'i can hear\nbreathing.',
  'check behind\nyou.',
  'the lights\nnever change.',
  'it follows sound.',
  'day ???\nroom ???',
  'i scratched it\ninto the wall\nso i\'d remember.',
  'the smell\nis getting worse.',
  'turn around.',
  'write it down.\nyou will forget.',
  'every room\nis the same room.',
  'still here?',
];

// Multi-line longer inscriptions (scribblings, notes left behind)
const LONG_WRITINGS = [
  'if you find this:\nthe key is on a wall\nsomewhere near\nthe big room.\ni checked.',
  'day 1: found food\nday 3: food gone\nday ???: lost count\nstill walking',
  'the humming changes\npitch near exits.\nor i think it does.\ni\'m not sure anymore.',
  'RULES:\n1. don\'t run\n2. don\'t stop\n3. check every wall\n4. there is no 4',
  'left → left → straight\nright → left → straight\nthat\'s how i got here\ncan\'t get back',
  'someone scratched\nlines in the floor.\ni\'ve counted them.\n217. then 218.',
  'the fluorescents\nbuzz in F minor.\ni timed it.\n60 cycles per second.\nalways.',
];

// Called after world.build() — places writings on ~30% of room walls.
// Key itself appears in only ~5% of rooms — you have to work for it.
// Uses Math.random() so placement differs every session.
function buildWallWritings(rooms, scene) {
  const KEY_CHANCE     = 0.05;  // actual key — rare
  const WRITING_CHANCE = 0.30;  // any writing at all — common enough to feel inhabited
  const faceOpen = { N:'openN', S:'openS', W:'openW', E:'openE' };
  const allFaces = ['N','S','W','E'];

  rooms.forEach(r => {
    if(Math.random() > WRITING_CHANCE) return;
    // Solid walls only
    const solidFaces = allFaces.filter(f => !r[faceOpen[f]]);
    if(solidFaces.length === 0) return;

    // Some rooms get writing on multiple walls (rare — feels obsessive)
    const wallCount = Math.random() < 0.15 ? Math.min(2, solidFaces.length) : 1;
    const usedFaces = [...solidFaces].sort(()=>Math.random()-.5).slice(0, wallCount);

    usedFaces.forEach((face, wi) => {
      let text;
      const roll = Math.random();
      if(roll < KEY_CHANCE) {
        text = WALLET_KEY;  // the actual key — very rare
      } else if(roll < 0.18) {
        text = LONG_WRITINGS[Math.floor(Math.random() * LONG_WRITINGS.length)];
      } else {
        text = HINT_TEXTS[Math.floor(Math.random() * HINT_TEXTS.length)];
      }
      // Second wall in same room: always a short hint, never the key
      if(wi > 0) text = HINT_TEXTS[Math.floor(Math.random() * HINT_TEXTS.length)];

      const mesh = makeWallTextMesh(text, face, r.wx, r.wz, r.rw, r.rd, r.rh);
      scene.add(mesh);
    });
  });
}

// Creates a flat plane with canvas-rendered text, placed flush on a wall face.
// face: 'N' | 'S' | 'W' | 'E'
// wx,wz = room world origin; rw,rd,rh = room dimensions
function makeWallTextMesh(text, face, wx, wz, rw, rd, rh) {
  const lines = text.split('\n');
  const isLong = lines.length > 3;
  const isKey  = text === WALLET_KEY;

  // Canvas — taller for multi-line content
  const cw = 512, ch = isLong ? 384 : (lines.length > 2 ? 300 : 220);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, cw, ch);

  // Randomise writing style per inscription
  const styles = [
    { fill:'rgba(8,6,3,0.94)',   font:'bold 26px monospace',  lineH:34 },  // dark marker
    { fill:'rgba(30,18,0,0.88)', font:'italic 24px serif',    lineH:32 },  // pen scrawl
    { fill:'rgba(60,20,0,0.80)', font:'bold 22px monospace',  lineH:30 },  // faded red
    { fill:'rgba(4,4,4,0.96)',   font:'900 28px monospace',   lineH:36 },  // thick sharpie
  ];
  const style = isKey
    ? { fill:'rgba(6,4,2,0.97)', font:'bold 20px monospace', lineH:28 }  // key: small, dense
    : styles[Math.floor(Math.random() * styles.length)];

  ctx.fillStyle = style.fill;
  ctx.font = style.font;
  ctx.textAlign = 'center';

  const startY = ch / 2 - (lines.length - 1) * style.lineH / 2;
  lines.forEach((line, i) => {
    // Per-line jitter for handwritten feel
    const jx = (Math.random() - 0.5) * 3;
    const jy = (Math.random() - 0.5) * 2;
    ctx.save();
    ctx.translate(cw / 2 + jx, startY + i * style.lineH + jy);
    // Slight random rotation per line — looks scrawled
    ctx.rotate((Math.random() - 0.5) * 0.018);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });

  // Scratched underline on single-word messages for emphasis
  if(lines.length === 1 && !isKey && Math.random() < 0.4) {
    const w = ctx.measureText(lines[0]).width;
    ctx.strokeStyle = style.fill;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cw/2 - w/2 - 4, startY + 12);
    ctx.lineTo(cw/2 + w/2 + 4, startY + 12 + (Math.random()-0.5)*3);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  // Plane size scales with content
  const planeW = Math.min(rw * 0.55, isKey ? 2.6 : 2.0);
  const planeH = isLong ? 1.1 : (lines.length > 2 ? 0.88 : 0.68);
  const geo = new THREE.PlaneGeometry(planeW, planeH);
  const mesh = new THREE.Mesh(geo, mat);

  // Eye-level, slight random horizontal offset so not always dead-center
  const eyeY  = 1.45 + (Math.random() - 0.5) * 0.25;
  const offset = 0.07;
  const hShift = (Math.random() - 0.5) * Math.min(rw, rd) * 0.2;

  switch(face) {
    case 'N':
      mesh.position.set(wx + rw / 2 + hShift, eyeY, wz + offset);
      break;
    case 'S':
      mesh.position.set(wx + rw / 2 + hShift, eyeY, wz + rd - offset);
      mesh.rotation.y = Math.PI;
      break;
    case 'W':
      mesh.position.set(wx + offset, eyeY, wz + rd / 2 + hShift);
      mesh.rotation.y = Math.PI / 2;
      break;
    case 'E':
      mesh.position.set(wx + rw - offset, eyeY, wz + rd / 2 + hShift);
      mesh.rotation.y = -Math.PI / 2;
      break;
  }

  return mesh;
}
// ─────────────────────────────────────────────────────────────────────────────
function rng(seed) {
  const x = Math.sin(seed + 1.9) * 43758.5453;
  return x - Math.floor(x);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXTURE BUILDER  (no per-pixel loops — pure canvas 2D ops)
// ─────────────────────────────────────────────────────────────────────────────
function makeWallTex() {
  // Backrooms: pale yellow-green with vertical chevron/arrow wallpaper pattern
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');

  // Base: muted yellow-green like the reference images
  x.fillStyle = '#c8cc7a'; x.fillRect(0,0,512,512);

  // Vertical stripe bands (subtle lighter/darker alternation)
  for(let i=0;i<512;i+=34) {
    x.fillStyle = i%68===0 ? 'rgba(255,255,200,.06)' : 'rgba(0,0,0,.04)';
    x.fillRect(i,0,17,512);
  }

  // Chevron / arrow wallpaper pattern — matches reference exactly
  x.strokeStyle = 'rgba(140,150,40,.55)';
  x.lineWidth = 2.2;
  const pw = 34, ph = 28;
  for(let row=0; row<512/ph+1; row++) {
    for(let col=0; col<512/pw+1; col++) {
      const bx = col*pw, by = row*ph;
      // Draw upward-pointing chevron (V shape)
      x.beginPath();
      x.moveTo(bx,       by+ph*.6);
      x.lineTo(bx+pw/2,  by);
      x.lineTo(bx+pw,    by+ph*.6);
      x.stroke();
    }
  }

  // Subtle vertical seam lines
  x.strokeStyle='rgba(100,110,20,.2)'; x.lineWidth=1;
  for(let i=0;i<512;i+=34){
    x.beginPath();x.moveTo(i,0);x.lineTo(i,512);x.stroke();
  }

  // Light moisture/age stains
  [[60,120,30],[240,80,20],[180,340,25],[380,200,18],[100,420,22]].forEach(([cx,cy,r])=>{
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,'rgba(180,170,60,.12)');g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
  });

  const t = new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2.5, 1.5);
  return t;
}

function makeFloorTex() {
  // Backrooms: damp office carpet — dense loop pile, worn patches, wet stains
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');

  // Base layer: mottled beige-tan to break up uniformity
  const baseGrad = x.createLinearGradient(0,0,512,512);
  baseGrad.addColorStop(0,   '#b8a85a');
  baseGrad.addColorStop(0.3, '#a89848');
  baseGrad.addColorStop(0.6, '#b4a258');
  baseGrad.addColorStop(1,   '#a89050');
  x.fillStyle = baseGrad; x.fillRect(0,0,512,512);

  // ── Dense carpet pile — tight 4px grid of tiny loops ──
  x.strokeStyle='rgba(70,58,12,.22)'; x.lineWidth=0.8;
  for(let i=0;i<512;i+=4){
    x.beginPath();x.moveTo(i,0);x.lineTo(i,512);x.stroke();
    x.beginPath();x.moveTo(0,i);x.lineTo(512,i);x.stroke();
  }

  // ── Weave diagonal (45°) — gives carpet its textile structure ──
  x.strokeStyle='rgba(55,44,8,.12)'; x.lineWidth=0.8;
  for(let i=-512;i<1024;i+=8){
    x.beginPath();x.moveTo(i,0);x.lineTo(i+512,512);x.stroke();
    x.beginPath();x.moveTo(i+512,0);x.lineTo(i,512);x.stroke();
  }

  // ── Worn/compressed patches — lighter, flatter areas from foot traffic ──
  [[256,256,90],[120,380,55],[400,130,42],[180,80,38],[440,400,30]].forEach(([cx,cy,r])=>{
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,'rgba(220,205,140,.18)');
    g.addColorStop(0.5,'rgba(190,175,110,.08)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.fillRect(0,0,512,512);
  });

  // ── Dark wet/damp stains ──
  [[100,100,32],[310,260,24],[195,415,28],[430,155,18],[75,355,22],[360,420,16]].forEach(([cx,cy,r])=>{
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,'rgba(28,20,0,.55)');
    g.addColorStop(0.6,'rgba(20,14,0,.22)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
  });

  // ── Fine noise dots — individual pile fibres catching light ──
  x.fillStyle='rgba(200,185,110,.12)';
  for(let i=0;i<3500;i++){
    const tx=Math.floor(Math.random()*512), ty=Math.floor(Math.random()*512);
    x.fillRect(tx,ty,1,1);
  }
  x.fillStyle='rgba(30,22,4,.10)';
  for(let i=0;i<2000;i++){
    const tx=Math.floor(Math.random()*512), ty=Math.floor(Math.random()*512);
    x.fillRect(tx,ty,1,1);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(5,5);
  return t;
}

function makeCeilTex() {
  // Backrooms: off-white acoustic tile ceiling with grid of metal channels
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');

  // Base: off-white slightly warm
  x.fillStyle = '#e8e4cc'; x.fillRect(0,0,512,512);

  // Tile surface texture — subtle stipple via small rects
  x.fillStyle='rgba(0,0,0,.03)';
  for(let i=0;i<2000;i++){
    const tx=Math.random()*512, ty=Math.random()*512;
    x.fillRect(tx,ty,2,1);
  }

  // Grid channel lines (metal T-bar ceiling grid) — every 128px = one tile
  x.strokeStyle='rgba(160,155,120,.7)'; x.lineWidth=3;
  for(let i=0;i<512;i+=128){
    x.beginPath();x.moveTo(i,0);x.lineTo(i,512);x.stroke();
    x.beginPath();x.moveTo(0,i);x.lineTo(512,i);x.stroke();
  }
  // Inner channel detail
  x.strokeStyle='rgba(200,195,160,.4)'; x.lineWidth=1;
  for(let i=0;i<512;i+=128){
    x.beginPath();x.moveTo(i+2,0);x.lineTo(i+2,512);x.stroke();
    x.beginPath();x.moveTo(0,i+2);x.lineTo(512,i+2);x.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1.5,1.5);
  return t;
}

// Wood grain texture for office furniture
function makeWoodTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  // Base: warm mid-brown
  x.fillStyle = '#7a5830'; x.fillRect(0,0,256,256);
  // Grain lines — long horizontal streaks of varying lightness
  for(let i=0; i<256; i+=2) {
    const v = Math.sin(i*0.31+1.2)*12 + Math.sin(i*0.07)*8;
    x.strokeStyle = `rgba(${v>0?255:0},${Math.abs(v)|0},0,${(Math.abs(v)/30).toFixed(2)})`;
    x.lineWidth = 1 + Math.random()*0.5;
    x.beginPath(); x.moveTo(0,i); x.lineTo(256,i+(Math.random()-0.5)*3); x.stroke();
  }
  // Knots — occasional dark oval swirls
  [[60,80,8],[190,140,6],[130,200,5]].forEach(([cx,cy,r])=>{
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,'rgba(20,10,0,.7)'); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g; x.beginPath(); x.ellipse(cx,cy,r,r*1.4,0.3,0,Math.PI*2); x.fill();
  });
  // Slight varnish sheen
  const sh=x.createLinearGradient(0,0,256,0);
  sh.addColorStop(0,'rgba(255,220,160,.04)'); sh.addColorStop(0.5,'rgba(255,240,200,.10)'); sh.addColorStop(1,'rgba(255,220,160,.04)');
  x.fillStyle=sh; x.fillRect(0,0,256,256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,1);
  return t;
}

// Metal texture for chair legs, cabinet body
function makeMetalTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8a8a82'; x.fillRect(0,0,128,128);
  // Brushed streaks
  for(let i=0; i<128; i+=1) {
    const bright = (Math.random()-0.5)*18;
    x.strokeStyle = `rgba(${bright>0?255:0},${bright>0?255:0},${bright>0?255:0},${(Math.abs(bright)/40).toFixed(2)})`;
    x.lineWidth = 0.5;
    x.beginPath(); x.moveTo(0,i); x.lineTo(128,i); x.stroke();
  }
  // Edge shadow
  const eg=x.createLinearGradient(0,0,128,0);
  eg.addColorStop(0,'rgba(0,0,0,.25)'); eg.addColorStop(0.08,'rgba(0,0,0,0)');
  eg.addColorStop(0.92,'rgba(0,0,0,0)'); eg.addColorStop(1,'rgba(0,0,0,.25)');
  x.fillStyle=eg; x.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}

// Bright white rectangular fluorescent panel texture (for the fixture mesh)
function makeLightPanelTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  // Bright white center, slight warm falloff at edges
  const g = x.createLinearGradient(0,0,128,0);
  g.addColorStop(0,   '#d8e8d0');
  g.addColorStop(0.1, '#ffffff');
  g.addColorStop(0.9, '#ffffff');
  g.addColorStop(1,   '#d8e8d0');
  x.fillStyle=g; x.fillRect(0,0,128,64);
  // thin frame
  x.strokeStyle='rgba(180,180,160,.6)'; x.lineWidth=2;
  x.strokeRect(1,1,126,62);
  return new THREE.CanvasTexture(c);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE  (unchanged from original — already lightweight)
// ─────────────────────────────────────────────────────────────────────────────
class Audio {
  constructor() { this.ctx=null; this.amb=null; this.sfx=null; this.started=false; }

  init() {
    try {
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
      const m=this.ctx.createGain(); m.gain.value=.7; m.connect(this.ctx.destination);
      this.amb=this.ctx.createGain(); this.amb.gain.value=.35; this.amb.connect(m);
      this.sfx=this.ctx.createGain(); this.sfx.gain.value=.55; this.sfx.connect(m);
    } catch(_){}
  }

  start() {
    if(!this.ctx||this.started) return; this.started=true;
    this._hum(60,.18); this._hum(120,.08); this._hum(180,.03); this._hum(28,.11,'sawtooth');
    this._noise(.05,200,2000); this._noise(.025,4000,12000);
  }

  _hum(freq,vol,type='sine') {
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    const lfo=this.ctx.createOscillator(), lg=this.ctx.createGain();
    o.type=type; o.frequency.value=freq+(Math.random()-.5)*2; g.gain.value=vol;
    lfo.frequency.value=.12+Math.random()*.08; lg.gain.value=vol*.08;
    lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.amb);
    lfo.start(); o.start();
  }

  _noise(vol,lo,hi) {
    if(!this.ctx) return;
    const sz=this.ctx.sampleRate*2, buf=this.ctx.createBuffer(1,sz,this.ctx.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<sz;i++) d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource(); s.buffer=buf; s.loop=true;
    const hp=this.ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=lo;
    const lp=this.ctx.createBiquadFilter(); lp.type='lowpass';  lp.frequency.value=hi;
    const g=this.ctx.createGain(); g.gain.value=vol;
    s.connect(hp);hp.connect(lp);lp.connect(g);g.connect(this.amb); s.start();
  }

  static_burst(intensity=1) {
    if(!this.ctx) return;
    const sz=Math.floor(this.ctx.sampleRate*.06);
    const buf=this.ctx.createBuffer(1,sz,this.ctx.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<sz;i++) d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource(); s.buffer=buf;
    const g=this.ctx.createGain(); const t=this.ctx.currentTime;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(.28*intensity,t+.004);
    g.gain.exponentialRampToValueAtTime(.0001,t+.065);
    const bp=this.ctx.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value=2000+Math.random()*3000; bp.Q.value=.6;
    s.connect(bp);bp.connect(g);g.connect(this.sfx); s.start();
  }

  footstep() {
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=280;
    o.type='sine'; const t=this.ctx.currentTime;
    o.frequency.setValueAtTime(70+Math.random()*30,t);
    o.frequency.exponentialRampToValueAtTime(18,t+.09);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(.12,t+.005);
    g.gain.exponentialRampToValueAtTime(.0001,t+.09);
    o.connect(f);f.connect(g);g.connect(this.sfx); o.start();o.stop(t+.12);
  }

  distant() {
    if(!this.ctx) return;
    if(Math.random()<.5) {
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type='sawtooth';const t=this.ctx.currentTime;
      o.frequency.setValueAtTime(180+Math.random()*80,t);
      o.frequency.linearRampToValueAtTime(60+Math.random()*40,t+.9);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.035,t+.1);
      g.gain.linearRampToValueAtTime(0,t+1);
      const bp=this.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=380;bp.Q.value=2;
      o.connect(bp);bp.connect(g);g.connect(this.sfx);o.start();o.stop(t+1.1);
    } else { this.static_burst(.25); }
  }

  tension(t) {
    if(!this.amb) return;
    this.amb.gain.setTargetAtTime(.35+t*.3, this.ctx.currentTime, .6);
  }

  // Barely-audible voice-like whisper
  whisper() {
    if(!this.ctx) return;
    const sz=this.ctx.sampleRate*.4;
    const buf=this.ctx.createBuffer(1,sz,this.ctx.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<sz;i++) d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource(); s.buffer=buf;
    const g=this.ctx.createGain(); const ct=this.ctx.currentTime;
    g.gain.setValueAtTime(0,ct);
    g.gain.linearRampToValueAtTime(.022,ct+.08);
    g.gain.linearRampToValueAtTime(.018,ct+.2);
    g.gain.exponentialRampToValueAtTime(.0001,ct+.4);
    // Narrow bandpass — formant-like
    const bp1=this.ctx.createBiquadFilter(); bp1.type='bandpass'; bp1.frequency.value=900+Math.random()*300; bp1.Q.value=8;
    const bp2=this.ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.frequency.value=2200+Math.random()*400; bp2.Q.value=6;
    s.connect(bp1); bp1.connect(bp2); bp2.connect(g); g.connect(this.sfx); s.start();
  }

  // Sub-bass heartbeat thump
  heartbeat() {
    if(!this.ctx) return;
    const thump=(delay)=>{
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.type='sine'; o.frequency.value=42;
      const t=this.ctx.currentTime+delay;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(.38,t+.015);
      g.gain.exponentialRampToValueAtTime(.0001,t+.18);
      o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t+.2);
    };
    thump(0); thump(.12);
  }

  // Heavy wet distant footstep (entity approaching)
  heavy_step() {
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=180;
    o.type='sine'; const t=this.ctx.currentTime;
    o.frequency.setValueAtTime(55+Math.random()*20,t);
    o.frequency.exponentialRampToValueAtTime(12,t+.14);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(.22,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+.14);
    o.connect(f);f.connect(g);g.connect(this.sfx); o.start();o.stop(t+.18);
    // subtle impact noise
    this.static_burst(.15);
  }

  // Bass thud + crack — distant door slam / impact
  thud() {
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type='sine'; const t=this.ctx.currentTime;
    o.frequency.setValueAtTime(80,t);
    o.frequency.exponentialRampToValueAtTime(20,t+.25);
    g.gain.setValueAtTime(.55,t);
    g.gain.exponentialRampToValueAtTime(.0001,t+.3);
    o.connect(g); g.connect(this.sfx); o.start(); o.stop(t+.35);
    setTimeout(()=>this.static_burst(.8), 30);
  }

  // Hum cuts out then fades back — deeply unsettling silence
  drone_shift() {
    if(!this.amb) return;
    const t = this.ctx.currentTime;
    this.amb.gain.cancelScheduledValues(t);
    this.amb.gain.setTargetAtTime(0.0, t, 0.08);
    this.amb.gain.setTargetAtTime(0.35, t + 0.55, 0.3);
  }

  // Wet footstep — longer decay, slightly damp
  footstep_wet() {
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=220;
    o.type='sine'; const t=this.ctx.currentTime;
    o.frequency.setValueAtTime(55+Math.random()*20,t);
    o.frequency.exponentialRampToValueAtTime(14,t+.18);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(.11,t+.007);
    g.gain.exponentialRampToValueAtTime(.0001,t+.2);
    o.connect(f);f.connect(g);g.connect(this.sfx); o.start();o.stop(t+.22);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD  — built with InstancedMesh for massive perf gain
// ─────────────────────────────────────────────────────────────────────────────
class World {
  constructor(scene) {
    this.scene = scene;
    this.walls = [];   // {min,max} AABB list for collision only (coarse)
  }

  build() {
    const wallTex       = makeWallTex();
    const floorTex      = makeFloorTex();
    const ceilTex       = makeCeilTex();
    const lightPanelTex = makeLightPanelTex();

    const wallMat  = new THREE.MeshLambertMaterial({ color:0xd8dc88, map:wallTex });
    const floorMat = new THREE.MeshLambertMaterial({ color:0xc8b870, map:floorTex });
    const ceilMat  = new THREE.MeshLambertMaterial({ color:0xf0ecd8, map:ceilTex  });
    const fixMat   = new THREE.MeshLambertMaterial({
      color:0xefffff, map:lightPanelTex,
      emissive:0xd0ffee, emissiveIntensity:1.8,
    });

    // ── Step 1: assign each cell a random size and compute world offsets ──
    // xOffsets[gx] = world X start of column gx
    // zOffsets[gz] = world Z start of row gz
    const xOffsets = this.xOffsets = new Array(N+1).fill(0);
    const zOffsets = this.zOffsets = new Array(N+1).fill(0);
    const cellW    = new Array(N);   // room width  per column
    const cellH    = new Array(N*N); // room height per cell (flat index)
    const cellD    = new Array(N);   // room depth  per row

    for(let gx=0;gx<N;gx++) {
      const pick = ROOM_SIZES[Math.floor(rng(gx*137+7) * ROOM_SIZES.length)];
      cellW[gx] = pick.w;
      xOffsets[gx+1] = xOffsets[gx] + pick.w;
    }
    for(let gz=0;gz<N;gz++) {
      const pick = ROOM_SIZES[Math.floor(rng(gz*251+13) * ROOM_SIZES.length)];
      cellD[gz] = pick.d;
      zOffsets[gz+1] = zOffsets[gz] + pick.d;
    }
    // Height per cell
    for(let gx=0;gx<N;gx++) for(let gz=0;gz<N;gz++) {
      const pick = ROOM_SIZES[Math.floor(rng(gx*1000+gz*17+3) * ROOM_SIZES.length)];
      cellH[gx*N+gz] = pick.h;
    }

    // ── Step 2: compute room descriptors ──
    const rooms = [];
    for(let gx=0;gx<N;gx++) for(let gz=0;gz<N;gz++) {
      const s   = gx*1000+gz;
      const rw  = cellW[gx];
      const rd  = cellD[gz];
      const rh  = cellH[gx*N+gz];
      const wx  = xOffsets[gx];
      const wz  = zOffsets[gz];
      rooms.push({
        gx, gz, wx, wz, rw, rd, rh,
        openN: gz>0   && rng(s+1)>.28,
        openS: gz<N-1 && rng(s+2)>.28,
        openW: gx>0   && rng(s+3)>.28,
        openE: gx<N-1 && rng(s+4)>.28,
        // big rooms always lit, small ones sometimes dark
        hasLight: rng(s+9) > (rw>10 ? 0.05 : 0.15),
        // number of extra lights for huge rooms
        extraLights: rw >= 14 || rd >= 14 ? Math.floor((rw+rd)/10) : 0,
      });
    }
    this.rooms = rooms; // expose for spawn logic

    // ── Step 3: count instances ──
    let floorCount=0, ceilCount=0, wallSCount=0, fixCount=0;
    for(const r of rooms) {
      floorCount++; ceilCount++;
      if(r.hasLight) fixCount += 1 + r.extraLights;
      for(const open of [r.openN,r.openS,r.openW,r.openE]) {
        wallSCount += open ? 3 : 1;
      }
    }

    // ── Step 4: build instanced meshes ──
    const wallGeo  = new THREE.BoxGeometry(1,1,1);
    const iWall    = new THREE.InstancedMesh(wallGeo,  wallMat,  wallSCount);
    const iFloor   = new THREE.InstancedMesh(new THREE.BoxGeometry(1,TK,1), floorMat, floorCount);
    const iCeil    = new THREE.InstancedMesh(new THREE.BoxGeometry(1,TK,1), ceilMat,  ceilCount);
    const iFixPanel= new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,.04,.6), fixMat, fixCount||1);

    const mat4 = new THREE.Matrix4();
    const pos  = new THREE.Vector3();
    const scl  = new THREE.Vector3();
    const qid  = new THREE.Quaternion();

    let wi=0, fi=0, ci=0, fxi=0;

    const setBox = (mesh, idx, x,y,z, sw,sh,sd) => {
      pos.set(x,y,z); scl.set(sw,sh,sd);
      mat4.compose(pos,qid,scl);
      mesh.setMatrixAt(idx, mat4);
    };

    const addWall = (x,y,z,sw,sh,sd) => {
      setBox(iWall, wi++, x,y,z, sw,sh,sd);
      this.walls.push({ minX:x-sw/2, maxX:x+sw/2, minY:y-sh/2, maxY:y+sh/2, minZ:z-sd/2, maxZ:z+sd/2 });
    };

    // Door opening dimensions — scale with room height
    const dW = 1.5, dH = 2.3;

    for(const r of rooms) {
      const {wx,wz,rw,rd,rh,openN,openS,openW,openE,hasLight,extraLights} = r;

      // Floor — scale the 1×1×1 geo to room dimensions
      setBox(iFloor, fi++, wx+rw/2, -TK/2, wz+rd/2, rw, 1, rd);
      // Ceiling
      setBox(iCeil,  ci++, wx+rw/2, rh+TK/2, wz+rd/2, rw, 1, rd);

      // North wall (z=wz)
      if(!openN) {
        addWall(wx+rw/2, rh/2, wz, rw, rh, TK);
      } else {
        const s=(rw-dW)/2;
        addWall(wx+s/2,       rh/2,         wz,  s,  rh,   TK);
        addWall(wx+rw-s/2,    rh/2,         wz,  s,  rh,   TK);
        addWall(wx+rw/2, dH+(rh-dH)/2,      wz, dW, rh-dH, TK);
      }
      // South wall (z=wz+rd)
      if(!openS) {
        addWall(wx+rw/2, rh/2, wz+rd, rw, rh, TK);
      } else {
        const s=(rw-dW)/2;
        addWall(wx+s/2,    rh/2,        wz+rd,  s,  rh,   TK);
        addWall(wx+rw-s/2, rh/2,        wz+rd,  s,  rh,   TK);
        addWall(wx+rw/2, dH+(rh-dH)/2,  wz+rd, dW, rh-dH, TK);
      }
      // West wall (x=wx)
      if(!openW) {
        addWall(wx, rh/2, wz+rd/2, TK, rh, rd);
      } else {
        const s=(rd-dW)/2;
        addWall(wx, rh/2, wz+s/2,    TK, rh, s  );
        addWall(wx, rh/2, wz+rd-s/2, TK, rh, s  );
        addWall(wx, dH+(rh-dH)/2, wz+rd/2, TK, rh-dH, dW);
      }
      // East wall (x=wx+rw)
      if(!openE) {
        addWall(wx+rw, rh/2, wz+rd/2, TK, rh, rd);
      } else {
        const s=(rd-dW)/2;
        addWall(wx+rw, rh/2, wz+s/2,    TK, rh, s  );
        addWall(wx+rw, rh/2, wz+rd-s/2, TK, rh, s  );
        addWall(wx+rw, dH+(rh-dH)/2, wz+rd/2, TK, rh-dH, dW);
      }

      // Fluorescent panels — one per light slot, distributed across room
      if(hasLight) {
        const panelSlots = 1 + extraLights;
        for(let li=0; li<panelSlots; li++) {
          const px = wx + rw*(li+1)/(panelSlots+1);
          const pz = wz + rd/2;
          setBox(iFixPanel, fxi++, px, rh-.02, pz, 1,1,1);
        }
      }
    }

    iWall.instanceMatrix.needsUpdate     = true;
    iFloor.instanceMatrix.needsUpdate    = true;
    iCeil.instanceMatrix.needsUpdate     = true;
    iFixPanel.instanceMatrix.needsUpdate = true;

    scene.add(iWall, iFloor, iCeil, iFixPanel);

    // ── Step 5: point lights — one per room, intensity scales with size ──
    this.lights = [];
    const lightColor = 0xefffee;
    for(const r of rooms) {
      if(rng(r.gx*500+r.gz*7+99) < 0.1) continue;
      const bigRoom = r.rw >= 10 || r.rd >= 10;
      const intensity = bigRoom ? 2.8 : 2.0;
      const range     = Math.max(r.rw, r.rd) * 1.8;
      const pl = new THREE.PointLight(lightColor, intensity, range);
      pl.position.set(r.wx+r.rw/2, r.rh*.88, r.wz+r.rd/2);
      scene.add(pl);
      this.lights.push(pl);

      // Huge rooms get extra fill lights at corners
      if(r.rw>=14 || r.rd>=14) {
        [[.25,.25],[.75,.25],[.25,.75],[.75,.75]].forEach(([fx,fz])=>{
          const pl2 = new THREE.PointLight(lightColor, 1.2, range*.6);
          pl2.position.set(r.wx+r.rw*fx, r.rh*.8, r.wz+r.rd*fz);
          scene.add(pl2);
          this.lights.push(pl2);
        });
      }
    }

    // ── Step 6: props ──
    this._addProps(wallMat);

    // ── Step 7: wall writings — random ~5% of rooms get a key or hint ──
    buildWallWritings(rooms, scene);

    // Store center spawn for player
    const mid = Math.floor(N/2);
    const mr  = rooms[mid*N+mid];
    this.spawnX = mr.wx + mr.rw/2;
    this.spawnZ = mr.wz + mr.rd/2;
  }

  _addProps(wallMat) {
    const woodTex  = makeWoodTex();
    const metalTex = makeMetalTex();
    const woodMat  = new THREE.MeshLambertMaterial({ color:0xc8a060, map:woodTex });
    const metalMat = new THREE.MeshLambertMaterial({ color:0xa0a098, map:metalTex });
    const darkMat  = new THREE.MeshLambertMaterial({ color:0x302818 }); // dark wood / old box
    const fabricMat= new THREE.MeshLambertMaterial({ color:0x5a5040 }); // worn chair seat

    for(const r of (this.rooms||[])) {
      const {wx,wz,rw,rd} = r;
      const seed = r.gx*777+r.gz*333+5;
      const rv = rng(seed);
      if(rv>.55) continue;  // slightly more props
      const t = Math.floor(rng(seed+77)*6); // 6 prop types
      const margin = .8;
      const px = wx+margin+rng(r.gx*11+r.gz)*(rw-margin*2);
      const pz = wz+margin+rng(r.gx*22+r.gz)*(rd-margin*2);
      const rot = rng(seed+88)*Math.PI*2;

      if(t===0) {
        // Cardboard box — slightly worn, random size
        const bw=.38+rng(seed+1)*.28, bh=.30+rng(seed+2)*.22, bd=.38+rng(seed+3)*.28;
        const m=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd), darkMat);
        m.position.set(px, bh/2, pz);
        m.rotation.y = rot;
        this.scene.add(m);
        // Flap crease lines drawn as thin dark strips on top
        const flapMat = new THREE.MeshLambertMaterial({ color:0x201408 });
        const flap = new THREE.Mesh(new THREE.BoxGeometry(bw*.01, bh*.01, bd), flapMat);
        flap.position.set(px, bh+0.001, pz);
        this.scene.add(flap);
        this.walls.push({minX:px-bw/2,maxX:px+bw/2,minY:0,maxY:bh,minZ:pz-bd/2,maxZ:pz+bd/2});

      } else if(t===1) {
        // Office table — wood top, metal legs
        const tw=1.4, td=0.7, legH=0.72;
        const top=new THREE.Mesh(new THREE.BoxGeometry(tw, .045, td), woodMat);
        top.position.set(px, legH+.022, pz);
        top.rotation.y = rot;
        this.scene.add(top);
        // Metal legs — angled slightly inward for realism
        const legGeo = new THREE.BoxGeometry(.04, legH, .04);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        [[tw/2-.09, td/2-.09],[-(tw/2-.09), td/2-.09],
         [tw/2-.09,-(td/2-.09)],[-(tw/2-.09),-(td/2-.09)]].forEach(([lx,lz])=>{
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(
            px + lx*cr - lz*sr,
            legH/2,
            pz + lx*sr + lz*cr
          );
          this.scene.add(leg);
        });
        // Crossbar stretcher near floor
        const bar = new THREE.Mesh(new THREE.BoxGeometry(tw*.75,.03,.03), metalMat);
        bar.position.set(px, .22, pz); bar.rotation.y=rot;
        this.scene.add(bar);
        this.walls.push({minX:px-tw/2,maxX:px+tw/2,minY:0,maxY:legH+.05,minZ:pz-td/2,maxZ:pz+td/2});

      } else if(t===2) {
        // Office chair — 5-star base, seat, backrest
        const seatH = .48, backH = .5;
        // Seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(.52,.06,.52), fabricMat);
        seat.position.set(px, seatH, pz);
        this.scene.add(seat);
        // Backrest
        const back = new THREE.Mesh(new THREE.BoxGeometry(.48,.52,.055), fabricMat);
        back.position.set(px, seatH + backH/2 + .03, pz - .23);
        back.rotation.y = rot;
        this.scene.add(back);
        // Center column
        const col = new THREE.Mesh(new THREE.BoxGeometry(.06,.45,.06), metalMat);
        col.position.set(px, .22, pz);
        this.scene.add(col);
        // 5 base arms radiating out
        for(let i=0;i<5;i++){
          const ang = (i/5)*Math.PI*2;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(.34,.03,.04), metalMat);
          arm.position.set(px+Math.cos(ang)*.18, .06, pz+Math.sin(ang)*.18);
          arm.rotation.y = -ang;
          this.scene.add(arm);
          // Wheel nub at end of each arm
          const wheel = new THREE.Mesh(new THREE.BoxGeometry(.05,.04,.05), darkMat);
          wheel.position.set(px+Math.cos(ang)*.34, .04, pz+Math.sin(ang)*.34);
          this.scene.add(wheel);
        }
        this.walls.push({minX:px-.3,maxX:px+.3,minY:0,maxY:seatH+backH,minZ:pz-.3,maxZ:pz+.3});

      } else if(t===3) {
        // Filing cabinet — 2-drawer metal unit
        const cw=.48, ch=1.05, cd=.58;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(cw,ch,cd), metalMat);
        cab.position.set(px, ch/2, pz);
        this.scene.add(cab);
        // Drawer divider lines (dark strips)
        [.52,.02].forEach(yFrac=>{
          const div = new THREE.Mesh(new THREE.BoxGeometry(cw+.002,.012,cd+.002),
            new THREE.MeshLambertMaterial({color:0x303028}));
          div.position.set(px, yFrac*ch, pz);
          this.scene.add(div);
        });
        // Drawer handles — two small horizontal bars
        [.76,.27].forEach(yFrac=>{
          const handle = new THREE.Mesh(new THREE.BoxGeometry(.18,.025,.025),
            new THREE.MeshLambertMaterial({color:0xc8c8b8}));
          handle.position.set(px, yFrac*ch, pz-cd/2-.015);
          this.scene.add(handle);
        });
        this.walls.push({minX:px-cw/2,maxX:px+cw/2,minY:0,maxY:ch,minZ:pz-cd/2,maxZ:pz+cd/2});

      } else if(t===4 && rw>7) {
        // Stacked boxes — big rooms only, up to 4 high
        const count = 2 + Math.floor(rng(seed+55)*3);
        const bw=.48, bd=.46;
        for(let i=0;i<count;i++){
          const bh=.30+rng(seed+i+10)*.08;
          const offX = (rng(seed+i+20)-.5)*.06;
          const offZ = (rng(seed+i+30)-.5)*.06;
          const m=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd), i%2===0 ? darkMat : woodMat);
          m.position.set(px+offX, bh/2+i*.30, pz+offZ);
          m.rotation.y = rng(seed+i+40)*0.35;
          this.scene.add(m);
        }
        this.walls.push({minX:px-.3,maxX:px+.3,minY:0,maxY:count*.32,minZ:pz-.3,maxZ:pz+.3});

      } else if(t===5) {
        // Overturned/abandoned chair — just the seat on its side, eerie
        const seat = new THREE.Mesh(new THREE.BoxGeometry(.5,.06,.5), fabricMat);
        seat.position.set(px, .28, pz);
        seat.rotation.z = Math.PI/2 + (Math.random()-.5)*.4;
        seat.rotation.y = rot;
        this.scene.add(seat);
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(.04,.45,.04), metalMat);
        leg1.position.set(px+.18, .42, pz); leg1.rotation.z=0.3;
        this.scene.add(leg1);
        const leg2 = new THREE.Mesh(new THREE.BoxGeometry(.04,.45,.04), metalMat);
        leg2.position.set(px-.18, .35, pz); leg2.rotation.z=-0.25;
        this.scene.add(leg2);
        this.walls.push({minX:px-.3,maxX:px+.3,minY:0,maxY:.6,minZ:pz-.3,maxZ:pz+.3});
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {};

// DOM
const appEl        = document.getElementById('app');
const splashEl     = document.getElementById('splash');
const storyLine    = document.getElementById('story-line');
const sanityBar    = document.getElementById('sanity-bar');
const hudEl        = document.getElementById('hud');
const controlsEl   = document.getElementById('controls');
const chromaEl     = document.getElementById('chroma');
const grainEl      = document.getElementById('grain');
const whiteFlash   = document.getElementById('white-flash');
const curEl        = document.getElementById('cur');

// State
const S = {
  started:false, locked:false,
  keys:{}, mouseX:0, mouseY:0, yaw:0, pitch:0,
  bobT:0, isMoving:false,
  sanity:100, elapsed:0,
  storyIdx:0, storyTimer:null,
  sightingProx:0,            // 0–1, fades after events (drives grain/effects)
  lastStep:0,
  startTime:0,
  hallucinationCooldown:0,
  lastMadness:0,
};

// DOM — new horror overlays
const vignetteEl = document.getElementById('vignette');
const breatheEl  = document.getElementById('breathe');

// Scene
let scene, camera, renderer, clock;
let yawObj, pitchObj;
let world;
const audio = new Audio();

// ── INIT ──────────────────────────────────────────────────────────────────
function init() {
  // Renderer — minimal settings for perf
  renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;  // shadows off — use fog + vignette for horror
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  appEl.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // Backrooms haze — pale yellow-green fog matching the reference
  // Denser fog hides the wrap seam — you never see the edge of the world
  scene.fog = new THREE.FogExp2(0x8a9040, 0.032);
  scene.background = new THREE.Color(0x8a9040);

  // Ambient — cool fluorescent white-green like references
  scene.add(new THREE.AmbientLight(0xd8ffcc, 1.6));

  // Camera rig
  yawObj   = new THREE.Object3D();
  pitchObj = new THREE.Object3D();
  camera   = new THREE.PerspectiveCamera(80, window.innerWidth/window.innerHeight, 0.08, 100);
  yawObj.add(pitchObj);
  pitchObj.add(camera);
  scene.add(yawObj);

  // Spawn in center room (set after world.build())
  yawObj.position.set(0, PH, 0);

  // World
  world  = new World(scene);
  world.build();

  // Place player in center room now that world is built
  yawObj.position.set(world.spawnX, PH, world.spawnZ);

  // World bounds for position wrapping — gives illusion of infinite looping space
  world.totalWidth = world.xOffsets[N];
  world.totalDepth = world.zOffsets[N];


  clock = new THREE.Clock();

  bindEvents();
  renderer.setAnimationLoop(loop);
}

function bindEvents() {
  // Splash click → pointer lock
  splashEl.addEventListener('click', () => {
    audio.init();
    renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    S.locked = document.pointerLockElement === renderer.domElement;
    if(S.locked) {
      if(!S.started) {
        S.started = true;
        S.startTime = performance.now();
        audio.start();
        splashEl.classList.add('gone');
        setTimeout(()=>{ splashEl.style.display='none'; }, 2000);
        appEl.classList.add('visible');
        hudEl.style.display = 'block';
        controlsEl.style.display = 'block';
        // Hide controls after 8s
        setTimeout(()=>{ controlsEl.style.opacity='0'; controlsEl.style.transition='opacity 2s'; }, 8000);
        scheduleStory();
        scheduleEntity();
        scheduleDistantSounds();
      }
    } else {
      // Pointer unlocked — show splash again
      splashEl.style.display='flex'; splashEl.style.opacity='1';
      splashEl.classList.remove('gone');
    }
  });

  document.addEventListener('mousemove', e => {
    if(!S.locked) {
      curEl.style.left=e.clientX+'px'; curEl.style.top=e.clientY+'px';
      return;
    }
    S.mouseX += e.movementX;
    S.mouseY += e.movementY;
  });

  document.addEventListener('keydown', e=>{ S.keys[e.code]=true; });
  document.addEventListener('keyup',   e=>{ S.keys[e.code]=false; });

  window.addEventListener('resize', ()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  });
}

// ── STORY SYSTEM ─────────────────────────────────────────────────────────
function scheduleStory() {
  STORY.forEach(({t,text}) => {
    setTimeout(()=>showStoryLine(text), t);
  });
}

let storyTimeout=null;
function showStoryLine(text) {
  if(storyTimeout) clearTimeout(storyTimeout);
  storyLine.textContent = text;
  storyLine.classList.add('show');
  storyTimeout = setTimeout(()=>{
    storyLine.classList.remove('show');
  }, 5500);
}

// ── SIGHTING SCHEDULING ───────────────────────────────────────────────────
function scheduleEntity() {
  // No-op — sightings are now handled frame-by-frame in updateSightings()
  // This function kept to avoid breaking the bindEvents call
}

function scheduleDistantSounds() {
  const play=()=>{
    if(S.started) {
      const r = Math.random();
      if(r < .55)      audio.distant();
      else if(r < .75) audio.whisper();
      else             audio.thud();
    }
    setTimeout(play, 8000+Math.random()*20000);
  };
  setTimeout(play, 16000);
}

// ── COLLISION ────────────────────────────────────────────────────────────
const _tmpMin = new THREE.Vector3();
const _tmpMax = new THREE.Vector3();
function collides(pos) {
  const r=.28;
  const px=pos.x, pz=pos.z;
  const py0=pos.y-PH, py1=pos.y+.2;
  for(const w of world.walls) {
    if(px+r>w.minX && px-r<w.maxX &&
       py1    >w.minY && py0    <w.maxY &&
       pz+r>w.minZ && pz-r<w.maxZ) return true;
  }
  return false;
}

// ── MAIN LOOP ────────────────────────────────────────────────────────────
function loop() {
  const dt    = Math.min(clock.getDelta(), 0.05);
  const time  = clock.getElapsedTime();

  if(S.started && S.locked) {
    move(dt, time);
    updateSightings(dt, time);
    updateSanity(dt);
    updateEffects(time);
    flickerAmbient(time);
  }

  renderer.render(scene, camera);
}

function move(dt, time) {
  // Look
  S.yaw   -= S.mouseX * SENSITIVITY;
  S.pitch -= S.mouseY * SENSITIVITY;
  S.pitch  = Math.max(-1.0, Math.min(1.0, S.pitch));
  S.mouseX = 0; S.mouseY = 0;

  yawObj.rotation.y   = S.yaw;
  pitchObj.rotation.x = S.pitch;

  // Movement
  const run   = S.keys['ShiftLeft']||S.keys['ShiftRight'];
  const speed = (run ? RUN_SPEED : WALK_SPEED) * dt;
  const sin   = Math.sin(S.yaw), cos=Math.cos(S.yaw);

  let mx=0,mz=0;
  if(S.keys['KeyW']||S.keys['ArrowUp'])    { mx-=sin; mz-=cos; }
  if(S.keys['KeyS']||S.keys['ArrowDown'])  { mx+=sin; mz+=cos; }
  if(S.keys['KeyA']||S.keys['ArrowLeft'])  { mx-=cos; mz+=sin; }
  if(S.keys['KeyD']||S.keys['ArrowRight']) { mx+=cos; mz-=sin; }

  S.isMoving = (mx!==0||mz!==0);

  if(S.isMoving) {
    const len=Math.sqrt(mx*mx+mz*mz);
    mx=mx/len*speed; mz=mz/len*speed;

    const cur = yawObj.position;
    const nx  = new THREE.Vector3(cur.x+mx, cur.y, cur.z);
    const nz  = new THREE.Vector3(cur.x,    cur.y, cur.z+mz);
    const nxz = new THREE.Vector3(cur.x+mx, cur.y, cur.z+mz);

    if(!collides(nxz))     yawObj.position.copy(nxz);
    else if(!collides(nx)) yawObj.position.copy(nx);
    else if(!collides(nz)) yawObj.position.copy(nz);
  }

  // Head bob
  if(S.isMoving) {
    S.bobT += dt * BOB_SPEED * (run ? 1.35 : 1);
    pitchObj.position.y = Math.sin(S.bobT)*BOB_AMT;
    // Footstep — alternate wet/dry for damp carpet feel
    if(Math.sin(S.bobT)>0.97 && time-S.lastStep>.28) {
      if(Math.floor(S.bobT/Math.PI) % 2 === 0) audio.footstep();
      else audio.footstep_wet();
      S.lastStep=time;
    }
  } else {
    pitchObj.position.y *= 0.88;
  }

  // ── World wrap — pac-man loop, gives illusion of infinite backrooms ──
  const tw = world.totalWidth, td = world.totalDepth;
  const p  = yawObj.position;
  if(p.x < 0)   p.x += tw;
  if(p.x > tw)  p.x -= tw;
  if(p.z < 0)   p.z += td;
  if(p.z > td)  p.z -= td;
}

// ─────────────────────────────────────────────────────────────────────────────
// AMBIENT HORROR EVENTS
// ─────────────────────────────────────────────────────────────────────────────
function updateSightings(dt, time) {
  // Decay sightingProx (drives grain/effects) back toward 0
  S.sightingProx = Math.max(0, S.sightingProx - dt * 0.16);

  // ── Hallucination events — subtle ambient dread ──
  S.hallucinationCooldown -= dt;
  if(S.hallucinationCooldown <= 0 && time > 45) {
    const freq = S.sanity < 40 ? 0.004 : 0.0012;
    if(Math.random() < freq) triggerHallucination();
    S.hallucinationCooldown = 10 + Math.random() * 15;
  }
}

function triggerHallucination() {
  const type = Math.floor(Math.random() * 3);
  if(type === 0) {
    // Sudden light inversion — sickly flash
    if(_ambLight) {
      _ambLight.color.setHex(0xff8800);
      setTimeout(()=>{ if(_ambLight) _ambLight.color.setHex(0xd8ffcc); }, 200);
    }
  } else if(type === 1) {
    audio.thud();
  } else {
    audio.whisper();
  }
}

function flashWhite(op) {
  whiteFlash.style.opacity=op;
  setTimeout(()=>{ whiteFlash.style.opacity='0'; whiteFlash.style.transition='opacity .18s'; },60);
}

function updateSanity(dt) {
  // Passive drain + spike from sighting lingering effect
  S.sanity = Math.max(0, S.sanity - (.7/60)*dt - S.sightingProx*3*dt);
  sanityBar.style.width = S.sanity+'%';
}

let _ambLight;
function flickerAmbient(t) {
  // Global ambient modulation — subtle dual-sine + rare blackout
  if(!_ambLight) _ambLight = scene.children.find(c=>c.isAmbientLight);
  if(!_ambLight) return;
  _ambLight.intensity = 1.58 + Math.sin(t*49)*.04 + Math.sin(t*107)*.02;
  if(Math.random() < .0008) {
    _ambLight.intensity = .5;
    setTimeout(()=>{ _ambLight.intensity=1.58; audio.static_burst(.35); }, 90+Math.random()*120);
  }

  // Spot-flicker: 1–2 individual room lights go dark for a single frame
  if(world.lights && world.lights.length > 0 && Math.random() < 0.08) {
    const idx = Math.floor(Math.random() * world.lights.length);
    const light = world.lights[idx];
    if(light) {
      const orig = light._baseIntensity || light.intensity;
      light._baseIntensity = orig;
      light.intensity = 0;
      // Restore next frame (via requestAnimationFrame ~ 16ms)
      setTimeout(()=>{ light.intensity = orig; }, 16);
    }
  }
}

function updateEffects(t) {
  const san = S.sanity;

  // ── Grain: spikes briefly after a sighting, increases with low sanity ──
  if(!S.sightingActive) {
    grainEl.style.opacity = (.055 + S.sightingProx * .06 + Math.max(0,(60-san)/60)*.04).toFixed(3);
  }

  // ── Chromatic aberration — kicks in at sanity < 60 ──
  if(san < 60) {
    const f = (60 - san) / 60;
    chromaEl.style.opacity   = (f * .38).toFixed(3);
    chromaEl.style.background= `rgba(200,0,0,0.03)`;
    chromaEl.style.transform = `translate(${(f*2.5).toFixed(2)}px,0)`;
  } else { chromaEl.style.opacity = '0'; }

  // ── Breathing — camera FOV pulses at sanity < 80 ──
  if(san < 80) {
    const breatheAmt = (80 - san) / 80;
    camera.fov = 80 + Math.sin(t * 0.4 * Math.PI * 2) * breatheAmt * 1.8;
    camera.updateProjectionMatrix();
    if(breatheEl) {
      breatheEl.style.opacity = (breatheAmt * Math.max(0, Math.sin(t * 0.4 * Math.PI * 2)) * .18).toFixed(3);
    }
  } else {
    camera.fov = 80;
    camera.updateProjectionMatrix();
    if(breatheEl) breatheEl.style.opacity = '0';
  }

  // ── Vignette deepens with sanity loss ──
  if(vignetteEl) {
    const extra = Math.max(0, (70 - san) / 70);
    vignetteEl.style.opacity = (1 + extra * 0.6).toFixed(3);
  }

  // ── Screen tilt at sanity < 20 ──
  if(san < 20) {
    const tiltAmt = (20 - san) / 20;
    pitchObj.rotation.z = Math.sin(t * 0.22) * tiltAmt * 0.016;
  } else {
    pitchObj.rotation.z = 0;
  }

  // ── Madness lines at sanity < 20 ──
  if(san < 20 && t - S.lastMadness > 18 && Math.random() < .004) {
    showStoryLine(MADNESS_LINES[Math.floor(Math.random()*MADNESS_LINES.length)]);
    S.lastMadness = t;
  }
}

// ── BOOT ─────────────────────────────────────────────────────────────────
init();

// Show scene behind splash immediately
appEl.style.opacity='1';
