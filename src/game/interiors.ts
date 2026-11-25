import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CollisionWorld } from './terrain';
import type { ProceduralTextureSet } from './textures';
import type { StoreInteriorId } from './types';

export interface IndoorTreat {
  id: string;
  name: string;
  position: THREE.Vector3;
  group: THREE.Group;
  found: boolean;
  hungerRestore: number;
  energyRestore: number;
}

export interface IndoorNpc {
  name: string;
  role: string;
  greetingLine: string;
  group: THREE.Group;
  position: THREE.Vector3;
  yaw: number;
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  currentClip?: string;
  pettingTimer: number;
  petCooldown: number;
  hasBeenBefriended: boolean;
}

export interface ActiveStoreInterior {
  id: StoreInteriorId;
  name: string;
  root: THREE.Group;
  collision: CollisionWorld;
  spawnPos: THREE.Vector3;
  spawnYaw: number;
  exitPos: THREE.Vector3;
  treats: IndoorTreat[];
  npc: IndoorNpc;
  roomHalfW: number;
  roomHalfD: number;
  roomHeight: number;
  update: (elapsed: number, dt: number, dogPos: THREE.Vector3) => void;
  dispose: () => void;
}

function makeTiledFloorTexture(
  c1: string,
  c2: string,
  grout: string,
  tiles = 8,
  repeat = 4,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const step = 512 / tiles;
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? c1 : c2;
      ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

function makeWallBannerTexture(title: string, subtitle: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.fillStyle = fg;
  ctx.font = 'bold 42px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 62);
  ctx.font = '600 22px sans-serif';
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.85;
  ctx.fillText(subtitle, 256, 114);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function transitionIndoorNpc(npc: IndoorNpc, desired: 'idle' | 'wave' | 'pet') {
  if (!npc.mixer || !npc.actions) return;
  const act = npc.actions.get(desired) ?? npc.actions.get('idle');
  if (!act) return;
  if (npc.currentClip !== desired) {
    const prev = npc.currentClip ? npc.actions.get(npc.currentClip) : undefined;
    act.reset().setEffectiveWeight(1).fadeIn(0.22).play();
    if (prev && prev !== act) prev.fadeOut(0.22);
    npc.currentClip = desired;
  }
}

export function buildStoreInterior(
  id: StoreInteriorId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): ActiveStoreInterior {
  const root = new THREE.Group();
  root.name = `interior:${id}`;
  const collision = new CollisionWorld();
  const treats: IndoorTreat[] = [];
  const extraTextures: THREE.Texture[] = [];
  let disposed = false;

  const gltfLoader = new GLTFLoader();

  const spec =
    id === 'supermarket'
      ? {
          name: 'Barkshire Supermarket',
          subtitle: 'Fresh Produce · Aisles · Dog Treats',
          halfW: 8.4,
          halfD: 8.0,
          height: 4.6,
          wallColor: 0xe9e4d8,
          trimColor: 0x3b4d3e,
          ceilingColor: 0xf4f1ea,
          bannerBg: '#234232',
          bannerFg: '#f7e6bf',
          floorTex: makeTiledFloorTexture('#e2ded5', '#d5d0c5', '#b5afa2', 8, 5),
          npcName: 'Marcus',
          npcRole: 'Supermarket Grocer',
          npcGlb: '/models/npcs/business_man.glb',
          npcPos: new THREE.Vector3(-4.2, 0, -4.6),
          npcGreeting: 'Welcome to Barkshire Supermarket! Watch out for the treat aisle, buddy!',
        }
      : id === 'bakery'
        ? {
            name: 'Barkshire Bakery',
            subtitle: 'Warm Croissants · Biscuits · Pup Cups',
            halfW: 5.8,
            halfD: 5.4,
            height: 3.9,
            wallColor: 0xf2e4cf,
            trimColor: 0x6b3b24,
            ceilingColor: 0xf9f2e6,
            bannerBg: '#5c2a1b',
            bannerFg: '#f8ecd4',
            floorTex: makeTiledFloorTexture('#e8dfd1', '#c7b8a3', '#968773', 6, 4),
            npcName: 'Clara',
            npcRole: 'Head Baker',
            npcGlb: '/models/npcs/lady.glb',
            npcPos: new THREE.Vector3(0, 0, -2.5),
            npcGreeting: 'Fresh out of the oven! Come get a belly rub and a warm pup biscuit!',
          }
        : {
            name: 'Paws & Collars Pet Store',
            subtitle: 'Gourmet Treats · Toys · Plush Beds',
            halfW: 6.4,
            halfD: 5.8,
            height: 4.0,
            wallColor: 0xe6ece3,
            trimColor: 0x385947,
            ceilingColor: 0xf6f4ee,
            bannerBg: '#4c2614',
            bannerFg: '#ffe6a8',
            floorTex: null as THREE.CanvasTexture | null,
            npcName: 'Beth',
            npcRole: 'Pet Store Owner',
            npcGlb: '/models/npcs/beth.glb',
            npcPos: new THREE.Vector3(0, 0, -2.8),
            npcGreeting: 'Welcome to Paws & Collars! Every good dog gets free samples and belly rubs!',
          };

  if (spec.floorTex) extraTextures.push(spec.floorTex);

  const W = spec.halfW * 2;
  const D = spec.halfD * 2;
  const H = spec.height;

  // 1. Warm Indoor Lighting Rig
  const ambient = new THREE.HemisphereLight(0xfff5e4, 0x8f7d69, 1.15);
  root.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff3dd, 1.1);
  keyLight.position.set(3, H - 0.3, 4);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  root.add(keyLight);

  const ceilingLight1 = new THREE.PointLight(0xffedd2, 14, 22, 1.6);
  ceilingLight1.position.set(-spec.halfW * 0.4, H - 0.5, -spec.halfD * 0.25);
  root.add(ceilingLight1);

  const ceilingLight2 = new THREE.PointLight(0xffedd2, 14, 22, 1.6);
  ceilingLight2.position.set(spec.halfW * 0.4, H - 0.5, spec.halfD * 0.25);
  root.add(ceilingLight2);

  // 2. Enclosed Room Shell (Floor, Walls, Baseboards, Ceiling, Overhead Light Fixtures)
  const floorMat = new THREE.MeshStandardMaterial({
    map: spec.floorTex ?? textures.woodAlbedo,
    roughness: 0.72,
    metalness: 0.04,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({
    color: spec.wallColor,
    roughness: 0.88,
    metalness: 0.02,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: spec.trimColor,
    roughness: 0.65,
    metalness: 0.05,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: spec.ceilingColor,
    roughness: 0.92,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    roughness: 0.68,
  });

  // Back, Front, Left, Right walls
  const addWall = (w: number, h: number, x: number, y: number, z: number, rotY: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    root.add(m);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 0.08), trimMat);
    trim.position.set(x, 0.14, z);
    trim.rotation.y = rotY;
    root.add(trim);
  };
  addWall(W, H, 0, H / 2, -spec.halfD, 0);
  addWall(W, H, 0, H / 2, spec.halfD, Math.PI);
  addWall(D, H, -spec.halfW, H / 2, 0, Math.PI / 2);
  addWall(D, H, spec.halfW, H / 2, 0, -Math.PI / 2);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  root.add(ceiling);

  // Overhead warm ceiling light panels
  const lightPanelMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7 });
  for (let lx = -1; lx <= 1; lx += 2) {
    for (let lz = -1; lz <= 1; lz += 2) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), lightPanelMat);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(lx * spec.halfW * 0.42, H - 0.03, lz * spec.halfD * 0.36);
      root.add(panel);
    }
  }

  // Room boundary colliders (thick exterior walls so dog stays strictly indoors)
  collision.addBox(0, -spec.halfD - 0.5, W + 2, 1.1);
  collision.addBox(0, spec.halfD + 0.5, W + 2, 1.1);
  collision.addBox(-spec.halfW - 0.5, 0, 1.1, D + 2);
  collision.addBox(spec.halfW + 0.5, 0, 1.1, D + 2);

  // Back wall Store Banner
  const bannerTex = makeWallBannerTexture(spec.name, spec.subtitle, spec.bannerBg, spec.bannerFg);
  extraTextures.push(bannerTex);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 1.45),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.5 }),
  );
  banner.position.set(0, H - 1.15, -spec.halfD + 0.04);
  root.add(banner);

  // Front Exit Doorway + Welcome Mat on +Z wall
  const exitPos = new THREE.Vector3(0, 0, spec.halfD - 1.0);
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.6 });
  const doorGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xaed4ed,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55,
  });
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.75, 0.14), doorFrameMat);
  doorFrame.position.set(0, 1.38, spec.halfD - 0.06);
  root.add(doorFrame);
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(2.05, 2.4, 0.16), doorGlassMat);
  doorGlass.position.set(0, 1.35, spec.halfD - 0.06);
  root.add(doorGlass);

  const exitSignTex = makeWallBannerTexture('EXIT TO BARKSHIRE', 'Press E to head outside', '#1f4d36', '#e9fff3');
  extraTextures.push(exitSignTex);
  const exitSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.56),
    new THREE.MeshBasicMaterial({ map: exitSignTex }),
  );
  exitSign.position.set(0, 3.05, spec.halfD - 0.05);
  exitSign.rotation.y = Math.PI;
  root.add(exitSign);

  const matMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.03, 1.25),
    new THREE.MeshStandardMaterial({ color: 0x7a4829, roughness: 0.95 }),
  );
  matMesh.position.set(0, 0.015, spec.halfD - 0.85);
  matMesh.receiveShadow = true;
  root.add(matMesh);

  // Helper to spawn a collectible indoor treat
  const addIndoorTreat = (
    idx: number,
    name: string,
    x: number,
    z: number,
    glbUrl: string,
    scale = 1.35,
  ) => {
    const grp = new THREE.Group();
    grp.position.set(x, 0.14, z);
    gltfLoader.load(
      glbUrl,
      (gltf) => {
        if (disposed) return;
        const m = gltf.scene;
        m.scale.setScalar(scale);
        m.traverse((ch) => {
          if ((ch as THREE.Mesh).isMesh) ch.castShadow = !isSoftwareGl;
        });
        grp.add(m);
      },
      undefined,
      () => {},
    );
    root.add(grp);
    treats.push({
      id: `${id}_treat_${idx}`,
      name,
      position: new THREE.Vector3(x, 0.14, z),
      group: grp,
      found: false,
      hungerRestore: 18,
      energyRestore: 12,
    });
  };

  // 3. Store-Specific Furnishings & Props
  if (id === 'supermarket') {
    // Load the stocked supermarket aisles GLB cleanly inside our enclosed hall!
    gltfLoader.load(
      '/models/world/ready/building_supermarket.glb',
      (gltf) => {
        if (disposed) return;
        const market = gltf.scene;
        market.traverse((ch) => {
          if ((ch as THREE.Mesh).isMesh) {
            const m = ch as THREE.Mesh;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mt) => {
              if (mt) mt.side = THREE.DoubleSide;
            });
          }
        });
        market.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(market);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);
        const sc = Math.min((W - 2.4) / Math.max(sz.x, 0.1), (D - 3.6) / Math.max(sz.z, 0.1));
        market.scale.setScalar(sc);
        market.position.set(-ctr.x * sc, -box.min.y * sc, -ctr.z * sc - 0.6);
        root.add(market);
      },
      undefined,
      () => {},
    );

    // Checkout counter near front-left
    const checkout = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.96, 1.0), woodMat);
    checkout.position.set(-4.2, 0.48, -3.5);
    checkout.castShadow = true;
    checkout.receiveShadow = true;
    root.add(checkout);
    collision.addBox(-4.2, -3.5, 3.3, 1.1);

    addIndoorTreat(0, 'Aisle 3 Doggy Treats', 0.0, 1.5, '/models/world/ready/prop_treats.glb', 1.45);
    addIndoorTreat(1, 'Fresh Market Apple', 4.2, -0.5, '/models/world/ready/prop_apple.glb', 1.5);
    addIndoorTreat(2, 'Sweet Market Banana', -3.8, 2.2, '/models/world/ready/prop_banana.glb', 1.5);
  } else if (id === 'pet_store') {
    // Boutique Checkout Counter in back-center
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.02, 1.15), woodMat);
    counter.position.set(0, 0.51, -3.8);
    counter.castShadow = true;
    counter.receiveShadow = true;
    root.add(counter);
    collision.addBox(0, -3.8, 3.9, 1.25);

    // Left & Right wooden display shelving units stocked with treat bags & toys
    const shelfColors = [0xd9534f, 0x3b82f6, 0xf59e0b, 0x10b981, 0x8b5cf6];
    [-spec.halfW + 0.55, spec.halfW - 0.55].forEach((sx, sideIdx) => {
      for (let row = 0; row < 2; row++) {
        const sz = -2.2 + row * 3.8;
        const unit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.1, 2.9), woodMat);
        unit.position.set(sx, 1.05, sz);
        unit.castShadow = true;
        unit.receiveShadow = true;
        root.add(unit);
        collision.addBox(sx, sz, 0.95, 3.0);

        // Colorful plush toys, balls & treat boxes on shelves
        for (let k = 0; k < 4; k++) {
          const toy = new THREE.Mesh(
            k % 2 === 0 ? new THREE.SphereGeometry(0.16, 12, 10) : new THREE.BoxGeometry(0.28, 0.32, 0.22),
            new THREE.MeshStandardMaterial({
              color: shelfColors[(k + row + sideIdx) % shelfColors.length],
              roughness: 0.55,
            }),
          );
          toy.position.set(sx + (sideIdx === 0 ? 0.32 : -0.32), 1.45 + (k % 2) * 0.42, sz - 0.9 + k * 0.6);
          root.add(toy);
        }
      }
    });

    // 3 Cozy Plush Dog Beds in the center display area (dogs can walk right onto them!)
    const bedColors = [0x9e3b33, 0x2b5978, 0xb88435];
    [
      [-2.5, 0.2],
      [2.5, 0.2],
      [2.5, -2.1],
    ].forEach(([bx, bz], i) => {
      const cushion = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.05, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: bedColors[i], roughness: 0.92 }),
      );
      cushion.position.set(bx, 0.11, bz);
      cushion.receiveShadow = true;
      root.add(cushion);
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.24, 18),
        new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.96 }),
      );
      inner.position.set(bx, 0.11, bz);
      inner.receiveShadow = true;
      root.add(inner);
    });

    // Free sample doggy treat bags on the floor
    addIndoorTreat(0, 'Pet Store Gourmet Sample', -2.4, 2.2, '/models/world/ready/prop_treats.glb', 1.45);
    addIndoorTreat(1, 'Chewy Bacon Strips', 2.4, 2.2, '/models/world/ready/prop_treats.glb', 1.45);
  } else {
    // Barkshire Bakery: Glass pastry counter + bistro tables + warm treats
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.0, 1.15), woodMat);
    counter.position.set(0, 0.5, -3.4);
    counter.castShadow = true;
    counter.receiveShadow = true;
    root.add(counter);
    const glassCase = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.62, 0.85),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.42 }),
    );
    glassCase.position.set(0, 1.31, -3.4);
    root.add(glassCase);
    collision.addBox(0, -3.4, 4.5, 1.25);

    // Two cozy bistro tables
    [
      [-3.1, 0.8],
      [3.1, 0.8],
    ].forEach(([tx, tz]) => {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 18), woodMat);
      top.position.set(tx, 0.82, tz);
      top.castShadow = true;
      root.add(top);
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.25, 0.82, 10),
        new THREE.MeshStandardMaterial({ color: 0x2a292b, roughness: 0.4, metalness: 0.7 }),
      );
      leg.position.set(tx, 0.41, tz);
      root.add(leg);
      collision.addCircle(tx, tz, 0.95);
    });

    addIndoorTreat(0, 'Warm Pup Biscuit', -1.8, -1.6, '/models/world/ready/prop_treats.glb', 1.4);
    addIndoorTreat(1, 'Bakery Sweet Apple', 2.1, -1.6, '/models/world/ready/prop_apple.glb', 1.45);
  }

  // 4. Friendly Animated Indoor Shopkeeper NPC (waves & bends down to pet!)
  const npcGroup = new THREE.Group();
  npcGroup.position.copy(spec.npcPos);
  const npcCs = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
    }),
  );
  npcCs.rotation.x = -Math.PI / 2;
  npcCs.position.y = 0.02;
  npcGroup.add(npcCs);
  root.add(npcGroup);

  const npc: IndoorNpc = {
    name: spec.npcName,
    role: spec.npcRole,
    greetingLine: spec.npcGreeting,
    group: npcGroup,
    position: npcGroup.position,
    yaw: 0,
    pettingTimer: 0,
    petCooldown: 0,
    hasBeenBefriended: false,
  };

  gltfLoader.load(
    spec.npcGlb,
    (gltf) => {
      if (disposed) return;
      const cloned = SkeletonUtils.clone(gltf.scene);
      cloned.traverse((ch) => {
        if ((ch as THREE.Mesh).isMesh) {
          const m = ch as THREE.Mesh;
          m.castShadow = false;
          m.receiveShadow = true;
        }
      });
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const sz = new THREE.Vector3();
      const ctr = new THREE.Vector3();
      box.getSize(sz);
      box.getCenter(ctr);
      const sc = 1.7 / Math.max(sz.y, 0.1);
      cloned.scale.setScalar(sc);
      cloned.position.set(-ctr.x * sc, -box.min.y * sc, -ctr.z * sc);
      npcGroup.add(cloned);

      const mixer = new THREE.AnimationMixer(cloned);
      const actions = new Map<string, THREE.AnimationAction>();
      gltf.animations.forEach((clip) => actions.set(clip.name, mixer.clipAction(clip)));
      npc.mixer = mixer;
      npc.actions = actions;
      transitionIndoorNpc(npc, 'idle');
    },
    undefined,
    () => {},
  );

  const update = (elapsed: number, dt: number, dogPos: THREE.Vector3) => {
    if (npc.petCooldown > 0) npc.petCooldown -= dt;
    // Gently bob indoor treats
    for (let i = 0; i < treats.length; i++) {
      const tr = treats[i];
      if (!tr.found) {
        tr.group.rotation.y = elapsed * 1.4 + i;
        tr.group.position.y = 0.14 + Math.sin(elapsed * 2.6 + i) * 0.04;
      }
    }

    // Face the dog & bend down to pet when interacting
    const dx = dogPos.x - npc.position.x;
    const dz = dogPos.z - npc.position.z;
    const dist = Math.hypot(dx, dz);
    const angleToDog = Math.atan2(dx, dz);
    let diff = angleToDog - npc.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    npc.yaw += diff * Math.min(1, dt * 7);
    npc.group.rotation.y = npc.yaw;

    if (npc.pettingTimer > 0) {
      npc.pettingTimer -= dt;
      transitionIndoorNpc(npc, 'pet');
    } else if (dist < 4.5) {
      transitionIndoorNpc(npc, 'wave');
    } else {
      transitionIndoorNpc(npc, 'idle');
    }
    npc.mixer?.update(dt);
  };

  const dispose = () => {
    disposed = true;
    npc.mixer?.stopAllAction();
    extraTextures.forEach((t) => t.dispose());
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mt) => mt?.dispose());
      }
    });
  };

  return {
    id,
    name: spec.name,
    root,
    collision,
    spawnPos: new THREE.Vector3(0, 0, spec.halfD - 1.9),
    spawnYaw: Math.PI, // Facing into the store
    exitPos,
    treats,
    npc,
    roomHalfW: spec.halfW,
    roomHalfD: spec.halfD,
    roomHeight: H,
    update,
    dispose,
  };
}
