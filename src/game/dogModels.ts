import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ProceduralTextureSet } from './textures';
import type {
  DogActionState,
  DogBreedConfig,
  GlbAnimationMapping,
  SocialReward,
} from './types';

export interface ActiveDogRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  source: 'procedural' | 'glb';
  // Procedural parts
  legs?: {
    fl: THREE.Group;
    fr: THREE.Group;
    bl: THREE.Group;
    br: THREE.Group;
  };
  headPivot?: THREE.Group;
  jawPivot?: THREE.Group;
  tailPivot?: THREE.Group;
  ears?: { left: THREE.Group; right: THREE.Group };
  // GLB animation runtime
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  currentClipName?: string;
  clipMapping?: GlbAnimationMapping;
  glbWrapper?: THREE.Group;
  baseBodyY: number;
  // Reward accessory meshes attached to rig
  rewardMeshes: Record<SocialReward['id'], THREE.Object3D>;
  dispose: () => void;
}

interface ProceduralBreedPalette {
  primary: number;
  secondary: number;
  accent: number;
  nose: number;
  collar: number;
  bodyLen: number;
  bodyWidth: number;
  bodyHeight: number;
  legLen: number;
  legRadius: number;
  headScale: number;
  snoutLen: number;
  earStyle: 'floppy' | 'upright' | 'long_floppy';
  tailStyle: 'plumed' | 'stub' | 'curled' | 'slender';
}

const BREED_PALETTES: Record<'golden' | 'corgi' | 'husky' | 'dachshund', ProceduralBreedPalette> = {
  golden: {
    primary: 0xd6a152,
    secondary: 0xebd19b,
    accent: 0xc28738,
    nose: 0x1e1917,
    collar: 0x245c46,
    bodyLen: 0.92,
    bodyWidth: 0.4,
    bodyHeight: 0.36,
    legLen: 0.44,
    legRadius: 0.068,
    headScale: 1.0,
    snoutLen: 0.24,
    earStyle: 'floppy',
    tailStyle: 'plumed',
  },
  corgi: {
    primary: 0xd68944,
    secondary: 0xf7f1e3,
    accent: 0xb96a2a,
    nose: 0x1c1917,
    collar: 0x26548a,
    bodyLen: 0.84,
    bodyWidth: 0.36,
    bodyHeight: 0.32,
    legLen: 0.22,
    legRadius: 0.058,
    headScale: 0.96,
    snoutLen: 0.2,
    earStyle: 'upright',
    tailStyle: 'stub',
  },
  husky: {
    primary: 0x525a66,
    secondary: 0xf2f4f7,
    accent: 0x2e343d,
    nose: 0x17181c,
    collar: 0x9b2c2c,
    bodyLen: 0.98,
    bodyWidth: 0.42,
    bodyHeight: 0.39,
    legLen: 0.5,
    legRadius: 0.07,
    headScale: 1.02,
    snoutLen: 0.26,
    earStyle: 'upright',
    tailStyle: 'curled',
  },
  dachshund: {
    primary: 0x6b321d,
    secondary: 0x9e532b,
    accent: 0x421d11,
    nose: 0x171413,
    collar: 0x8f6b1c,
    bodyLen: 0.96,
    bodyWidth: 0.27,
    bodyHeight: 0.24,
    legLen: 0.17,
    legRadius: 0.048,
    headScale: 0.82,
    snoutLen: 0.24,
    earStyle: 'long_floppy',
    tailStyle: 'slender',
  },
};

function createFurMaterial(color: number, roughness = 0.86) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
  });
}

