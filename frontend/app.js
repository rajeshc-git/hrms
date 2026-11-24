import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════════
// Indian Phone Formatter & Validator
// ═══════════════════════════════════════════════════════════════════════════════
function formatIndianPhoneNumber(raw) {
  if (!raw) return { valid: false, formatted: '', raw: '' };
  let cleaned = raw.trim().replace(/[^\d+]/g, '');
  let n = '';
  if (cleaned.startsWith('+91')) n = cleaned.slice(3);
  else if (cleaned.startsWith('91') && cleaned.length > 10) n = cleaned.slice(2);
  else if (cleaned.startsWith('0')) n = cleaned.slice(1);
  else n = cleaned;
  n = n.replace(/\D/g, '');
  const valid = /^[6-9]\d{9}$/.test(n);
  return { valid, digits: n, formatted: valid ? `+91 ${n.slice(0,5)} ${n.slice(5)}` : raw, raw };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Company Branding Data — Emoji Icons + Colors + Short Codes
// ═══════════════════════════════════════════════════════════════════════════════
const COMPANIES = {
  'TCS':               { emoji: '🏛️', color: 0x1a73e8, short: 'TCS',  fullName: 'Tata Consultancy Services' },
  'Infosys':           { emoji: '💎', color: 0x00bcd4, short: 'INFY', fullName: 'Infosys Limited' },
  'Wipro':             { emoji: '🌿', color: 0x4caf50, short: 'WPRO', fullName: 'Wipro Limited' },
  'HCLTech':           { emoji: '⚙️', color: 0x5c6bc0, short: 'HCL',  fullName: 'HCL Technologies' },
  'Tech Mahindra':     { emoji: '🔧', color: 0xe91e63, short: 'TECHM', fullName: 'Tech Mahindra' },
  'Cognizant':         { emoji: '🧠', color: 0x009688, short: 'CTSH', fullName: 'Cognizant Technology' },
  'LTIMindtree':       { emoji: '🌲', color: 0xff9800, short: 'LTIM', fullName: 'LTIMindtree Limited' },
  'Mphasis':           { emoji: '🚀', color: 0x9c27b0, short: 'MPHL', fullName: 'Mphasis Limited' },
  'Persistent Systems':{ emoji: '🔬', color: 0x26a69a, short: 'PSYS', fullName: 'Persistent Systems' },
  'Zoho':              { emoji: '🦁', color: 0xf44336, short: 'ZOHO', fullName: 'Zoho Corporation' },
  'Capgemini India':   { emoji: '🗼', color: 0x0097a7, short: 'CAP',  fullName: 'Capgemini India' },
  'Accenture India':   { emoji: '📐', color: 0x7b1fa2, short: 'ACN',  fullName: 'Accenture India' },
  'Oracle India':      { emoji: '☁️', color: 0xff5722, short: 'ORCL', fullName: 'Oracle India' }
};

function getCompanyData(name) {
  return COMPANIES[name] || { emoji: '🏢', color: 0x607d8b, short: name.slice(0,4).toUpperCase(), fullName: name };
}

// ═══════════════════════════════════════════════════════════════════════════════
// App State
// ═══════════════════════════════════════════════════════════════════════════════
let contacts = [];
let activeCompanyFilter = 'all';
let searchQuery = '';
let currentView = 'list';

// DOM refs
const tabList = document.getElementById('tab-list');
const tab3D = document.getElementById('tab-3d');
const deskTabList = document.getElementById('desk-tab-list');
const deskTab3D = document.getElementById('desk-tab-3d');
const threeContainer = document.getElementById('three-container');
const listViewSection = document.getElementById('list-view-section');
const world3DOverlay = document.getElementById('world-3d-overlay');
const btnQuickAdd = document.getElementById('btn-quick-add');
const modalAddContact = document.getElementById('modal-add-contact');
const btnCloseForm = document.getElementById('btn-close-form');
const btnCancelForm = document.getElementById('btn-cancel-form');
const contactForm = document.getElementById('contact-form');
const inputName = document.getElementById('input-name');
const inputPhone = document.getElementById('input-phone');
const companySelect = document.getElementById('company-select');
const customCompanyInput = document.getElementById('custom-company-input');
const inputRole = document.getElementById('input-role');
const inputEmail = document.getElementById('input-email');
const inputNotes = document.getElementById('input-notes');
const searchInput = document.getElementById('search-input');
const badgeTotalCount = document.getElementById('badge-total-count');
const companyPills = document.getElementById('company-pills');
const contactsList = document.getElementById('contacts-list');
const popupCompanyModal = document.getElementById('popup-company-modal');
const popupCompanyTitle = document.getElementById('popup-company-title');
const popupCompanyCount = document.getElementById('popup-company-count');
const popupCompanyContacts = document.getElementById('popup-company-contacts');
const btnCloseSheet = document.getElementById('btn-close-sheet');

// ═══════════════════════════════════════════════════════════════════════════════
// API Layer
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchContacts() {
  try {
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error();
    contacts = await res.json();
  } catch { /* offline fallback */ }
  renderUI();
  rebuild3DWorld();
}

async function createContact(c) {
  try {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c)
    });
    if (!res.ok) throw new Error();
    contacts.push(await res.json());
  } catch {
    c.id = Date.now();
    contacts.push(c);
  }
  renderUI();
  rebuild3DWorld();
}

