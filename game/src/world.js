// world.js — turns map.js data into the three.js scene: one ground plane
// with a painted canvas texture (zones, site letters, hazard stripes, lane
// paint), a mesh per map box in the foundry palette, explosive barrels, the
// bomb device, sun + shadows and fog. All procedural — the game ships no
// image or model files at all.

import * as THREE from 'three';
import { BOXES, BARRELS, SITES } from './map.js';
import { PALETTE } from './config.js';

export let scene, camera, renderer;
export const barrelViews = [];
export let bombView = null;
const beacons = [];

const MATS = {};
function materials() {
  const std = (color, rough = 0.92, metal = 0.04) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  MATS.concrete = std(PALETTE.concrete);
  MATS.concreteDark = std(PALETTE.concreteDark);
  MATS.steel = std(PALETTE.steel, 0.6, 0.45);
  MATS.steelLight = std(PALETTE.steelLight, 0.55, 0.4);
  MATS.rust = std(PALETTE.rust, 0.85, 0.1);
  MATS.contRed = std(PALETTE.containerRed, 0.7, 0.25);
  MATS.contTeal = std(PALETTE.containerTeal, 0.7, 0.25);
  MATS.contSand = std(PALETTE.containerSand, 0.75, 0.2);
  MATS.crate = std(PALETTE.crate, 0.95, 0);
  MATS.crateDark = std(PALETTE.crateDark, 0.95, 0);
  MATS.hazard = std(PALETTE.hazard, 0.8, 0.05);
  MATS.dark = std(PALETTE.dark, 1, 0);
}