function createRewardAccessories(
  textures: ProceduralTextureSet,
  collarY: number,
  collarZ: number,
  headTopY: number,
  headZ: number,
  bodyTopY: number,
  bodyScale: number,
): Record<SocialReward['id'], THREE.Object3D> {
  // 1. Plaid Explorer Bandana
  const bandanaGroup = new THREE.Group();
  const bandanaGeo = new THREE.ConeGeometry(0.2 * bodyScale, 0.28 * bodyScale, 4);
  const bandanaMat = new THREE.MeshStandardMaterial({
    map: textures.plaidAlbedo,
    roughness: 0.85,
    metalness: 0.02,
  });
  const bandanaMesh = new THREE.Mesh(bandanaGeo, bandanaMat);
  bandanaMesh.rotation.x = Math.PI * 0.95;
  bandanaMesh.scale.set(1.1, 1.0, 0.45);
  bandanaMesh.position.set(0, collarY - 0.1 * bodyScale, collarZ + 0.11 * bodyScale);
  bandanaMesh.castShadow = true;
  bandanaGroup.add(bandanaMesh);
  bandanaGroup.visible = false;

  // 2. Golden Good-Boy Star Crown
  const crownGroup = new THREE.Group();
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4c430,
    metalness: 0.88,
    roughness: 0.2,
    clearcoat: 0.6,
  });
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.11 * bodyScale, 0.02 * bodyScale, 10, 20),
    goldMat,
  );
  band.rotation.x = Math.PI / 2;
  crownGroup.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.028 * bodyScale, 0.09 * bodyScale, 4),
      goldMat,
    );
    spike.position.set(Math.cos(a) * 0.1 * bodyScale, 0.05 * bodyScale, Math.sin(a) * 0.1 * bodyScale);
    crownGroup.add(spike);
  }
  crownGroup.position.set(0, headTopY + 0.04 * bodyScale, headZ);
  crownGroup.visible = false;

  // 3. Royal Velvet Collar + Brass Bell
  const royalCollar = new THREE.Group();
  const velvetMat = new THREE.MeshStandardMaterial({
    color: 0x7b1e3a,
    roughness: 0.68,
    metalness: 0.1,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.17 * bodyScale, 0.036 * bodyScale, 10, 22),
    velvetMat,
  );
  ring.rotation.x = Math.PI * 0.38;
  royalCollar.add(ring);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.045 * bodyScale, 12, 10), goldMat);
  bell.position.set(0, -0.15 * bodyScale, 0.14 * bodyScale);
  royalCollar.add(bell);
  royalCollar.position.set(0, collarY, collarZ);
  royalCollar.visible = false;

  // 4. Mayor of the Park Cape
  const capeGroup = new THREE.Group();
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-0.18 * bodyScale, 0);
  capeShape.lineTo(0.18 * bodyScale, 0);
  capeShape.lineTo(0.32 * bodyScale, -0.58 * bodyScale);
  capeShape.quadraticCurveTo(0, -0.66 * bodyScale, -0.32 * bodyScale, -0.58 * bodyScale);
  capeShape.closePath();

  const capeGeo = new THREE.ExtrudeGeometry(capeShape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0x1e4d3b,
    roughness: 0.72,
    metalness: 0.06,
  });
  const capeMesh = new THREE.Mesh(capeGeo, capeMat);
  capeMesh.rotation.x = Math.PI * 0.44;
  capeMesh.position.set(0, bodyTopY + 0.03 * bodyScale, collarZ - 0.04 * bodyScale);
  capeMesh.castShadow = true;
  capeGroup.add(capeMesh);
  // Gold clasp
  const clasp = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * bodyScale, 0.04 * bodyScale, 0.02, 12), goldMat);
  clasp.position.set(0, bodyTopY + 0.04 * bodyScale, collarZ - 0.02 * bodyScale);
  capeGroup.add(clasp);
  capeGroup.visible = false;

  return {
    bandana: bandanaGroup,
    crown: crownGroup,
    royal_collar: royalCollar,
    legend_cape: capeGroup,
  };
}