async function deleteContact(id) {
  try { await fetch(`/api/contacts/${id}`, { method: 'DELETE' }); } catch {}
  contacts = contacts.filter(c => c.id !== id);
  renderUI();
  rebuild3DWorld();
  if (!popupCompanyModal.classList.contains('hidden'))
    renderSheetForCompany(popupCompanyTitle.textContent);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rendering: Filtering + Compact Cards
// ═══════════════════════════════════════════════════════════════════════════════
function getFiltered() {
  return contacts.filter(c => {
    const co = activeCompanyFilter === 'all' || c.company.toLowerCase() === activeCompanyFilter.toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    const s = !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (c.role||'').toLowerCase().includes(q);
    return co && s;
  });
}

function renderUI() {
  badgeTotalCount.textContent = contacts.length;
  renderPills();
  renderCards();
}

function renderPills() {
  const counts = {};
  contacts.forEach(c => { counts[c.company] = (counts[c.company]||0)+1; });
  const cos = Object.keys(counts).sort();

  companyPills.innerHTML = `<button class="pill ${activeCompanyFilter==='all'?'active':''}" data-company="all">All (${contacts.length})</button>`;
  cos.forEach(co => {
    const d = getCompanyData(co);
    const btn = document.createElement('button');
    btn.className = `pill ${activeCompanyFilter.toLowerCase()===co.toLowerCase()?'active':''}`;
    btn.dataset.company = co;
    btn.textContent = `${d.emoji} ${co} (${counts[co]})`;
    companyPills.appendChild(btn);
  });
}

function renderCards() {
  const f = getFiltered();
  if (!f.length) {
    contactsList.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:#aeaeb2;font-size:14px;">No contacts match your search.</div>`;
    return;
  }
  contactsList.innerHTML = f.map(c => cardHtml(c)).join('');
}

function getInitials(name) {
  if (!name) return 'HR';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function cardHtml(c) {
  const d = getCompanyData(c.company);
  const ph = c.phone.replace(/[^\d+]/g, '');
  const digits = ph.replace(/\D/g, '').slice(-10);
  const wa = `https://wa.me/91${digits}?text=Hi%20${encodeURIComponent(c.name)}%2C%20regarding%20roles%20at%20${encodeURIComponent(c.company)}`;
  const bgHex = '#' + d.color.toString(16).padStart(6, '0');
  return `
    <div class="hr-row-card" data-id="${c.id}">
      <div class="card-top">
        <div class="hr-identity">
          <div class="hr-avatar" style="background:${bgHex}">${esc(getInitials(c.name))}</div>
          <div class="hr-name-role">
            <span class="hr-name">${esc(c.name)}</span>
            <span class="hr-role">${esc(c.role||'HR')}</span>
          </div>
        </div>
        <span class="hr-company-tag">${d.emoji} ${esc(c.company)}</span>
      </div>
      <div class="card-middle">
        <span class="hr-phone">${esc(c.phone)}</span>
        ${c.notes ? `<span class="hr-notes" title="${esc(c.notes)}">${esc(c.notes)}</span>` : ''}
      </div>
      <div class="action-buttons-wrap">
        <a href="tel:${ph}" class="compact-btn btn-call">📞 Call</a>
        <a href="${wa}" target="_blank" rel="noopener" class="compact-btn btn-wa">💬 WhatsApp</a>
        <button class="compact-btn btn-copy" data-copy="${ph}">📋 Copy</button>
        <button class="compact-btn btn-del" data-delete="${c.id}" title="Delete">✕</button>
      </div>
    </div>`;
}

function esc(s) { return s ? s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") : ''; }

// ═══════════════════════════════════════════════════════════════════════════════
// 3D CAMPUS — Premium Glass Office Park with Company HQ Buildings
// ═══════════════════════════════════════════════════════════════════════════════
let scene, camera, renderer, groundMesh;
const meshMap = new Map();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let isDrag = false, dragStartPos = { x: 0, y: 0 }, prevPos = { x: 0, y: 0 };
const isSmallDevice = () => window.innerWidth < 768 || window.innerWidth < window.innerHeight;
let camR = isSmallDevice() ? 92 : 56, camT = Math.PI/4, camP = isSmallDevice() ? Math.PI/3.1 : Math.PI/3.4;
let camTarget = new THREE.Vector3(0, 2, 0);
let pinchDist = 0;
let animTime = 0;
let hoveredBuilding = null;
const particleSystem = { group: null };

function initScene() {
  const el = document.getElementById('three-container');

  scene = new THREE.Scene();

  // Gradient sky background
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#a8d8ea');
  skyGrad.addColorStop(0.3, '#c5e8f7');
  skyGrad.addColorStop(0.6, '#e8f4f8');
  skyGrad.addColorStop(1, '#f0f7fa');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 2, 512);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;
  scene.fog = new THREE.FogExp2(0xe8f4f8, 0.0012);

  camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.5, 450);
  updateCam();

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 3));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.appendChild(renderer.domElement);

  // ── Sky hemisphere light ──
  const hemi = new THREE.HemisphereLight(0xa8d8ea, 0x7cb342, 0.7);
  scene.add(hemi);

  // ── Main sun directional light with shadows ──
  const sun = new THREE.DirectionalLight(0xfff8e1, 2.0);
  sun.position.set(40, 60, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // ── Secondary fill light ──
  const fill = new THREE.DirectionalLight(0xb3e5fc, 0.4);
  fill.position.set(-30, 30, -20);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  // ── Beautiful ground ──
  buildGround();

  // ── Decorative elements ──
  buildTrees();
  buildParkBenches();
  buildFloatingParticles();

  setupControls(el);
  animLoop();
}