// The ground texture: painted once onto a 1024² canvas — asphalt with wear,
// concrete pads under the sites, amber plant-zone outlines with the site
// letters, lane dashes and hazard stripes at the site doors.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 768;
  const g = c.getContext('2d');
  const X = (x) => ((x + 33) / 66) * 1024;
  const Z = (z) => ((z + 25) / 50) * 768;
  g.fillStyle = '#595c59';
  g.fillRect(0, 0, 1024, 768);
  // Wear: thousands of speckles and a few darker patches.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${20 + Math.random() * 40 | 0},${18 + Math.random() * 36 | 0},${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * 1024, Math.random() * 768, 2.4, 2.4);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(30,30,30,0.10)';
    g.beginPath();
    g.ellipse(Math.random() * 1024, Math.random() * 768, 30 + Math.random() * 90, 20 + Math.random() * 60, Math.random() * 3, 0, 7);
    g.fill();
  }
  // Expansion joints.
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.lineWidth = 2;
  for (let x = -30; x <= 30; x += 6) { g.beginPath(); g.moveTo(X(x), 8); g.lineTo(X(x), 760); g.stroke(); }
  for (let z = -22.5; z <= 22.5; z += 5) { g.beginPath(); g.moveTo(8, Z(z)); g.lineTo(1016, Z(z)); g.stroke(); }
  // Concrete pads under the sites and the sentinel room.
  g.fillStyle = '#6d6e68';
  g.fillRect(X(15), Z(-24), X(32.5) - X(15), Z(24) - Z(-24));
  g.fillStyle = '#63655f';
  g.fillRect(X(-32), Z(-11), X(-7) - X(-32), Z(11) - Z(-11));
  // Mid lane dashes.
  g.fillStyle = 'rgba(236,231,219,0.5)';
  for (let x = -6; x < 20; x += 4) g.fillRect(X(x), Z(0) - 2, X(x + 1.6) - X(x), 4);
  // Plant zones: amber outline, letter, corner ticks.
  for (const s of [SITES.A, SITES.B]) {
    g.strokeStyle = '#f5a524';
    g.lineWidth = 5;
    g.strokeRect(X(s.x0), Z(s.z0), X(s.x1) - X(s.x0), Z(s.z1) - Z(s.z0));
    g.fillStyle = 'rgba(245,165,36,0.85)';
    g.font = `800 ${Math.round(Z(1) - Z(0)) * 4}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText(s.id, X((s.x0 + s.x1) / 2), Z((s.z0 + s.z1) / 2) + 30);
  }
  // Hazard stripes at the two main site doors.
  const stripe = (x, z, w) => {
    g.save();
    g.beginPath(); g.rect(X(x), Z(z), X(x + w) - X(x), 12); g.clip();
    g.fillStyle = '#c9930a';
    g.fillRect(X(x), Z(z), X(x + w) - X(x), 12);
    g.fillStyle = '#22252a';
    for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(X(x) + i * 14, Z(z) + 12); g.lineTo(X(x) + i * 14 + 8, Z(z)); g.lineTo(X(x) + i * 14 + 15, Z(z)); g.lineTo(X(x) + i * 14 + 7, Z(z) + 12); g.fill(); }
    g.restore();
  };
  stripe(13.4, -15.4, 5.2);
  stripe(13.4, 14.8, 5.2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildWorld(container) {
  materials();
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 140);
  // A small procedural environment — a gradient sky dome with one bright
  // patch for the sun — so the PBR materials have something to reflect.
  // Without it, metal-leaning surfaces render black under pure lighting.
  {
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x8fa8b5 }));
    envScene.add(dome);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff3da }));
    sunBall.position.set(-5, 8, 4);
    envScene.add(sunBall);
    const floorPad = new THREE.Mesh(new THREE.PlaneGeometry(18, 18),
      new THREE.MeshBasicMaterial({ color: 0x555049 }));
    floorPad.rotation.x = Math.PI / 2;
    floorPad.position.y = -3;
    envScene.add(floorPad);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);

  const hemi = new THREE.HemisphereLight(0xd8ecf5, 0x55504a, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
  sun.position.set(-26, 50, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48; sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x505a62, 0.55));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 50),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // The map boxes themselves.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of BOXES) {
    const m = new THREE.Mesh(boxGeo, MATS[b.mat] ?? MATS.concrete);
    m.position.set(b.x, b.y + b.h / 2, b.z);
    m.scale.set(b.w, b.h, b.d);
    m.castShadow = b.h > 1.3;
    m.receiveShadow = true;
    scene.add(m);
    // A hazard cap on the tall cover stacks, so good cover reads at a glance.
    if (b.mat === 'crateDark') {
      const cap = new THREE.Mesh(boxGeo, MATS.hazard);
      cap.position.set(b.x, b.y + b.h + 0.03, b.z);
      cap.scale.set(b.w * 0.96, 0.06, b.d * 0.96);
      scene.add(cap);
    }
  }

  // Explosive barrels.
  const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 14);
  const barrelMat = new THREE.MeshStandardMaterial({ color: PALETTE.barrel, roughness: 0.55, metalness: 0.35 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.3 });
  for (const bp of BARRELS) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(barrelGeo, barrelMat);
    body.castShadow = true;
    grp.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.1, 14), bandMat);
    grp.add(band);
    grp.position.set(bp.x, 0.48, bp.z);
    scene.add(grp);
    barrelViews.push(grp);
  }

  // The bomb device: a dark case, a keypad glow and a blinking beacon.
  bombView = new THREE.Group();
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.5, metalness: 0.4 }));
  caseMesh.position.y = 0.07;
  bombView.add(caseMesh);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x11100c, emissive: 0xf5a524, emissiveIntensity: 0.7 }));
  pad.position.y = 0.145;
  bombView.add(pad);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 }));
  led.position.set(0.13, 0.15, 0);
  led.name = 'led';
  bombView.add(led);
  bombView.visible = false;
  scene.add(bombView);

  // Distant foundry silhouettes and two chimney beacons, outside the walls.
  // A blue-grey industrial tone, light enough to read as buildings in haze
  // rather than as holes in the world.
  const decoMat = new THREE.MeshStandardMaterial({ color: 0x46525c, roughness: 0.95, metalness: 0.02 });
  const silhouettes = [[44, 0, 12, 34, 11], [-44, -12, 10, 26, 9], [0, -37, 34, 9, 7], [-14, 37, 26, 9, 10], [24, 36, 16, 8, 6]];
  for (const [x, z, w, d, h] of silhouettes) {
    const m = new THREE.Mesh(boxGeo, decoMat);
    m.position.set(x, h / 2, z);
    m.scale.set(w, h, d);
    scene.add(m);
  }
  for (const [x, z] of [[44, -14], [-44, 8]]) {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 17, 10), decoMat);
    ch.position.set(x, 8.5, z);
    scene.add(ch);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3333, emissiveIntensity: 1.5 }));
    beacon.position.set(x, 17.4, z);
    scene.add(beacon);
    beacons.push(beacon);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  return { scene, camera, renderer };
}

/** Per-frame view upkeep: beacon pulses and the bomb's LED. */
export function updateWorld(t) {
  const pulse = 0.6 + Math.sin(t * 2.4) * 0.9;
  for (const b of beacons) b.material.emissiveIntensity = Math.max(0.15, pulse);
  if (bombView && bombView.visible) {
    const led = bombView.getObjectByName('led');
    if (led) led.material.emissiveIntensity = (t % 1) < 0.12 ? 3.2 : 0.25;
  }
}