export function buildProceduralDogRig(
  breedType: 'golden' | 'corgi' | 'husky' | 'dachshund',
  textures: ProceduralTextureSet,
): ActiveDogRig {
  const p = BREED_PALETTES[breedType];
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  const baseBodyY = p.legLen + p.bodyHeight * 0.44;
  bodyPivot.position.y = baseBodyY;
  root.add(bodyPivot);

  const primaryMat = createFurMaterial(p.primary, 0.88);
  const secondaryMat = createFurMaterial(p.secondary, 0.9);
  const accentMat = createFurMaterial(p.accent, 0.86);
  const noseMat = new THREE.MeshStandardMaterial({
    color: p.nose,
    roughness: 0.22,
    metalness: 0.08,
  });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: breedType === 'husky' ? 0x62b7e6 : 0x221712,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0c });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xd96b78, roughness: 0.32 });
  const collarMat = new THREE.MeshStandardMaterial({ color: p.collar, roughness: 0.62, metalness: 0.1 });
  const tagMat = new THREE.MeshStandardMaterial({ color: 0xe6b945, roughness: 0.25, metalness: 0.85 });

  // 1. Torso (sculpted ribcage + hindquarters + soft belly)
  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(p.bodyWidth * 0.54, 18, 14),
    primaryMat,
  );
  chest.scale.set(0.95, p.bodyHeight / p.bodyWidth, 1.25);
  chest.position.set(0, 0.02, p.bodyLen * 0.22);
  chest.castShadow = true;
  chest.receiveShadow = true;
  bodyPivot.add(chest);

  const midTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(p.bodyWidth * 0.46, p.bodyLen * 0.56, 8, 16),
    primaryMat,
  );
  midTorso.rotation.x = Math.PI / 2;
  midTorso.scale.set(1.0, 1.0, p.bodyHeight / p.bodyWidth);
  midTorso.castShadow = true;
  midTorso.receiveShadow = true;
  bodyPivot.add(midTorso);

  const belly = new THREE.Mesh(
    new THREE.CapsuleGeometry(p.bodyWidth * 0.36, p.bodyLen * 0.44, 6, 12),
    secondaryMat,
  );
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, -p.bodyHeight * 0.18, 0.02);
  bodyPivot.add(belly);

  const chestFluff = new THREE.Mesh(
    new THREE.SphereGeometry(p.bodyWidth * 0.4, 12, 10),
    secondaryMat,
  );
  chestFluff.scale.set(0.95, 1.15, 0.85);
  chestFluff.position.set(0, -0.02, p.bodyLen * 0.42);
  bodyPivot.add(chestFluff);

  // 2. Neck + Collar + Brass Name Tag
  const neckZ = p.bodyLen * 0.42;
  const neckY = p.bodyHeight * 0.36;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(p.bodyWidth * 0.29, p.bodyWidth * 0.37, 0.26, 14),
    primaryMat,
  );
  neck.position.set(0, neckY, neckZ);
  neck.rotation.x = Math.PI * 0.2;
  neck.castShadow = true;
  bodyPivot.add(neck);

  const collarRing = new THREE.Mesh(
    new THREE.TorusGeometry(p.bodyWidth * 0.36, 0.028, 10, 20),
    collarMat,
  );
  collarRing.position.set(0, neckY - 0.01, neckZ + 0.02);
  collarRing.rotation.x = Math.PI * 0.36;
  bodyPivot.add(collarRing);

  const nameTag = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12), tagMat);
  nameTag.rotation.x = Math.PI / 2;
  nameTag.position.set(0, neckY - 0.12, neckZ + p.bodyWidth * 0.36);
  bodyPivot.add(nameTag);

  // 3. Articulated Head, Snout, Nose, Eyes, Jaw/Tongue, Ears
  const headPivot = new THREE.Group();
  headPivot.position.set(0, neckY + 0.16, neckZ + 0.08);
  headPivot.scale.setScalar(p.headScale);
  bodyPivot.add(headPivot);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 14), primaryMat);
  cranium.scale.set(0.96, 0.92, 1.08);
  cranium.castShadow = true;
  headPivot.add(cranium);

  // Face mask / muzzle cheek highlights
  const cheekMask = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), secondaryMat);
  cheekMask.scale.set(1.06, 0.72, 0.85);
  cheekMask.position.set(0, -0.04, 0.08);
  headPivot.add(cheekMask);

  const snout = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.068, p.snoutLen * 0.55, 6, 12),
    breedType === 'husky' ? secondaryMat : primaryMat,
  );
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(1.05, 1.0, 0.84);
  snout.position.set(0, -0.028, 0.14 + p.snoutLen * 0.26);
  snout.castShadow = true;
  headPivot.add(snout);

  const wetNose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), noseMat);
  wetNose.scale.set(1.15, 0.82, 0.85);
  wetNose.position.set(0, -0.005, 0.18 + p.snoutLen * 0.54);
  headPivot.add(wetNose);

  // Lower jaw + happy panting tongue
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.068, 0.11);
  headPivot.add(jawPivot);
  const lowerJaw = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.048, p.snoutLen * 0.42, 5, 10),
    secondaryMat,
  );
  lowerJaw.rotation.x = Math.PI / 2;
  lowerJaw.scale.set(0.95, 1, 0.65);
  lowerJaw.position.set(0, 0, p.snoutLen * 0.22);
  jawPivot.add(lowerJaw);

  const tongue = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.075, 4, 8), tongueMat);
  tongue.rotation.x = Math.PI * 0.65;
  tongue.scale.set(1.0, 1.0, 0.35);
  tongue.position.set(0, -0.015, p.snoutLen * 0.38);
  jawPivot.add(tongue);

  // Glossy eyes + tiny brow tufts
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), eyeMat);
    eye.position.set(side * 0.088, 0.042, 0.128);
    headPivot.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), pupilMat);
    pupil.position.set(side * 0.092, 0.044, 0.152);
    headPivot.add(pupil);
  });

  // Ears
  const leftEar = new THREE.Group();
  const rightEar = new THREE.Group();
  headPivot.add(leftEar, rightEar);
  [
    { grp: leftEar, side: -1 },
    { grp: rightEar, side: 1 },
  ].forEach(({ grp, side }) => {
    if (p.earStyle === 'upright') {
      grp.position.set(side * 0.105, 0.11, -0.01);
      const outer = new THREE.Mesh(
        new THREE.ConeGeometry(breedType === 'corgi' ? 0.078 : 0.062, breedType === 'corgi' ? 0.19 : 0.15, 6),
        primaryMat,
      );
      outer.position.set(side * 0.01, 0.075, 0);
      outer.rotation.z = -side * 0.22;
      outer.scale.set(0.9, 1, 0.45);
      outer.castShadow = true;
      grp.add(outer);

      const inner = new THREE.Mesh(
        new THREE.ConeGeometry(0.038, 0.1, 5),
        secondaryMat,
      );
      inner.position.set(side * 0.01, 0.065, 0.016);
      inner.rotation.z = -side * 0.22;
      inner.scale.set(0.85, 1, 0.3);
      grp.add(inner);
    } else {
      const earLen = p.earStyle === 'long_floppy' ? 0.24 : 0.18;
      grp.position.set(side * 0.138, 0.085, -0.02);
      const earMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.052, earLen * 0.55, 6, 10),
        accentMat,
      );
      earMesh.scale.set(0.45, 1.0, 0.85);
      earMesh.position.set(side * 0.02, -earLen * 0.42, 0.01);
      earMesh.rotation.z = side * 0.14;
      earMesh.castShadow = true;
      grp.add(earMesh);
    }
  });

  // 4. Four Articulated Legs with Paws
  const makeLeg = (x: number, z: number, isFront: boolean) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(x, -p.bodyHeight * 0.24, z);

    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(p.legRadius * 1.12, p.legLen * 0.42, 6, 10),
      primaryMat,
    );
    upper.position.y = -p.legLen * 0.25;
    upper.castShadow = true;
    legGroup.add(upper);

    const lower = new THREE.Mesh(
      new THREE.CapsuleGeometry(p.legRadius * 0.86, p.legLen * 0.44, 6, 10),
      breedType === 'corgi' || breedType === 'husky' ? secondaryMat : primaryMat,
    );
    lower.position.set(0, -p.legLen * 0.68, isFront ? 0.01 : -0.015);
    lower.castShadow = true;
    legGroup.add(lower);

    const paw = new THREE.Mesh(
      new THREE.SphereGeometry(p.legRadius * 1.18, 10, 8),
      breedType === 'corgi' || breedType === 'husky' ? secondaryMat : accentMat,
    );
    paw.scale.set(1.0, 0.55, 1.35);
    paw.position.set(0, -p.legLen * 0.94, 0.032);
    paw.castShadow = true;
    legGroup.add(paw);

    bodyPivot.add(legGroup);
    return legGroup;
  };

  const legX = p.bodyWidth * 0.36;
  const frontZ = p.bodyLen * 0.32;
  const backZ = -p.bodyLen * 0.32;
  const legs = {
    fl: makeLeg(-legX, frontZ, true),
    fr: makeLeg(legX, frontZ, true),
    bl: makeLeg(-legX, backZ, false),
    br: makeLeg(legX, backZ, false),
  };

  // 5. Wagging Multi-Segment Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, p.bodyHeight * 0.26, -p.bodyLen * 0.46);
  bodyPivot.add(tailPivot);

  if (p.tailStyle === 'stub') {
    const stub = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), secondaryMat);
    stub.scale.set(1.0, 0.9, 1.35);
    stub.position.set(0, 0.03, -0.05);
    tailPivot.add(stub);
  } else if (p.tailStyle === 'curled') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.16, -0.14),
      new THREE.Vector3(0, 0.32, -0.08),
      new THREE.Vector3(0, 0.34, 0.07),
    ]);
    const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.052, 8, false), primaryMat);
    tailMesh.castShadow = true;
    tailPivot.add(tailMesh);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), secondaryMat);
    tip.position.set(0, 0.34, 0.07);
    tailPivot.add(tip);
  } else {
    const tailLen = p.tailStyle === 'plumed' ? 0.42 : 0.36;
    const tailRad = p.tailStyle === 'plumed' ? 0.052 : 0.034;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.09, -tailLen * 0.45),
      new THREE.Vector3(0, 0.22, -tailLen * 0.92),
    ]);
    const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, tailRad, 8, false), primaryMat);
    tailMesh.castShadow = true;
    tailPivot.add(tailMesh);
    if (p.tailStyle === 'plumed') {
      const plume = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), secondaryMat);
      plume.scale.set(0.7, 0.9, 1.9);
      plume.position.set(0, 0.16, -tailLen * 0.72);
      tailPivot.add(plume);
    }
  }

  // 6. Wearable Social Rewards
  const rewardMeshes = createRewardAccessories(
    textures,
    neckY - 0.02,
    neckZ + 0.02,
    neckY + 0.32 * p.headScale,
    neckZ + 0.08,
    p.bodyHeight * 0.48,
    Math.max(0.78, p.headScale),
  );
  Object.values(rewardMeshes).forEach((m) => bodyPivot.add(m));

  // Soft contact shadow directly under paws
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(p.bodyLen * 1.35, p.bodyLen * 1.15),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  return {
    root,
    bodyPivot,
    source: 'procedural',
    legs,
    headPivot,
    jawPivot,
    tailPivot,
    ears: { left: leftEar, right: rightEar },
    baseBodyY,
    rewardMeshes,
    dispose: () => {
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material?.dispose();
        }
      });
    },
  };
}