function buildGround() {
  // Main circular campus ground — gradient grass
  const groundGeo = new THREE.CircleGeometry(85, 64);
  const gc = document.createElement('canvas');
  gc.width = 512; gc.height = 512;
  const gctx = gc.getContext('2d');

  // Radial grass gradient
  const grad = gctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, '#90c695');
  grad.addColorStop(0.5, '#7cb342');
  grad.addColorStop(0.8, '#689f38');
  grad.addColorStop(1, '#558b2f');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 512, 512);

  // Add subtle noise texture to grass
  for (let i = 0; i < 6000; i++) {
    const gx = Math.random() * 512, gy = Math.random() * 512;
    gctx.fillStyle = `rgba(${Math.random()>0.5?100:60}, ${120 + Math.random()*60}, ${Math.random()>0.5?50:30}, ${0.1 + Math.random()*0.15})`;
    gctx.fillRect(gx, gy, 1.5, 1.5);
  }

  const grassTex = new THREE.CanvasTexture(gc);
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassTex, roughness: 0.9, metalness: 0
  });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Paved pathways in a star pattern
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.7, metalness: 0.05 });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 70), pathMat);
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = angle;
    path.position.y = 0.03;
    path.receiveShadow = true;
    scene.add(path);
  }

  // Central fountain plaza
  const plazaGeo = new THREE.CylinderGeometry(10, 10, 0.15, 48);
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.4, metalness: 0.1 });
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.position.y = 0.075;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Fountain water
  const waterGeo = new THREE.CylinderGeometry(5, 5, 0.3, 32);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4fc3f7, roughness: 0.1, metalness: 0.3,
    transparent: true, opacity: 0.7
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0.3;
  scene.add(water);

  // Fountain center pillar
  const pillarGeo = new THREE.CylinderGeometry(0.6, 0.8, 4, 12);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.2, metalness: 0.6 });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 2;
  pillar.castShadow = true;
  scene.add(pillar);

  // Outer ring road
  const ringGeo = new THREE.TorusGeometry(36, 1.2, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.5, metalness: 0.05 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.receiveShadow = true;
  scene.add(ring);
}

