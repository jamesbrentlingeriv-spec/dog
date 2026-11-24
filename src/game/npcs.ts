import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { groundHeightAt } from './terrain';
import type { ProceduralTextureSet } from './textures';

export type NpcClipState = 'idle' | 'walk' | 'wave' | 'pet';

export interface NpcCharacter {
  id: string;
  name: string;
  role: string;
  glbUrl: string;
  targetHeight: number;
  group: THREE.Group;
  modelRoot?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  currentClip?: NpcClipState;
  position: THREE.Vector3;
  waypoints: THREE.Vector3[];
  currentWaypoint: number;
  walkSpeed: number;
  yaw: number;
  // Interaction state
  pettingTimer: number;
  reactTimer: number;
  hasBeenBefriended: boolean;
  petCooldown: number;
  greetingLine: string;
}

interface NpcBlueprint {
  name: string;
  role: string;
  glbUrl: string;
  targetHeight: number;
  speed: number;
  waypoints: [number, number][];
  greeting: string;
}

const NPC_BLUEPRINTS: NpcBlueprint[] = [
  {
    name: 'Clara',
    role: 'Village Baker',
    glbUrl: '/models/npcs/lady_in_black_dress.glb',
    targetHeight: 1.68,
    speed: 1.25,
    waypoints: [
      [-31, -30],
      [-31, -36],
      [-28, -33],
    ],
    greeting: 'Oh, what a sweet pup! Who wants belly rubs?',
  },
  {
    name: 'Arthur',
    role: 'Town Butcher',
    glbUrl: '/models/npcs/oldman_ernest.glb',
    targetHeight: 1.70,
    speed: 1.05,
    waypoints: [
      [-31, -46],
      [-31, -51],
      [-27, -48],
    ],
    greeting: 'Good dog! I dropped a spare bone out back earlier.',
  },
  {
    name: 'Maya',
    role: 'Morning Jogger',
    glbUrl: '/models/npcs/lady.glb',
    targetHeight: 1.67,
    speed: 2.35,
    waypoints: [
      [14, -6],
      [14, 16],
      [28, 36],
      [54, 18],
      [52, -14],
      [28, -22],
    ],
    greeting: 'Always time to stop for a friendly pup! Belly rub time!',
  },
  {
    name: 'Oliver',
    role: 'Park Ranger',
    glbUrl: '/models/npcs/3d_scan_man_1.glb',
    targetHeight: 1.76,
    speed: 1.4,
    waypoints: [
      [16, -18],
      [34, -22],
      [46, -24],
      [32, -10],
    ],
    greeting: 'Best dog in Barkshire Park! Here, scratch behind the ears.',
  },
  {
    name: 'Eleanor',
    role: 'Botanist',
    glbUrl: '/models/npcs/beth.glb',
    targetHeight: 1.68,
    speed: 1.1,
    waypoints: [
      [24, 12],
      [38, 10],
      [44, 14],
    ],
    greeting: 'Aren’t you adorable! Roll right over for belly rubs!',
  },
  {
    name: 'Mateo',
    role: 'Cafe Barista',
    glbUrl: '/models/npcs/3d_scan_man_1.glb',
    targetHeight: 1.74,
    speed: 1.2,
    waypoints: [
      [-14.5, -28],
      [-14.5, -36],
      [-17, -32],
    ],
    greeting: 'Hey buddy! Looking for a pup cup and belly scratches?',
  },
  {
    name: 'Sam',
    role: 'Town Councilor',
    glbUrl: '/models/npcs/business_man.glb',
    targetHeight: 1.78,
    speed: 1.28,
    waypoints: [
      [-31, 14],
      [-31, 22],
      [-28, 18],
    ],
    greeting: 'Our favorite town mascot! Keep those hydrants guarded, pal.',
  },
  {
    name: 'Chloe',
    role: 'Bookshop Owner',
    glbUrl: '/models/npcs/beth.glb',
    targetHeight: 1.66,
    speed: 1.15,
    waypoints: [
      [-27, -2],
      [-17, -2],
      [-17, -14],
      [-27, -14],
    ],
    greeting: 'Such a polite doggy! Let me bend down and give you pets!',
  },
  {
    name: 'Noah',
    role: 'Park Elder',
    glbUrl: '/models/npcs/oldman_ernest.glb',
    targetHeight: 1.69,
    speed: 1.0,
    waypoints: [
      [18, 22],
      [34, 22],
      [48, 22],
    ],
    greeting: 'Enjoying the view over Willow Pond? Good dog!',
  },
  {
    name: 'Grace',
    role: 'Picnic Musician',
    glbUrl: '/models/npcs/lady.glb',
    targetHeight: 1.66,
    speed: 1.1,
    waypoints: [
      [25, -34],
      [31, -34],
      [28, -31],
    ],
    greeting: 'Come say hi! You deserve the biggest belly rub!',
  },
  {
    name: 'Liam',
    role: 'Park Architect',
    glbUrl: '/models/npcs/business_man.glb',
    targetHeight: 1.79,
    speed: 1.4,
    waypoints: [
      [28, -4],
      [36, -4],
      [32, 2],
    ],
    greeting: 'Nice agility form! Who’s a brilliant dog?!',
  },
  {
    name: 'Hannah',
    role: 'Evening Stroller',
    glbUrl: '/models/npcs/lady_in_black_dress.glb',
    targetHeight: 1.70,
    speed: 1.3,
    waypoints: [
      [-15, 2],
      [-15, 28],
      [-10, 40],
      [6, 36],
      [-6, 18],
    ],
    greeting: 'Aww, hello sweetie! Here come the belly rubs!',
  },
];