export function autoGuessGlbClips(clipNames: string[]): GlbAnimationMapping {
  const findMatch = (keywords: string[], fallback: string) => {
    for (const kw of keywords) {
      const found = clipNames.find((n) => n.toLowerCase().includes(kw));
      if (found) return found;
    }
    return fallback;
  };
  const first = clipNames[0] || '';
  const walk = findMatch(['walk', 'trot', 'move', 'stride'], first);
  const run = findMatch(['run', 'gallop', 'sprint', 'fast'], walk);
  const idle = findMatch(['idle', 'breathe', 'stand', 'wait'], first);
  const jump = findMatch(['jump', 'hop', 'leap', 'air'], run);
  const action = findMatch(['bark', 'eat', 'sniff', 'dig', 'attack', 'sit'], idle);
  const bellyRub = findMatch(['roll', 'lie', 'sleep', 'pet', 'happy', 'sit', 'death'], idle);

  return { idle, walk, run, jump, action, bellyRub };
}

export async function inspectGlbFile(url: string): Promise<{ clipNames: string[]; meshCount: number }> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  let meshCount = 0;
  gltf.scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshCount++;
  });
  const clipNames = gltf.animations.map((c) => c.name);
  return { clipNames, meshCount };
}

export async function buildGlbDogRig(
  breed: DogBreedConfig,
  textures: ProceduralTextureSet,
): Promise<ActiveDogRig> {
  if (!breed.glbUrl) {
    throw new Error('Missing GLB URL for custom breed');
  }
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(breed.glbUrl);

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const glbWrapper = new THREE.Group();
  const model = gltf.scene;

  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // prevent skinned meshes clipping on edge frames
    }
  });

  // Compute bounding box to normalize height and center feet on y=0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const rawHeight = Math.max(size.y, 0.01);
  const scaleMult = breed.scaleMultiplier ?? 1.0;
  const targetH = breed.physics.targetHeight * scaleMult;
  const normScale = targetH / rawHeight;

  model.scale.setScalar(normScale);
  model.position.set(
    -center.x * normScale,
    -box.min.y * normScale,
    -center.z * normScale,
  );

  glbWrapper.add(model);
  glbWrapper.rotation.y = THREE.MathUtils.degToRad(breed.forwardRotationDeg ?? 0);
  bodyPivot.add(glbWrapper);

  // Setup AnimationMixer & actions
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  gltf.animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    actions.set(clip.name, action);
  });

  const clipMapping =
    breed.clipMapping ?? autoGuessGlbClips(gltf.animations.map((c) => c.name));

  // Start idle clip immediately if present
  let currentClipName = '';
  const initialClip = clipMapping.idle || gltf.animations[0]?.name;
  if (initialClip && actions.has(initialClip)) {
    actions.get(initialClip)!.reset().play();
    currentClipName = initialClip;
  }

  // Attach wearable rewards proportioned to normalized height
  const rewardScale = targetH / 0.78;
  const rewardMeshes = createRewardAccessories(
    textures,
    targetH * 0.62,
    targetH * 0.34,
    targetH * 1.02,
    targetH * 0.42,
    targetH * 0.76,
    rewardScale,
  );
  Object.values(rewardMeshes).forEach((m) => bodyPivot.add(m));

  // Contact shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(targetH * 1.6, targetH * 1.35),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  return {
    root,
    bodyPivot,
    source: 'glb',
    mixer,
    actions,
    currentClipName,
    clipMapping,
    glbWrapper,
    baseBodyY: 0,
    rewardMeshes,
    dispose: () => {
      mixer.stopAllAction();
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material?.dispose();
        }
      });
    },
  };
}