function buildTrees() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x66bb6a, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x81c784, roughness: 0.8 }),
  ];

  // Outer ring trees
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 30;
    addTree(Math.cos(angle) * dist, Math.sin(angle) * dist, trunkMat, leafMats);
  }

  // Inner decorative trees between buildings
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 18;
    addTree(Math.cos(angle) * dist, Math.sin(angle) * dist, trunkMat, leafMats);
  }
}

function addTree(x, z, trunkMat, leafMats) {
  const scale = 0.6 + Math.random() * 0.8;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * scale, 0.35 * scale, 2.5 * scale, 6),
    trunkMat
  );
  trunk.position.set(x, 1.25 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);

  // Layered canopy for more realistic look
  const mat = leafMats[Math.floor(Math.random() * leafMats.length)];
  const layers = 2 + Math.floor(Math.random() * 2);
  for (let j = 0; j < layers; j++) {
    const r = (1.8 - j * 0.3) * scale;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    crown.position.set(
      x + (Math.random() - 0.5) * 0.5,
      (3.0 + j * 1.0) * scale,
      z + (Math.random() - 0.5) * 0.5
    );
    crown.castShadow = true;
    scene.add(crown);
  }
}

function buildParkBenches() {
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.3, metalness: 0.7 });

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const dist = 12;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // Bench seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), benchMat);
    seat.position.set(x, 0.5, z);
    seat.rotation.y = angle + Math.PI / 2;
    seat.castShadow = true;
    scene.add(seat);

    // Bench legs
    for (const lx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), metalMat);
      leg.position.set(
        x + Math.cos(angle + Math.PI/2) * lx,
        0.25,
        z + Math.sin(angle + Math.PI/2) * lx
      );
      scene.add(leg);
    }
  }
}