function transitionNpcClip(npc: NpcCharacter, desired: NpcClipState, timeScale = 1.0) {
  if (!npc.mixer || !npc.actions) return;
  const act = npc.actions.get(desired) ?? npc.actions.get('idle');
  if (!act) return;

  if (npc.currentClip !== desired) {
    const prev = npc.currentClip ? npc.actions.get(npc.currentClip) : undefined;
    act.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.22).play();
    if (prev && prev !== act) {
      prev.fadeOut(0.22);
    }
    npc.currentClip = desired;
  } else {
    act.setEffectiveTimeScale(timeScale);
  }
}

export function buildNpcPopulation(textures: ProceduralTextureSet): {
  group: THREE.Group;
  npcs: NpcCharacter[];
  update: (elapsed: number, dt: number, dogPos: THREE.Vector3) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const npcs: NpcCharacter[] = [];
  let disposed = false;

  NPC_BLUEPRINTS.forEach((bp, idx) => {
    const npcGroup = new THREE.Group();
    const startX = bp.waypoints[0][0];
    const startZ = bp.waypoints[0][1];
    const startY = groundHeightAt(startX, startZ);
    npcGroup.position.set(startX, startY, startZ);

    // Soft contact shadow under shoes
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.44,
      }),
    );
    cs.rotation.x = -Math.PI / 2;
    cs.position.y = 0.025;
    npcGroup.add(cs);

    group.add(npcGroup);

    npcs.push({
      id: `npc_${idx}`,
      name: bp.name,
      role: bp.role,
      glbUrl: bp.glbUrl,
      targetHeight: bp.targetHeight,
      group: npcGroup,
      position: npcGroup.position,
      waypoints: bp.waypoints.map(([wx, wz]) => new THREE.Vector3(wx, groundHeightAt(wx, wz), wz)),
      currentWaypoint: 1 % bp.waypoints.length,
      walkSpeed: bp.speed,
      yaw: 0,
      pettingTimer: 0,
      reactTimer: 0,
      hasBeenBefriended: false,
      petCooldown: 0,
      greetingLine: bp.greeting,
    });
  });

  // Load each unique NPC GLB once and clone across assigned townsfolk
  const loader = new GLTFLoader();
  const uniqueUrls = Array.from(new Set(NPC_BLUEPRINTS.map((b) => b.glbUrl)));

  uniqueUrls.forEach((url) => {
    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        const matching = npcs.filter((n) => n.glbUrl === url);
        matching.forEach((npc, cloneIdx) => {
          const cloned = SkeletonUtils.clone(gltf.scene);
          cloned.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
              m.frustumCulled = false;
            }
          });

          // Normalize height & ensure shoes rest cleanly on y=0
          cloned.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(cloned);
          const sz = new THREE.Vector3();
          const ctr = new THREE.Vector3();
          box.getSize(sz);
          box.getCenter(ctr);
          const rawH = Math.max(sz.y, 0.1);
          const sc = npc.targetHeight / rawH;
          cloned.scale.setScalar(sc);
          cloned.position.set(-ctr.x * sc, -box.min.y * sc, -ctr.z * sc);

          npc.group.add(cloned);
          npc.modelRoot = cloned;

          const mixer = new THREE.AnimationMixer(cloned);
          const actions = new Map<string, THREE.AnimationAction>();
          gltf.animations.forEach((clip) => {
            actions.set(clip.name, mixer.clipAction(clip));
          });
          npc.mixer = mixer;
          npc.actions = actions;

          // Stagger initial animation phase so clones don't step in lockstep
          transitionNpcClip(npc, 'walk', 1.0);
          mixer.update(cloneIdx * 0.47);
        });
      },
      undefined,
      (err) => {
        console.warn(`Failed to load NPC GLB ${url}:`, err);
      },
    );
  });

  const _toTarget = new THREE.Vector3();

  const update = (_elapsed: number, dt: number, dogPos: THREE.Vector3) => {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (npc.petCooldown > 0) npc.petCooldown -= dt;

      if (npc.pettingTimer > 0) {
        npc.pettingTimer -= dt;

        // Turn smoothly toward the dog & step close enough (~0.75m) so hand strokes the dog!
        const dx = dogPos.x - npc.position.x;
        const dz = dogPos.z - npc.position.z;
        const dist = Math.hypot(dx, dz);
        const angleToDog = Math.atan2(dx, dz);
        let yawDiff = angleToDog - npc.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        npc.yaw += yawDiff * Math.min(1, dt * 10);
        npc.group.rotation.y = npc.yaw;

        if (dist > 0.78 && dist < 4.5) {
          const stepIn = Math.min(dist - 0.72, dt * 3.2);
          npc.position.x += (dx / dist) * stepIn;
          npc.position.z += (dz / dist) * stepIn;
          npc.position.y = groundHeightAt(npc.position.x, npc.position.z);
        }

        transitionNpcClip(npc, 'pet', 1.0);
        npc.mixer?.update(dt);
        continue;
      }

      const distToDog = npc.position.distanceTo(dogPos);
      if (distToDog < 3.4) {
        // Pause politely, face the dog, and wave warmly!
        const angleToDog = Math.atan2(dogPos.x - npc.position.x, dogPos.z - npc.position.z);
        let diff = angleToDog - npc.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.yaw += diff * Math.min(1, dt * 6);
        npc.group.rotation.y = npc.yaw;

        transitionNpcClip(npc, 'wave', 1.0);
        npc.mixer?.update(dt);
        continue;
      }

      // Patrol along waypoints
      const wp = npc.waypoints[npc.currentWaypoint];
      _toTarget.set(wp.x - npc.position.x, 0, wp.z - npc.position.z);
      const dist = _toTarget.length();
      if (dist < 0.7) {
        npc.currentWaypoint = (npc.currentWaypoint + 1) % npc.waypoints.length;
        transitionNpcClip(npc, 'idle', 1.0);
      } else {
        _toTarget.divideScalar(dist);
        npc.position.x += _toTarget.x * npc.walkSpeed * dt;
        npc.position.z += _toTarget.z * npc.walkSpeed * dt;
        npc.position.y = groundHeightAt(npc.position.x, npc.position.z);

        const targetYaw = Math.atan2(_toTarget.x, _toTarget.z);
        let diff = targetYaw - npc.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.yaw += diff * Math.min(1, dt * 6);
        npc.group.rotation.y = npc.yaw;

        const walkRate = THREE.MathUtils.clamp(npc.walkSpeed / 1.25, 0.78, 1.85);
        transitionNpcClip(npc, 'walk', walkRate);
      }

      npc.mixer?.update(dt);
    }
  };

  const dispose = () => {
    disposed = true;
    npcs.forEach((n) => n.mixer?.stopAllAction());
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
        else m.material?.dispose();
      }
    });
  };

  return { group, npcs, update, dispose };
}