export function updateDogRigAnimation(
  rig: ActiveDogRig,
  action: DogActionState,
  speedMs: number,
  maxSprintSpeed: number,
  turnBank: number,
  strideFreq: number,
  actionTimer: number,
  elapsed: number,
  dt: number,
) {
  const speedNorm = THREE.MathUtils.clamp(speedMs / Math.max(1, maxSprintSpeed), 0, 1.15);

  if (rig.source === 'glb' && rig.mixer && rig.actions && rig.clipMapping) {
    let targetClip = rig.clipMapping.idle;
    let timeScale = 1.0;

    if (action === 'jump') {
      targetClip = rig.clipMapping.jump || rig.clipMapping.run;
    } else if (action === 'bellyRub' || action === 'rest') {
      targetClip = rig.clipMapping.bellyRub || rig.clipMapping.idle;
    } else if (action === 'bark') {
      targetClip = rig.clipMapping.bark || rig.clipMapping.action || rig.clipMapping.idle;
    } else if (action === 'sniff') {
      targetClip = rig.clipMapping.sniff || rig.clipMapping.action || rig.clipMapping.idle;
    } else if (action === 'pee') {
      targetClip = rig.clipMapping.pee || rig.clipMapping.action || rig.clipMapping.idle;
    } else if (action === 'poop') {
      targetClip = rig.clipMapping.poop || rig.clipMapping.action || rig.clipMapping.idle;
    } else if (action === 'eat') {
      targetClip = rig.clipMapping.eat || rig.clipMapping.sniff || rig.clipMapping.action || rig.clipMapping.idle;
    } else if (speedMs > maxSprintSpeed * 0.55) {
      targetClip = rig.clipMapping.run || rig.clipMapping.walk;
      timeScale = THREE.MathUtils.clamp(0.85 + speedNorm * 0.55, 0.8, 1.55);
    } else if (speedMs > 0.25) {
      targetClip = rig.clipMapping.walk || rig.clipMapping.run;
      timeScale = THREE.MathUtils.clamp(0.65 + speedNorm * 1.1, 0.65, 1.45);
    }

    if (targetClip && targetClip !== rig.currentClipName && rig.actions.has(targetClip)) {
      const nextAct = rig.actions.get(targetClip)!;
      const prevAct = rig.currentClipName ? rig.actions.get(rig.currentClipName) : undefined;
      nextAct.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.18).play();
      if (prevAct && prevAct !== nextAct) {
        prevAct.fadeOut(0.18);
      }
      rig.currentClipName = targetClip;
    } else if (rig.currentClipName && rig.actions.has(rig.currentClipName)) {
      rig.actions.get(rig.currentClipName)!.setEffectiveTimeScale(timeScale);
    }

    rig.mixer.update(dt);

    // Subtle physical lean & dog posture accents on bodyPivot for GLBs too
    let targetRoll = turnBank;
    let targetPitch = 0;
    let targetY = rig.baseBodyY;

    if (action === 'pee' && !rig.clipMapping.pee) {
      targetRoll = 0.22;
      targetPitch = -0.04;
    } else if (action === 'poop' && !rig.clipMapping.poop) {
      targetPitch = -0.22;
      targetY = -0.05;
    } else if (action === 'bellyRub') {
      // Embedded bellyRub / lay clip handles the roll around hip height on the grass
      targetRoll = Math.sin(elapsed * 8) * 0.08;
      targetY = 0;
    } else if (action === 'rest') {
      targetY = -0.04;
    } else if (action === 'sniff' && !rig.clipMapping.sniff) {
      targetPitch = 0.16;
    } else if (action === 'bark' && !rig.clipMapping.bark) {
      targetPitch = -0.12 * Math.abs(Math.sin(actionTimer * 14));
    }

    rig.bodyPivot.rotation.z = THREE.MathUtils.damp(rig.bodyPivot.rotation.z, targetRoll, 10, dt);
    rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, targetPitch, 10, dt);
    rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, targetY, 10, dt);
    return;
  }

  // Procedural multi-part breed animation
  if (!rig.legs || !rig.headPivot || !rig.tailPivot || !rig.jawPivot || !rig.ears) return;

  const phase = elapsed * strideFreq * (0.45 + speedNorm * 0.72);
  let flX = 0,
    frX = 0,
    blX = 0,
    brX = 0;
  let brZ = 0;
  let bodyYOffset = 0;
  let bodyPitch = 0;
  let bodyRoll = turnBank;
  let headPitch = 0;
  let headYaw = 0;
  let jawOpen = 0.08 + Math.sin(elapsed * 5.5) * 0.05;
  let tailSpeed = 6.5;
  let tailAmp = 0.35;

  if (action === 'jump') {
    flX = -0.65;
    frX = -0.58;
    blX = 0.68;
    brX = 0.62;
    bodyPitch = -0.14;
    headPitch = 0.1;
    tailAmp = 0.25;
  } else if (action === 'pee') {
    bodyRoll = -0.22;
    brZ = -1.12; // Classic lifted back leg!
    brX = -0.25;
    headYaw = 0.3;
    tailSpeed = 4;
    tailAmp = 0.15;
  } else if (action === 'poop') {
    bodyPitch = -0.44;
    bodyYOffset = -0.14;
    blX = -0.62;
    brX = -0.62;
    flX = 0.15;
    frX = 0.15;
    headPitch = 0.25;
    tailAmp = 0.08;
  } else if (action === 'bellyRub') {
    bodyRoll = Math.PI * 0.94 + Math.sin(elapsed * 7.5) * 0.12;
    bodyYOffset = -0.12;
    flX = -0.75 + Math.sin(elapsed * 14) * 0.28;
    frX = -0.75 - Math.sin(elapsed * 14) * 0.28;
    blX = 0.55 + Math.sin(elapsed * 18) * 0.38;
    brX = 0.55 - Math.sin(elapsed * 18) * 0.38;
    jawOpen = 0.35;
    tailSpeed = 16;
    tailAmp = 0.62;
  } else if (action === 'rest') {
    bodyYOffset = -rig.baseBodyY * 0.52;
    flX = -1.15;
    frX = -1.15;
    blX = 1.05;
    brX = 1.05;
    headPitch = 0.24 + Math.sin(elapsed * 2.0) * 0.04;
    jawOpen = 0.02;
    tailSpeed = 2.0;
    tailAmp = 0.08;
  } else if (action === 'sniff') {
    headPitch = 0.62 + Math.sin(elapsed * 11) * 0.08;
    headYaw = Math.sin(elapsed * 5.2) * 0.34;
    bodyPitch = 0.14;
    tailSpeed = 10;
    tailAmp = 0.48;
  } else if (action === 'eat') {
    headPitch = 0.72 + Math.sin(elapsed * 14) * 0.14;
    jawOpen = 0.12 + Math.abs(Math.sin(elapsed * 16)) * 0.25;
    bodyPitch = 0.18;
    tailSpeed = 15;
    tailAmp = 0.55;
  } else if (action === 'bark') {
    const pulse = Math.abs(Math.sin(actionTimer * 13));
    headPitch = -0.28 * pulse;
    jawOpen = 0.42 * pulse;
    bodyPitch = -0.08 * pulse;
    bodyYOffset = 0.04 * pulse;
    tailSpeed = 14;
    tailAmp = 0.52;
  } else if (speedMs > 0.22) {
    // Smooth trot -> bounding gallop transition
    const isGallop = speedNorm > 0.58;
    if (isGallop) {
      const amp = 0.76 * Math.min(1, speedNorm);
      flX = Math.sin(phase) * amp;
      frX = Math.sin(phase + 0.45) * amp;
      blX = Math.sin(phase + Math.PI) * amp;
      brX = Math.sin(phase + Math.PI + 0.45) * amp;
      bodyYOffset = Math.abs(Math.cos(phase)) * 0.085 * speedNorm;
      bodyPitch = Math.cos(phase) * 0.13 * speedNorm;
      jawOpen = 0.26 + Math.sin(elapsed * 11) * 0.06;
    } else {
      const amp = 0.56 * Math.min(1, speedNorm * 1.75);
      flX = Math.sin(phase) * amp;
      brX = Math.sin(phase) * amp;
      frX = Math.sin(phase + Math.PI) * amp;
      blX = Math.sin(phase + Math.PI) * amp;
      bodyYOffset = Math.abs(Math.sin(phase * 2)) * 0.032 * speedNorm;
    }
    tailSpeed = 9 + speedNorm * 6;
    tailAmp = 0.45;
  } else {
    // Alive breathing idle + gentle look around
    bodyYOffset = Math.sin(elapsed * 2.4) * 0.012;
    headYaw = Math.sin(elapsed * 0.75) * 0.18;
    headPitch = Math.sin(elapsed * 1.1) * 0.05;
  }

  const damp = 14;
  rig.legs.fl.rotation.x = THREE.MathUtils.damp(rig.legs.fl.rotation.x, flX, damp, dt);
  rig.legs.fr.rotation.x = THREE.MathUtils.damp(rig.legs.fr.rotation.x, frX, damp, dt);
  rig.legs.bl.rotation.x = THREE.MathUtils.damp(rig.legs.bl.rotation.x, blX, damp, dt);
  rig.legs.br.rotation.x = THREE.MathUtils.damp(rig.legs.br.rotation.x, brX, damp, dt);
  rig.legs.br.rotation.z = THREE.MathUtils.damp(rig.legs.br.rotation.z, brZ, damp, dt);

  rig.bodyPivot.position.y = THREE.MathUtils.damp(
    rig.bodyPivot.position.y,
    rig.baseBodyY + bodyYOffset,
    12,
    dt,
  );
  rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, bodyPitch, 11, dt);
  rig.bodyPivot.rotation.z = THREE.MathUtils.damp(rig.bodyPivot.rotation.z, bodyRoll, 10, dt);

  rig.headPivot.rotation.x = THREE.MathUtils.damp(rig.headPivot.rotation.x, headPitch, 11, dt);
  rig.headPivot.rotation.y = THREE.MathUtils.damp(rig.headPivot.rotation.y, headYaw, 9, dt);
  rig.jawPivot.rotation.x = THREE.MathUtils.damp(rig.jawPivot.rotation.x, jawOpen, 16, dt);

  // Expressive tail wag & floppy ear bounce
  rig.tailPivot.rotation.y = Math.sin(elapsed * tailSpeed) * tailAmp;
  const earBounce = Math.abs(bodyYOffset) * 3.2;
  rig.ears.left.rotation.z = THREE.MathUtils.damp(rig.ears.left.rotation.z, -earBounce, 12, dt);
  rig.ears.right.rotation.z = THREE.MathUtils.damp(rig.ears.right.rotation.z, earBounce, 12, dt);
}