function buildFloatingParticles() {
  // Ambient floating light particles
  const count = 60;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random() - 0.5) * 100;
    pos[i*3+1] = 5 + Math.random() * 30;
    pos[i*3+2] = (Math.random() - 0.5) * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.4,
    transparent: true, opacity: 0.5,
    sizeAttenuation: true
  });
  const pts = new THREE.Points(geo, mat);
  particleSystem.group = pts;
  scene.add(pts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Build Company HQ Towers
// ═══════════════════════════════════════════════════════════════════════════════
function rebuild3DWorld() {
  if (!scene) return;

  // Clear old buildings
  meshMap.forEach(g => {
    g.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    scene.remove(g.group);
  });
  meshMap.clear();

  const counts = {};
  contacts.forEach(c => { counts[c.company] = (counts[c.company]||0)+1; });

  const allCos = Array.from(new Set([...Object.keys(COMPANIES), ...Object.keys(counts)]));
  const total = allCos.length;
  const radius = 32;

  allCos.forEach((co, i) => {
    const cnt = counts[co] || 0;
    const d = getCompanyData(co);
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData = { company: co, count: cnt, baseY: 0 };

    // ── Building foundation platform ──
    const platGeo = new THREE.CylinderGeometry(4.5, 5, 0.6, 6);
    const platMat = new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.4, metalness: 0.1 });
    const plat = new THREE.Mesh(platGeo, platMat);
    plat.position.y = 0.3;
    plat.receiveShadow = true;
    plat.castShadow = true;
    group.add(plat);

    // ── Main office tower — glass & steel ──
    const h = Math.max(6, cnt * 6 + 7);
    const w = Math.max(2.6, Math.min(4.0, 2.6 + cnt * 0.4));

    const baseColor = new THREE.Color(d.color);

    // Tower body — multi-segment for realism
    const segments = Math.min(6, Math.max(2, cnt + 1));
    const segH = h / segments;
    for (let s = 0; s < segments; s++) {
      const segW = w * (1 - s * 0.03);
      const segGeo = new THREE.BoxGeometry(segW * 1.4, segH - 0.2, segW * 1.4);
      const tint = baseColor.clone();
      tint.offsetHSL(0, 0, s * 0.03);
      const segMat = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.22,
        metalness: 0.35
      });
      const seg = new THREE.Mesh(segGeo, segMat);
      seg.position.y = 0.6 + s * segH + segH / 2;
      seg.castShadow = true;
      seg.receiveShadow = true;
      group.add(seg);

      // Floor separator line
      if (s > 0) {
        const lineGeo = new THREE.BoxGeometry(segW * 1.5, 0.08, segW * 1.5);
        const lineMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.1, metalness: 0.9,
          transparent: true, opacity: 0.5
        });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.y = 0.6 + s * segH;
        group.add(line);
      }
    }

    // ── Glass dome cap ──
    const capGeo = new THREE.SphereGeometry(w * 0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xe3f2fd, roughness: 0.05, metalness: 0.9,
      transparent: true, opacity: 0.55,
      envMapIntensity: 2.0
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = h + 0.6;
    group.add(cap);

    // ── Antenna/spire on top ──
    const spireGeo = new THREE.CylinderGeometry(0.05, 0.15, 2, 6);
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.2, metalness: 0.8 });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.y = h + 1.6;
    spire.castShadow = true;
    group.add(spire);

    // ── Glowing accent ring if has contacts ──
    if (cnt > 0) {
      const glowGeo = new THREE.TorusGeometry(w * 0.9, 0.12, 8, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: d.color, transparent: true, opacity: 0.9
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 1.2;
      group.add(glow);

      // Pulsing beacon on top
      const beaconGeo = new THREE.SphereGeometry(0.3, 8, 6);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: d.color, transparent: true, opacity: 0.9
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = h + 2.6;
      beacon.name = 'beacon';
      group.add(beacon);
    }

    // ── Small trees/bushes around building base ──
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 });
    for (let b = 0; b < 4; b++) {
      const ba = (b / 4) * Math.PI * 2 + Math.random() * 0.3;
      const bd = 4.5 + Math.random() * 0.5;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.3, 6, 5), bushMat);
      bush.position.set(Math.cos(ba) * bd, 0.4, Math.sin(ba) * bd);
      bush.castShadow = true;
      group.add(bush);
    }

    // ── Billboard label ──
    const label = makeLabel(d.emoji, co, cnt, d.color);
    label.position.y = h + 5;
    group.add(label);

    scene.add(group);
    meshMap.set(co, { group, h });
  });
}

function makeLabel(emoji, name, count, color) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 392;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;

  // Card background with crisp white + black border
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 8, 8, 496, 180, 18);
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 8, 496, 180, 18);
  ctx.stroke();

  // Left color accent bar
  ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
  roundRect(ctx, 10, 10, 12, 176, 8);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Company emoji icon (large)
  ctx.font = '56px serif';
  ctx.textAlign = 'left';
  ctx.fillText(emoji, 34, 78);

  // Company name — pure black
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 31px system-ui, sans-serif';
  ctx.fillText(name.length > 16 ? name.slice(0, 15) + '…' : name, 100, 65);

  // Contact count — pure black/dark high contrast
  ctx.fillStyle = count > 0 ? '#000000' : '#3f3f46';
  ctx.font = '700 22px system-ui, monospace';
  const countText = count > 0 ? `● ${count} HR Contact${count>1?'s':''}` : '○ No contacts';
  ctx.fillText(countText, 100, 100);

  // Stock ticker style
  ctx.fillStyle = '#27272a';
  ctx.font = '700 18px monospace';
  ctx.textAlign = 'right';
  const short = COMPANIES[name]?.short || name.slice(0,4).toUpperCase();
  ctx.fillText(`NSE: ${short}`, 488, 160);

  // "TAP" hint
  if (count > 0) {
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TAP TO VIEW ▸', 100, 160);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1.0, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(14, 5.4, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function updateCam() {
  camera.position.x = camTarget.x + camR * Math.sin(camP) * Math.sin(camT);
  camera.position.y = camTarget.y + camR * Math.cos(camP);
  camera.position.z = camTarget.z + camR * Math.sin(camP) * Math.cos(camT);
  camera.lookAt(camTarget);
}

function setupControls(el) {
  const activePointers = new Map();
  let lastPinchDist = 0;
  let movedDist = 0;

  el.addEventListener('pointerdown', e => {
    if (currentView !== '3d') return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
      isDrag = true;
      movedDist = 0;
      dragStartPos = { x: e.clientX, y: e.clientY };
      prevPos = { x: e.clientX, y: e.clientY };
    } else if (activePointers.size === 2) {
      isDrag = false;
      const pts = Array.from(activePointers.values());
      lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  window.addEventListener('pointermove', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1 && isDrag) {
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;
      movedDist += Math.hypot(dx, dy);
      const sens = e.pointerType === 'touch' ? 0.006 : 0.005;
      camT -= dx * sens;
      camP = Math.max(0.15, Math.min(Math.PI/2.1, camP - dy * sens));
      updateCam();
      prevPos = { x: e.clientX, y: e.clientY };
    } else if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist > 0) {
        camR = Math.max(18, Math.min(140, camR + (lastPinchDist - d) * 0.12));
        updateCam();
      }
      lastPinchDist = d;
    }
  });

  const endPointer = e => {
    if (!activePointers.has(e.pointerId)) return;
    const wasSingle = activePointers.size === 1;
    activePointers.delete(e.pointerId);

    if (wasSingle && isDrag && movedDist < 18) {
      onSceneClick(e);
    }
    if (activePointers.size < 2) lastPinchDist = 0;
    if (activePointers.size === 0) isDrag = false;
  };

  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  el.addEventListener('wheel', e => {
    e.preventDefault();
    camR = Math.max(18, Math.min(140, camR + e.deltaY * 0.04));
    updateCam();
  }, { passive: false });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function onSceneClick(e) {
  if (currentView !== '3d') return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const targets = [];
  meshMap.forEach(v => {
    v.group.traverse(child => {
      if (child.isMesh || child.isSprite) targets.push(child);
    });
  });
  const hits = raycaster.intersectObjects(targets, false);

  if (hits.length) {
    // Walk up to find the group with company data
    let obj = hits[0].object;
    while (obj && !obj.userData.company) obj = obj.parent;
    if (obj && obj.userData.company) {
      openSheet(obj.userData.company);
    }
  }
}

function openSheet(co) {
  popupCompanyTitle.textContent = co;
  renderSheetForCompany(co);
  popupCompanyModal.classList.remove('hidden');
}

function renderSheetForCompany(co) {
  const d = getCompanyData(co);
  const list = contacts.filter(c => c.company.toLowerCase() === co.toLowerCase());
  popupCompanyCount.textContent = `${d.emoji} ${list.length} HR Contact${list.length===1?'':'s'}`;

  if (!list.length) {
    popupCompanyContacts.innerHTML = `<div style="text-align:center;padding:2rem 1rem;color:#aeaeb2;font-size:14px;">No contacts for ${esc(co)} yet.</div>`;
    return;
  }
  popupCompanyContacts.innerHTML = list.map(c => cardHtml(c)).join('');
}

function animLoop() {
  requestAnimationFrame(animLoop);
  animTime += 0.016;

  // Gentle auto-orbit when idle
  if (!isDrag && currentView === '3d') {
    camT += 0.0004;
    updateCam();
  }

  // Animate buildings — subtle float + beacon pulse
  meshMap.forEach((v, name) => {
    const cnt = v.group.userData.count || 0;
    if (cnt > 0) {
      v.group.position.y = Math.sin(animTime * 1.2 + name.length) * 0.12;
    }

    // Beacon pulse
    v.group.traverse(child => {
      if (child.name === 'beacon') {
        child.scale.setScalar(0.8 + Math.sin(animTime * 3 + name.length * 0.5) * 0.4);
        if (child.material) {
          child.material.opacity = 0.5 + Math.sin(animTime * 3 + name.length) * 0.4;
        }
      }
    });
  });

  // Float particles
  if (particleSystem.group) {
    const pos = particleSystem.group.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] += Math.sin(animTime + i) * 0.005;
      if (pos[i + 1] > 35) pos[i + 1] = 5;
    }
    particleSystem.group.geometry.attributes.position.needsUpdate = true;
    particleSystem.group.rotation.y = animTime * 0.01;
  }

  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════════════════════
// View Switching & Event Wiring
// ═══════════════════════════════════════════════════════════════════════════════
function switchView(v) {
  currentView = v;
  const isList = v === 'list';
  tabList.classList.toggle('active', isList);
  tab3D.classList.toggle('active', !isList);
  if (deskTabList) deskTabList.classList.toggle('active', isList);
  if (deskTab3D) deskTab3D.classList.toggle('active', !isList);
  listViewSection.classList.toggle('hidden-panel', !isList);
  world3DOverlay.classList.toggle('hidden-panel', isList);
  threeContainer.classList.toggle('three-hidden', isList);
  if (isList) popupCompanyModal.classList.add('hidden');
}

tabList.addEventListener('click', () => switchView('list'));
tab3D.addEventListener('click', () => switchView('3d'));
if (deskTabList) deskTabList.addEventListener('click', () => switchView('list'));
if (deskTab3D) deskTab3D.addEventListener('click', () => switchView('3d'));

btnQuickAdd.addEventListener('click', () => { modalAddContact.classList.remove('hidden'); inputName.focus(); });
btnCloseForm.addEventListener('click', () => modalAddContact.classList.add('hidden'));
btnCancelForm.addEventListener('click', () => modalAddContact.classList.add('hidden'));
popupCompanyModal.addEventListener('click', e => { if (e.target === popupCompanyModal) popupCompanyModal.classList.add('hidden'); });
btnCloseSheet.addEventListener('click', () => popupCompanyModal.classList.add('hidden'));
modalAddContact.addEventListener('click', e => { if (e.target === modalAddContact) modalAddContact.classList.add('hidden'); });

companySelect.addEventListener('change', e => {
  if (e.target.value === '__custom__') {
    customCompanyInput.classList.remove('hidden');
    customCompanyInput.required = true;
    customCompanyInput.focus();
  } else {
    customCompanyInput.classList.add('hidden');
    customCompanyInput.required = false;
  }
});

contactForm.addEventListener('submit', async e => {
  e.preventDefault();
  const pv = formatIndianPhoneNumber(inputPhone.value);
  if (!pv.valid) { alert('Enter valid 10-digit Indian mobile starting with 6-9.'); inputPhone.focus(); return; }
  let co = companySelect.value;
  if (co === '__custom__') co = customCompanyInput.value.trim();
  if (!co) { alert('Select a company.'); return; }

  await createContact({
    name: inputName.value.trim(),
    phone: pv.formatted,
    company: co,
    role: inputRole.value.trim(),
    email: inputEmail.value.trim(),
    notes: inputNotes.value.trim()
  });
  contactForm.reset();
  companySelect.value = '';
  customCompanyInput.classList.add('hidden');
  modalAddContact.classList.add('hidden');
});

searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderCards(); });

companyPills.addEventListener('click', e => {
  const p = e.target.closest('.pill');
  if (!p) return;
  activeCompanyFilter = p.dataset.company;
  renderPills();
  renderCards();
});

document.addEventListener('click', e => {
  const cb = e.target.closest('button[data-copy]');
  if (cb) {
    navigator.clipboard.writeText(cb.dataset.copy).then(() => {
      const orig = cb.innerHTML;
      cb.innerHTML = '✅ Copied';
      setTimeout(() => { cb.innerHTML = orig; }, 1200);
    });
    return;
  }
  const db = e.target.closest('button[data-delete]');
  if (db) {
    if (confirm('Delete this contact?')) deleteContact(parseInt(db.dataset.delete, 10));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════════════════════════════════
initScene();
fetchContacts();

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
