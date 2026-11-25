import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CollisionWorld,
  groundHeightAt,
  isInPond,
  isOnRoadOrPlaza,
  isTownArea,
  POND_CENTER_X,
  POND_CENTER_Z,
  POND_RX,
  POND_RZ,
  WORLD_PLAYABLE_RADIUS,
  WORLD_SIZE,
} from './terrain';
import type { ProceduralTextureSet } from './textures';
import type { StoreInteriorId } from './types';

export interface StoreDoorway {
  id: StoreInteriorId;
  name: string;
  subtitle: string;
  position: THREE.Vector3;
  exitYaw: number;
}

export interface HiddenTreatEntity {
  id: string;
  name: string;
  kind: 'bone' | 'bacon' | 'biscuit' | 'croissant';
  position: THREE.Vector3;
  group: THREE.Group;
  scentBeam: THREE.Mesh;
  found: boolean;
  hungerRestore: number;
  energyRestore: number;
}

export interface HydrantSpot {
  id: string;
  position: THREE.Vector3;
  marked: boolean;
  ringMesh: THREE.Mesh;
}

export interface BuiltWorld {
  root: THREE.Group;
  treats: HiddenTreatEntity[];
  hydrants: HydrantSpot[];
  doorways: StoreDoorway[];
  pondMaterial: THREE.MeshPhysicalMaterial;
  fountainDrops: THREE.Points;
  lampGlowMaterials: THREE.MeshStandardMaterial[];
  wettableMaterials: THREE.MeshStandardMaterial[];
  update: (elapsed: number, dt: number, sniffActive: boolean, scentRadius: number, dogPos: THREE.Vector3) => void;
  dispose: () => void;
}

function makeSignTexture(title: string, bgHex: string, textHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = textHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 108);
  ctx.fillStyle = textHex;
  ctx.font = 'bold 42px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface PlacementTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export function buildBarkshireWorld(
  textures: ProceduralTextureSet,
  collision: CollisionWorld,
  isSoftwareGl: boolean,
): BuiltWorld {
  const root = new THREE.Group();
  const treats: HiddenTreatEntity[] = [];
  const hydrants: HydrantSpot[] = [];
  const doorways: StoreDoorway[] = [];
  const lampGlowMaterials: THREE.MeshStandardMaterial[] = [];
  const wettableMaterials: THREE.MeshStandardMaterial[] = [];
  const extraTextures: THREE.Texture[] = [];
  let disposed = false;

  const gltfLoader = new GLTFLoader();
  const glbCache = new Map<string, Promise<THREE.Group>>();
  let activeGlbLoads = 0;
  const MAX_CONCURRENT_GLB_LOADS = 4;
  const glbLoadQueue: Array<() => void> = [];

  const runQueuedGlbLoad = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        if (disposed) {
          reject(new Error('World disposed'));
          return;
        }
        activeGlbLoads++;
        task()
          .then(resolve, reject)
          .finally(() => {
            activeGlbLoads--;
            const next = glbLoadQueue.shift();
            if (next) next();
          });
      };
      if (activeGlbLoads < MAX_CONCURRENT_GLB_LOADS) {
        start();
      } else {
        glbLoadQueue.push(start);
      }
    });

  const loadReadyGlb = (url: string): Promise<THREE.Group> => {
    let p = glbCache.get(url);
    if (!p) {
      p = runQueuedGlbLoad(() => gltfLoader.loadAsync(url).then((gltf) => gltf.scene));
      glbCache.set(url, p);
    }
    return p;
  };

  /**
   * Instantiates a multi-material GLB across arbitrary world placements using GPU InstancedMesh
   * (1 draw call per material primitive in the GLB, keeping frame rates locked at 60fps!).
   */
  const spawnInstancedGlb = (
    url: string,
    placements: PlacementTransform[],
    opts: { castShadow?: boolean; receiveShadow?: boolean; foliageAlpha?: boolean } = {},
  ) => {
    if (placements.length === 0) return;
    loadReadyGlb(url)
      .then((sceneRoot) => {
        if (disposed) return;
        sceneRoot.updateMatrixWorld(true);
        const dummy = new THREE.Object3D();

        sceneRoot.traverse((node) => {
          if (!(node as THREE.Mesh).isMesh) return;
          const srcMesh = node as THREE.Mesh;
          const geo = srcMesh.geometry.clone();
          geo.applyMatrix4(srcMesh.matrixWorld);

          const prepMat = (m: THREE.Material): THREE.Material => {
            const cloned = m.clone();
            if (opts.foliageAlpha && (cloned as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const sm = cloned as THREE.MeshStandardMaterial;
              if (sm.transparent || sm.alphaMap || sm.map) {
                sm.alphaTest = Math.max(sm.alphaTest, 0.38);
                sm.side = THREE.DoubleSide;
              }
            }
            return cloned;
          };

          const mat = Array.isArray(srcMesh.material)
            ? srcMesh.material.map(prepMat)
            : prepMat(srcMesh.material);

          const inst = new THREE.InstancedMesh(geo, mat, placements.length);
          inst.castShadow = (opts.castShadow ?? true) && !isSoftwareGl;
          inst.receiveShadow = opts.receiveShadow ?? true;

          for (let i = 0; i < placements.length; i++) {
            const pl = placements[i];
            dummy.position.set(pl.x, pl.y, pl.z);
            dummy.rotation.set(0, pl.rotY, 0);
            dummy.scale.set(pl.scaleX, pl.scaleY, pl.scaleZ);
            dummy.updateMatrix();
            inst.setMatrixAt(i, dummy.matrix);
          }
          inst.instanceMatrix.needsUpdate = true;
          inst.computeBoundingSphere();
          root.add(inst);
        });
      })
      .catch((err) => console.warn(`Failed to instance world GLB ${url}:`, err));
  };

  // ---------------------------------------------------------------------------
  // 1. Sculpted Rolling Terrain with Photorealistic Grass005 PBR Set
  // ---------------------------------------------------------------------------
  const segs = 128;
  const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    if (isInPond(x, z, 2.2)) {
      tmpColor.setHex(0x8c7f67); // sandy pond bed
    } else if (isTownArea(x, z)) {
      tmpColor.setHex(0x9eab84); // natural manicured town turf
    } else if (Math.hypot(x, z) > WORLD_PLAYABLE_RADIUS) {
      tmpColor.setHex(0x879971); // deep outer meadow hills
    } else {
      const patch = Math.sin(x * 0.08) * Math.cos(z * 0.08);
      tmpColor.setHex(patch > 0.25 ? 0xabb88e : patch < -0.25 ? 0x8e9e76 : 0x9cab82);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.setAttribute('uv1', terrainGeo.attributes.uv);
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.grassAlbedo,
    normalMap: textures.grassNormal,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughnessMap: textures.grassRoughness,
    aoMap: textures.grassAo,
    aoMapIntensity: 0.85,
    envMapIntensity: 0.25,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
  });
  wettableMaterials.push(terrainMat);

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  root.add(terrainMesh);

  // ---------------------------------------------------------------------------
  // 2. Town Roads, Cobblestone Sidewalks, Stone Plazas & PBR Dirt Trails
  // ---------------------------------------------------------------------------
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltAlbedo,
    color: 0x8d9299,
    roughness: 0.9,
    metalness: 0.03,
    envMapIntensity: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wettableMaterials.push(asphaltMat);

  const cobbleMat = new THREE.MeshStandardMaterial({
    map: textures.cobbleAlbedo,
    color: 0xcbc3b6,
    normalMap: textures.cobbleNormal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: textures.cobbleRoughness,
    aoMap: textures.cobbleAo,
    aoMapIntensity: 0.9,
    envMapIntensity: 0.3,
    roughness: 0.92,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wettableMaterials.push(cobbleMat);

  const plazaMat = new THREE.MeshStandardMaterial({
    map: textures.plazaAlbedo,
    color: 0xc9c1b4,
    normalMap: textures.plazaNormal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: textures.plazaRoughness,
    aoMap: textures.plazaAo,
    aoMapIntensity: 0.9,
    envMapIntensity: 0.3,
    roughness: 0.92,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wettableMaterials.push(plazaMat);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xb7b1a5, roughness: 0.85 });
  const brickMat = new THREE.MeshStandardMaterial({
    map: textures.brickAlbedo,
    bumpMap: textures.brickBump,
    bumpScale: 0.09,
    roughness: 0.86,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.roofAlbedo,
    roughness: 0.74,
    metalness: 0.08,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    roughness: 0.78,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x26292e,
    roughness: 0.38,
    metalness: 0.84,
  });

  // Main Street north-south
  const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.08, 114), asphaltMat);
  mainRoad.position.set(-22, 0.03, -4);
  mainRoad.receiveShadow = true;
  root.add(mainRoad);

  // Sidewalks flanking Main Street
  [-28.8, -15.2].forEach((sx) => {
    const swGeo = new THREE.BoxGeometry(4.0, 0.16, 112);
    swGeo.setAttribute('uv1', swGeo.attributes.uv);
    const sw = new THREE.Mesh(swGeo, cobbleMat);
    sw.position.set(sx, 0.07, -4);
    sw.receiveShadow = true;
    root.add(sw);
  });

  // Cross Street east-west connecting Town Square to Central Park entrance
  const crossRoad = new THREE.Mesh(new THREE.BoxGeometry(74, 0.09, 8.2), asphaltMat);
  crossRoad.position.set(-30, 0.035, -8);
  crossRoad.receiveShadow = true;
  root.add(crossRoad);

  // Town Square Circular Plaza Stone
  const townPlazaGeo = new THREE.CylinderGeometry(13.8, 14.2, 0.18, 48);
  townPlazaGeo.setAttribute('uv1', townPlazaGeo.attributes.uv);
  const townPlaza = new THREE.Mesh(townPlazaGeo, plazaMat);
  townPlaza.position.set(-22, 0.08, -8);
  townPlaza.receiveShadow = true;
  root.add(townPlaza);

  // Park Central Fountain Plaza Stone
  const parkPlazaGeo = new THREE.CylinderGeometry(10.2, 10.6, 0.18, 40);
  parkPlazaGeo.setAttribute('uv1', parkPlazaGeo.attributes.uv);
  const parkPlaza = new THREE.Mesh(parkPlazaGeo, plazaMat);
  parkPlaza.position.set(18, groundHeightAt(18, -14) + 0.05, -14);
  parkPlaza.receiveShadow = true;
  root.add(parkPlaza);

  // Winding photorealistic dirt/stone park pathways
  const gravelMat = new THREE.MeshStandardMaterial({
    map: textures.dirtPathAlbedo,
    normalMap: textures.dirtPathNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: textures.dirtPathRoughness,
    aoMap: textures.dirtPathAo,
    aoMapIntensity: 0.8,
    alphaMap: textures.dirtPathAlpha,
    alphaTest: 0.35,
    roughness: 1.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  wettableMaterials.push(gravelMat);

  const buildPathRibbon = (points: [number, number][], width: number) => {
    const curvePts = points.map(([px, pz]) => new THREE.Vector3(px, groundHeightAt(px, pz) + 0.06, pz));
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const curveLen = curve.getLength();
    const uRepeats = Math.max(2, curveLen / (width * 1.6));
    const steps = 64;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      const perpX = -tan.z * (width * 0.5);
      const perpZ = tan.x * (width * 0.5);

      const lx = pt.x + perpX;
      const lz = pt.z + perpZ;
      const rx = pt.x - perpX;
      const rz = pt.z - perpZ;

      positions.push(lx, groundHeightAt(lx, lz) + 0.055, lz);
      positions.push(rx, groundHeightAt(rx, rz) + 0.055, rz);
      uvs.push(t * uRepeats, 0, t * uRepeats, 1);

      if (i < steps) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const uvAttr = new THREE.Float32BufferAttribute(uvs, 2);
    geo.setAttribute('uv', uvAttr);
    geo.setAttribute('uv1', uvAttr);
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, gravelMat);
    mesh.receiveShadow = true;
    root.add(mesh);
  };

  buildPathRibbon([[-8, -8], [4, -10], [18, -14], [34, -20], [52, -26]], 3.6);
  buildPathRibbon([[18, -14], [16, 4], [14, 22], [17, 22]], 3.2);
  buildPathRibbon([[51, 22], [62, 16], [64, -6], [52, -26]], 3.0);
  buildPathRibbon([[14, 22], [6, 42], [-10, 44], [-22, 42]], 3.2);

  // ---------------------------------------------------------------------------
  // 3. Real 3D GLB Town Architecture (Vet Hospital, Supermarket, Heritage Cottages)
  // ---------------------------------------------------------------------------
  interface BuildingSpec {
    x: number;
    z: number;
    w: number;
    d: number;
    rotY: number;
    glbUrl: string;
    targetWidth: number;
    signText?: string;
    signBg?: string;
    signInk?: string;
    interiorId?: StoreInteriorId;
    interiorSubtitle?: string;
  }

  const buildings: BuildingSpec[] = [
    // --- Main Street East Side (facing West onto Main Street & Town Square) ---
    {
      x: -5.5,
      z: -24,
      w: 12,
      d: 9.5,
      rotY: -Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_02_timber_barn.glb',
      targetWidth: 11.8,
      signText: 'PAWS & COLLARS PET STORE',
      signBg: '#4c2614',
      signInk: '#ffe6a8',
      interiorId: 'pet_store',
      interiorSubtitle: 'Gourmet Treats, Toys & Plush Beds',
    },
    {
      x: -5.5,
      z: -38,
      w: 12,
      d: 9.5,
      rotY: -Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_05_terracotta_shop.glb',
      targetWidth: 11.6,
      signText: 'SUNBEAM CAFE',
      signBg: '#233b52',
      signInk: '#f8eed9',
    },
    {
      x: -5.5,
      z: -52,
      w: 12,
      d: 9.5,
      rotY: -Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_08_white_tile_apt.glb',
      targetWidth: 12.2,
      signText: 'TAILWAG GROOMING SPA',
      signBg: '#3a2a54',
      signInk: '#f7ebff',
    },
    {
      x: -5.5,
      z: 10,
      w: 13,
      d: 10.5,
      rotY: -Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_03_red_brick_grand.glb',
      targetWidth: 12.4,
      signText: 'BARKSHIRE SUPERMARKET',
      signBg: '#5e3c19',
      signInk: '#fff2d1',
      interiorId: 'supermarket',
      interiorSubtitle: 'Stocked Aisles & Fresh Produce',
    },
    {
      x: -5.5,
      z: 24,
      w: 12,
      d: 9.5,
      rotY: -Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_06_brown_stucco.glb',
      targetWidth: 11.8,
      signText: 'PAW PRINT PIZZERIA',
      signBg: '#6e231c',
      signInk: '#fff0d6',
    },
    {
      x: -5.5,
      z: 38,
      w: 12,
      d: 9.5,
      rotY: -Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_04_red_brick_low.glb',
      targetWidth: 11.6,
      signText: 'GREENLEAF FLORIST',
      signBg: '#224a34',
      signInk: '#ecfae8',
    },

    // --- Main Street West Side (facing East onto Main Street & Town Square) ---
    {
      x: -39.5,
      z: -24,
      w: 12.5,
      d: 10,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_01_tudor_bakery.glb',
      targetWidth: 12.6,
      signText: 'BARKSHIRE BAKERY',
      signBg: '#f6ebd4',
      signInk: '#5c2a1b',
      interiorId: 'bakery',
      interiorSubtitle: 'Warm Biscuits & Pup Cups',
    },
    {
      x: -39.5,
      z: -38,
      w: 12,
      d: 9.5,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_03_red_brick_grand.glb',
      targetWidth: 12.0,
      signText: 'PRIME BUTCHER & TREATS',
      signBg: '#234232',
      signInk: '#f4e3b8',
    },
    {
      x: -39.5,
      z: -52,
      w: 12,
      d: 9.5,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_04_red_brick_low.glb',
      targetWidth: 11.6,
      signText: 'BARKSHIRE HARDWARE',
      signBg: '#3a352f',
      signInk: '#f5e4c4',
    },
    {
      x: -39.5,
      z: 10,
      w: 13.5,
      d: 10.5,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_10_urban_arcade.glb',
      targetWidth: 12.4,
      signText: 'WESTSIDE VET HOSPITAL',
      signBg: '#1e425e',
      signInk: '#f4f8fc',
    },
    {
      x: -39.5,
      z: 24,
      w: 12,
      d: 10,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_01_tudor_bakery.glb',
      targetWidth: 12.2,
      signText: 'OLD TOWN BOOKS',
      signBg: '#324834',
      signInk: '#f5ebd3',
    },
    {
      x: -39.5,
      z: 38,
      w: 12,
      d: 10,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_09_modern_roastery.glb',
      targetWidth: 11.8,
      signText: 'HARBOR COFFEE ROASTERS',
      signBg: '#3d281a',
      signInk: '#fae6c8',
    },

    // --- Cross Street West Neighborhood (framing both sides of Cross Street) ---
    {
      x: -54,
      z: -19,
      w: 12,
      d: 10,
      rotY: 0,
      glbUrl: '/models/world/ready/bldg_02_timber_barn.glb',
      targetWidth: 11.8,
      signText: 'MAPLE INN',
      signBg: '#4f2c20',
      signInk: '#f8ead4',
    },
    {
      x: -67,
      z: -19,
      w: 12,
      d: 10,
      rotY: 0,
      glbUrl: '/models/world/ready/bldg_05_terracotta_shop.glb',
      targetWidth: 11.6,
      signText: 'WESTSIDE MARKET',
      signBg: '#274336',
      signInk: '#f2e8cc',
    },
    {
      x: -54,
      z: 3,
      w: 12,
      d: 10,
      rotY: Math.PI,
      glbUrl: '/models/world/ready/bldg_09_modern_roastery.glb',
      targetWidth: 11.8,
      signText: 'TOWN HALL ANNEX',
      signBg: '#26384d',
      signInk: '#eef4fa',
    },
    {
      x: -67,
      z: 3,
      w: 12,
      d: 10,
      rotY: Math.PI,
      glbUrl: '/models/world/ready/bldg_08_white_tile_apt.glb',
      targetWidth: 11.8,
    },
    {
      x: -56,
      z: -36,
      w: 12,
      d: 10,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_06_brown_stucco.glb',
      targetWidth: 11.6,
    },
    {
      x: -56,
      z: 24,
      w: 12,
      d: 10,
      rotY: Math.PI / 2,
      glbUrl: '/models/world/ready/bldg_03_red_brick_grand.glb',
      targetWidth: 11.8,
    },
  ];

  buildings.forEach((b) => {
    const grp = new THREE.Group();
    const gy = groundHeightAt(b.x, b.z);
    grp.position.set(b.x, gy, b.z);
    grp.rotation.y = b.rotY;

    // Grounded stone foundation pad beneath each 3D building
    const padGeo = new THREE.BoxGeometry(b.w + 0.8, 0.24, b.d + 0.8);
    padGeo.setAttribute('uv1', padGeo.attributes.uv);
    const pad = new THREE.Mesh(padGeo, plazaMat);
    pad.position.y = 0.12;
    pad.receiveShadow = true;
    grp.add(pad);

    // Clean two-post streetfront storefront signboard right at the sidewalk edge
    if (b.signText) {
      const signTex = makeSignTexture(b.signText, b.signBg || '#332820', b.signInk || '#f6ecd4');
      extraTextures.push(signTex);
      const signCenterX = 0;
      const signZ = b.d * 0.5 + 1.15;
      [-2.15, 2.15].forEach((px) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.3, 8), darkMetalMat);
        post.position.set(signCenterX + px, 1.65, signZ);
        post.castShadow = true;
        grp.add(post);
      });

      const signBoard = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 1.08, 0.16),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 }),
      );
      signBoard.position.set(signCenterX, 3.0, signZ);
      signBoard.castShadow = true;
      grp.add(signBoard);
    }

    // Enterable Store Welcome Mat + Glowing Doorway Trigger
    if (b.interiorId) {
      const matLocalZ = b.d * 0.5 + 1.05;
      const welcomeMat = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.05, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x8a4b25, roughness: 0.92 }),
      );
      welcomeMat.position.set(0, 0.17, matLocalZ);
      welcomeMat.receiveShadow = true;
      grp.add(welcomeMat);

      const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.15, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffd166,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
        }),
      );
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.set(0, 0.2, matLocalZ);
      grp.add(glowRing);

      // Compute world position of the welcome mat in front of the store
      const worldMatX = b.x + Math.sin(b.rotY) * (matLocalZ + 0.5);
      const worldMatZ = b.z + Math.cos(b.rotY) * (matLocalZ + 0.5);
      doorways.push({
        id: b.interiorId,
        name: b.signText || 'Local Shop',
        subtitle: b.interiorSubtitle || 'Step inside',
        position: new THREE.Vector3(worldMatX, gy + 0.15, worldMatZ),
        exitYaw: b.rotY,
      });
    }

    loadReadyGlb(b.glbUrl)
      .then((proto) => {
        if (disposed) return;
        const clone = proto.clone(true);
        clone.traverse((ch) => {
          if ((ch as THREE.Mesh).isMesh) {
            const m = ch as THREE.Mesh;
            m.castShadow = !isSoftwareGl;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mt) => {
              if (mt) {
                mt.side = THREE.DoubleSide;
                if ((mt as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  (mt as THREE.MeshStandardMaterial).envMapIntensity = 0.4;
                }
              }
            });
          }
        });
        clone.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(clone);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);
        const maxFoot = Math.max(sz.x, sz.z, 0.1);
        const sc = b.targetWidth / maxFoot;
        clone.scale.setScalar(sc);
        // Seat firmly into the stone foundation pad (y=0.12) so buildings never float
        clone.position.set(-ctr.x * sc, 0.12 - box.min.y * sc, -ctr.z * sc);
        grp.add(clone);
      })
      .catch((err) => {
        console.error('[BuildingGLB] Failed to load or place', b.glbUrl, err);
      });

    root.add(grp);

    const rotated = Math.abs(Math.sin(b.rotY)) > 0.7;
    collision.addBox(b.x, b.z, (rotated ? b.d : b.w) + 0.5, (rotated ? b.w : b.d) + 0.5);
  });

  // Town Square Heritage Clocktower Monument at (-22, -8)
  const clockTower = new THREE.Group();
  clockTower.position.set(-22, 0.16, -8);
  const ctBase = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.7, 1.1, 8), curbMat);
  ctBase.position.y = 0.55;
  ctBase.castShadow = true;
  ctBase.receiveShadow = true;
  clockTower.add(ctBase);
  const ctShaft = new THREE.Mesh(new THREE.BoxGeometry(2.1, 6.2, 2.1), brickMat);
  ctShaft.position.y = 4.1;
  ctShaft.castShadow = true;
  clockTower.add(ctShaft);
  const ctBelfry = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.1, 2.5), curbMat);
  ctBelfry.position.y = 8.0;
  ctBelfry.castShadow = true;
  clockTower.add(ctBelfry);
  const ctSpire = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.4, 4), roofMat);
  ctSpire.rotation.y = Math.PI / 4;
  ctSpire.position.y = 10.7;
  ctSpire.castShadow = true;
  clockTower.add(ctSpire);
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xf7f2e3, roughness: 0.4 });
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((rot) => {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 20), faceMat);
    face.rotation.x = Math.PI / 2;
    face.rotation.z = rot;
    face.position.set(Math.sin(rot) * 1.26, 8.0, Math.cos(rot) * 1.26);
    clockTower.add(face);
  });
  root.add(clockTower);
  collision.addCircle(-22, -8, 2.8);

  // ---------------------------------------------------------------------------
  // 4. Fire Hydrants (Prime Pee-Marking Landmarks!)
  // ---------------------------------------------------------------------------
  const hydrantRedMat = new THREE.MeshPhysicalMaterial({
    color: 0xc92622,
    roughness: 0.28,
    metalness: 0.24,
    clearcoat: 0.7,
  });
  const hydrantLocations: [number, number][] = [
    [-28.2, 16],
    [-28.2, -26],
    [-15.8, -28],
    [-15.8, 12],
    [-8.5, -13.5],
    [10.2, -14],
    [13.5, 19.5],
  ];

  hydrantLocations.forEach(([hx, hz], idx) => {
    const hGrp = new THREE.Group();
    const hy = groundHeightAt(hx, hz);
    hGrp.position.set(hx, hy, hz);

    const hBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.18, 12), hydrantRedMat);
    hBase.position.y = 0.09;
    hGrp.add(hBase);

    const hBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.62, 14), hydrantRedMat);
    hBody.position.y = 0.45;
    hBody.castShadow = true;
    hGrp.add(hBody);

    const hCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), hydrantRedMat);
    hCap.position.y = 0.76;
    hGrp.add(hCap);

    const hNozzles = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.52, 10), darkMetalMat);
    hNozzles.rotation.z = Math.PI / 2;
    hNozzles.position.y = 0.56;
    hGrp.add(hNozzles);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe6b843,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.65, 24), ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.05;
    hGrp.add(ringMesh);

    root.add(hGrp);
    collision.addCircle(hx, hz, 0.34);
    hydrants.push({
      id: `hydrant_${idx}`,
      position: new THREE.Vector3(hx, hy, hz),
      marked: false,
      ringMesh,
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Real 3D GLB Street Cars, Park Benches, Street Lamps & Cafe Patio
  // ---------------------------------------------------------------------------
  const carSpots: [number, number, number][] = [
    [-25.1, -38, 0],
    [-18.9, 26, Math.PI],
    [-25.1, 6, 0],
  ];
  carSpots.forEach(([cx, cz]) => collision.addBox(cx, cz, 2.1, 4.3));
  spawnInstancedGlb(
    '/models/world/ready/prop_car_bmw.glb',
    carSpots.map(([cx, cz, rotY]) => ({
      x: cx,
      y: groundHeightAt(cx, cz) + 0.03,
      z: cz,
      rotY,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    })),
    { castShadow: true, receiveShadow: true },
  );

  // Street Lamps (warm glowing lanterns)
  const lampLocations: [number, number][] = [
    [-27.5, -42],
    [-27.5, -20],
    [-27.5, 4],
    [-27.5, 28],
    [-16.5, -42],
    [-16.5, -20],
    [-16.5, 4],
    [-16.5, 28],
    [9.5, -14],
    [26.5, -14],
    [18, -5.5],
    [18, -22.5],
    [14, 16],
    [54, 18],
  ];
  const sharedLampGlow = new THREE.MeshStandardMaterial({
    color: 0xfff5d6,
    emissive: 0xffc864,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  });
  lampGlowMaterials.push(sharedLampGlow);

  lampLocations.forEach(([lx, lz]) => {
    const lamp = new THREE.Group();
    const ly = groundHeightAt(lx, lz);
    lamp.position.set(lx, ly, lz);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 4.2, 10), darkMetalMat);
    pole.position.y = 2.1;
    pole.castShadow = true;
    lamp.add(pole);

    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.48, 6), sharedLampGlow);
    lantern.position.y = 4.35;
    lamp.add(lantern);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.24, 6), darkMetalMat);
    cap.position.y = 4.7;
    lamp.add(cap);

    root.add(lamp);
    collision.addCircle(lx, lz, 0.22);
  });

  // Real 3D GLB Wooden Park & Plaza Benches
  const benchLocations: [number, number, number][] = [
    [-15.5, -14, -Math.PI / 2],
    [-28.5, -14, Math.PI / 2],
    [12, -8, -Math.PI / 4],
    [24, -8, Math.PI / 4],
    [12, -20, -Math.PI * 0.75],
    [24, -20, Math.PI * 0.75],
    [22, 10, 0.2],
    [42, 8, -0.35],
    [34, 37, Math.PI],
  ];
  benchLocations.forEach(([bx, bz]) => collision.addCircle(bx, bz, 0.95));
  spawnInstancedGlb(
    '/models/world/ready/prop_bench.glb',
    benchLocations.map(([bx, bz, rotY]) => ({
      x: bx,
      y: groundHeightAt(bx, bz),
      z: bz,
      rotY,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    })),
    { castShadow: true, receiveShadow: true },
  );

  // Cafe Patio Umbrella Tables outside Sunbeam Cafe
  [
    [-13.2, -29.5],
    [-13.2, -34.5],
  ].forEach(([tx, tz]) => {
    const tbl = new THREE.Group();
    tbl.position.set(tx, groundHeightAt(tx, tz), tz);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.5, 10), darkMetalMat);
    stem.position.y = 1.25;
    tbl.add(stem);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 18), woodMat);
    top.position.y = 0.84;
    top.castShadow = true;
    tbl.add(top);
    const umbrella = new THREE.Mesh(
      new THREE.ConeGeometry(1.55, 0.52, 8),
      new THREE.MeshStandardMaterial({ color: 0xcf4a3c, roughness: 0.85 }),
    );
    umbrella.position.y = 2.55;
    umbrella.castShadow = true;
    tbl.add(umbrella);
    root.add(tbl);
    collision.addCircle(tx, tz, 0.85);
  });

  // ---------------------------------------------------------------------------
  // 6. Park Landmarks: Fountain, Willow Pond + Bridge + Photogrammetry Rock Outcrops, Gazebo
  // ---------------------------------------------------------------------------
  const fY = groundHeightAt(18, -14);
  const fountain = new THREE.Group();
  fountain.position.set(18, fY, -14);
  const fOuter = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.85, 24), curbMat);
  fOuter.position.y = 0.42;
  fOuter.castShadow = true;
  fOuter.receiveShadow = true;
  fountain.add(fOuter);
  const fWater = new THREE.Mesh(
    new THREE.CylinderGeometry(3.05, 3.05, 0.14, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0x3f88a8,
      roughness: 0.12,
      metalness: 0.05,
      clearcoat: 1.0,
    }),
  );
  fWater.position.y = 0.76;
  fountain.add(fWater);
  const fPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 2.4, 16), curbMat);
  fPedestal.position.y = 1.45;
  fPedestal.castShadow = true;
  fountain.add(fPedestal);
  const fBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.65, 0.45, 20), curbMat);
  fBowl.position.y = 2.45;
  fBowl.castShadow = true;
  fountain.add(fBowl);
  root.add(fountain);
  collision.addCircle(18, -14, 3.8);

  const dropCount = 110;
  const dropPositions = new Float32Array(dropCount * 3);
  const dropSeeds = new Float32Array(dropCount * 2);
  for (let i = 0; i < dropCount; i++) {
    dropSeeds[i * 2] = Math.random() * Math.PI * 2;
    dropSeeds[i * 2 + 1] = Math.random();
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
  const dropMat = new THREE.PointsMaterial({
    color: 0xdff5ff,
    size: 0.18,
    transparent: true,
    opacity: 0.82,
  });
  const fountainDrops = new THREE.Points(dropGeo, dropMat);
  fountainDrops.position.set(18, fY, -14);
  fountainDrops.frustumCulled = false;
  root.add(fountainDrops);

  // Reflective Duck Pond + Arched Wooden Bridge
  const pondGeo = new THREE.CircleGeometry(1, 48);
  pondGeo.rotateX(-Math.PI / 2);
  pondGeo.scale(POND_RX, 1, POND_RZ);
  const pondMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2f6c7d,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: isSoftwareGl ? 0.86 : 0.92,
  });
  const pondMesh = new THREE.Mesh(pondGeo, pondMaterial);
  pondMesh.position.set(POND_CENTER_X, -0.35, POND_CENTER_Z);
  pondMesh.receiveShadow = true;
  root.add(pondMesh);

  const lilyMat = new THREE.MeshStandardMaterial({ color: 0x3b7d3b, roughness: 0.72 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.3;
    const r = 0.45 + (i % 3) * 0.16;
    const lx = POND_CENTER_X + Math.cos(a) * POND_RX * r;
    const lz = POND_CENTER_Z + Math.sin(a) * POND_RZ * r;
    if (Math.abs(lz - POND_CENTER_Z) < 2.8) continue;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 14), lilyMat);
    pad.position.set(lx, -0.31, lz);
    root.add(pad);
  }

  // Photogrammetry Yangmingshan Nature Rock Outcrops framing Willow Pond & outer park!
  const rockPlacements: PlacementTransform[] = [
    { x: POND_CENTER_X - 11.5, y: -0.45, z: POND_CENTER_Z - 9.5, rotY: 0.4, scaleX: 1.1, scaleY: 1.2, scaleZ: 1.1 },
    { x: POND_CENTER_X + 12.2, y: -0.42, z: POND_CENTER_Z - 8.2, rotY: 2.1, scaleX: 1.25, scaleY: 1.3, scaleZ: 1.15 },
    { x: POND_CENTER_X - 9.8, y: -0.42, z: POND_CENTER_Z + 10.4, rotY: 3.8, scaleX: 1.0, scaleY: 1.1, scaleZ: 1.0 },
    { x: POND_CENTER_X + 11.0, y: -0.45, z: POND_CENTER_Z + 9.8, rotY: 5.1, scaleX: 1.3, scaleY: 1.4, scaleZ: 1.2 },
    { x: 46, y: groundHeightAt(46, -38) - 0.15, z: -38, rotY: 1.2, scaleX: 1.35, scaleY: 1.5, scaleZ: 1.35 },
    { x: 58, y: groundHeightAt(58, 4) - 0.15, z: 4, rotY: 2.8, scaleX: 1.2, scaleY: 1.3, scaleZ: 1.2 },
  ];
  spawnInstancedGlb('/models/world/ready/rock_outcrop.glb', rockPlacements, {
    castShadow: true,
    receiveShadow: true,
  });

  const bridgeGroup = new THREE.Group();
  const plankCount = 34;
  for (let i = 0; i <= plankCount; i++) {
    const t = (i / plankCount) * 2 - 1;
    const bx = POND_CENTER_X + t * 17.2;
    const by = groundHeightAt(bx, POND_CENTER_Z);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 4.1), woodMat);
    plank.position.set(bx, by - 0.06, POND_CENTER_Z);
    plank.rotation.z = -Math.sin(t * Math.PI * 0.5) * 0.12;
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);

    if (i % 4 === 0) {
      [-1.95, 1.95].forEach((rz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), woodMat);
        post.position.set(bx, by + 0.52, POND_CENTER_Z + rz);
        post.castShadow = true;
        bridgeGroup.add(post);
      });
    }
  }
  [-1.95, 1.95].forEach((rz) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * 2 - 1;
      const bx = POND_CENTER_X + t * 17.2;
      pts.push(new THREE.Vector3(bx, groundHeightAt(bx, POND_CENTER_Z) + 1.05, POND_CENTER_Z + rz));
    }
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 8, false),
      woodMat,
    );
    bridgeGroup.add(rail);
  });
  root.add(bridgeGroup);

  // Timber Gazebo at (52, -26)
  const gzY = groundHeightAt(52, -26);
  const gazebo = new THREE.Group();
  gazebo.position.set(52, gzY, -26);
  const gzDeck = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.42, 8), woodMat);
  gzDeck.position.y = 0.21;
  gzDeck.receiveShadow = true;
  gazebo.add(gzDeck);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.6, 8), woodMat);
    col.position.set(Math.cos(a) * 4.0, 2.0, Math.sin(a) * 4.0);
    col.castShadow = true;
    gazebo.add(col);
    collision.addCircle(52 + Math.cos(a) * 4.0, -26 + Math.sin(a) * 4.0, 0.25);
  }
  const gzRoof = new THREE.Mesh(new THREE.ConeGeometry(5.5, 2.4, 8), roofMat);
  gzRoof.position.y = 4.95;
  gzRoof.castShadow = true;
  gazebo.add(gzRoof);
  root.add(gazebo);

  // Picnic Blankets with Real 3D GLB Woven Baskets & Fruit!
  const basketTransforms: PlacementTransform[] = [];
  [
    [28, -36, 0xbf473d],
    [4, 34, 0x3b6c94],
  ].forEach(([px, pz, col]) => {
    const py = groundHeightAt(px, pz);
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.05, 2.6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 }),
    );
    blanket.position.set(px, py + 0.03, pz);
    blanket.receiveShadow = true;
    root.add(blanket);

    basketTransforms.push({
      x: px + 1.0,
      y: py + 0.05,
      z: pz - 0.7,
      rotY: 0.5,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
    collision.addCircle(px + 1.0, pz - 0.7, 0.42);
  });
  spawnInstancedGlb('/models/world/ready/prop_basket.glb', basketTransforms, {
    castShadow: true,
    receiveShadow: true,
  });

  // Dog Agility Ring Jump at (32, -4)
  const agY = groundHeightAt(32, -4);
  const agility = new THREE.Group();
  agility.position.set(32, agY, -4);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xe69c2e, roughness: 0.42 });
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.085, 10, 24), ringMat);
  hoop.position.y = 1.45;
  hoop.castShadow = true;
  agility.add(hoop);
  [-1.25, 1.25].forEach((sx) => {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.5, 8), woodMat);
    st.position.set(sx, 1.25, 0);
    st.castShadow = true;
    agility.add(st);
    collision.addCircle(32 + sx, -4, 0.18);
  });
  root.add(agility);

  // ---------------------------------------------------------------------------
  // 7. Photorealistic GPU-Instanced 3D GLB Forests, Hero Trees, Bushes, Flowers & 3D Grass!
  // ---------------------------------------------------------------------------
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const oakTrees: PlacementTransform[] = [];
  const mapleTrees: PlacementTransform[] = [];
  const birchTrees: PlacementTransform[] = [];
  const fir1Trees: PlacementTransform[] = [];
  const fir2Trees: PlacementTransform[] = [];
  const placedTreeXY: [number, number][] = [];

  for (let i = 0; i < 140; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 12 + rand() * (WORLD_PLAYABLE_RADIUS - 14);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;

    if (isTownArea(tx, tz)) continue;
    if (isOnRoadOrPlaza(tx, tz)) continue;
    if (isInPond(tx, tz, 4.2)) continue;
    if (Math.hypot(tx - 52, tz - -26) < 8.5) continue;
    if (Math.hypot(tx - 18, tz - -14) < 13) continue;
    if (Math.hypot(tx - 32, tz - -4) < 6) continue;
    if (Math.abs(tz - POND_CENTER_Z) < 4.5 && tx > 12 && tx < 56) continue;

    let tooClose = false;
    for (let j = 0; j < placedTreeXY.length; j++) {
      if (Math.hypot(tx - placedTreeXY[j][0], tz - placedTreeXY[j][1]) < 5.4) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    placedTreeXY.push([tx, tz]);
    collision.addCircle(tx, tz, 0.55);

    const sc = 0.85 + rand() * 0.45;
    const tf: PlacementTransform = {
      x: tx,
      y: groundHeightAt(tx, tz) - 0.08,
      z: tz,
      rotY: rand() * Math.PI * 2,
      scaleX: sc,
      scaleY: sc * (0.92 + rand() * 0.18),
      scaleZ: sc,
    };
    const pick = rand();
    if (pick < 0.36) oakTrees.push(tf);
    else if (pick < 0.64) mapleTrees.push(tf);
    else if (pick < 0.86) birchTrees.push(tf);
    else fir1Trees.push(tf);
  }

  // Dense alpine fir & oak perimeter forest rim
  for (let i = 0; i < 108; i++) {
    const angle = (i / 108) * Math.PI * 2 + (rand() - 0.5) * 0.04;
    const r = WORLD_PLAYABLE_RADIUS + 4 + rand() * 20;
    const tx = Math.cos(angle) * r;
    const tz = Math.sin(angle) * r;
    const sc = 1.05 + rand() * 0.6;
    const tf: PlacementTransform = {
      x: tx,
      y: groundHeightAt(tx, tz) - 0.12,
      z: tz,
      rotY: rand() * Math.PI * 2,
      scaleX: sc,
      scaleY: sc * (0.95 + rand() * 0.2),
      scaleZ: sc,
    };
    if (i % 3 === 0) fir1Trees.push(tf);
    else if (i % 3 === 1) fir2Trees.push(tf);
    else oakTrees.push(tf);
  }

  // 4 Scenic Hero Park Trees at signature vistas
  const heroSpots: [number, number, number][] = [
    [8, -26, 0.4],
    [42, -8, 1.9],
    [22, 34, 3.2],
    [-4, 22, 4.7],
  ];
  heroSpots.forEach(([hx, hz]) => collision.addCircle(hx, hz, 0.7));
  spawnInstancedGlb(
    '/models/world/ready/tree_hero.glb',
    heroSpots.map(([hx, hz, rotY]) => ({
      x: hx,
      y: groundHeightAt(hx, hz) - 0.1,
      z: hz,
      rotY,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    })),
    { castShadow: true, receiveShadow: true, foliageAlpha: true },
  );

  spawnInstancedGlb('/models/world/ready/tree_oak.glb', oakTrees, { foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/tree_maple.glb', mapleTrees, { foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/tree_birch.glb', birchTrees, { foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/tree_fir_1.glb', fir1Trees, { foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/tree_fir_2.glb', fir2Trees, { foliageAlpha: true });

  // Yellow Lupine Bushes & Leafy Green Shrubs
  const lupineBushes: PlacementTransform[] = [];
  const shrub1Bushes: PlacementTransform[] = [];
  const shrub2Bushes: PlacementTransform[] = [];

  for (let i = 0; i < 78; i++) {
    const a = rand() * Math.PI * 2;
    const r = 10 + rand() * (WORLD_PLAYABLE_RADIUS - 15);
    let bx = Math.cos(a) * r;
    let bz = Math.sin(a) * r;
    if (isTownArea(bx, bz) || isInPond(bx, bz, 2.5) || isOnRoadOrPlaza(bx, bz)) {
      bx = 16 + (rand() - 0.5) * 65;
      bz = -15 + (rand() - 0.5) * 65;
      if (isInPond(bx, bz, 2.5)) bz = -30;
    }
    const sc = 0.75 + rand() * 0.55;
    const tf: PlacementTransform = {
      x: bx,
      y: groundHeightAt(bx, bz) - 0.04,
      z: bz,
      rotY: rand() * Math.PI * 2,
      scaleX: sc,
      scaleY: sc,
      scaleZ: sc,
    };
    if (i % 3 === 0) lupineBushes.push(tf);
    else if (i % 3 === 1) shrub1Bushes.push(tf);
    else shrub2Bushes.push(tf);
  }
  spawnInstancedGlb('/models/world/ready/bush_lupine.glb', lupineBushes, { foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/bush_shrub_1.glb', shrub1Bushes, { foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/bush_shrub_2.glb', shrub2Bushes, { foliageAlpha: true });

  // Rose, Sunflower & Tulip Flower Beds around Town Plaza, Fountain & Gazebo!
  const roses: PlacementTransform[] = [];
  const sunflowers: PlacementTransform[] = [];
  const tulips: PlacementTransform[] = [];

  // Ring of roses & tulips framing the Park Fountain & Town Clocktower
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const fx = 18 + Math.cos(a) * 11.2;
    const fz = -14 + Math.sin(a) * 11.2;
    if (!isOnRoadOrPlaza(fx, fz)) {
      const tf = {
        x: fx,
        y: groundHeightAt(fx, fz),
        z: fz,
        rotY: rand() * Math.PI * 2,
        scaleX: 0.95,
        scaleY: 0.95,
        scaleZ: 0.95,
      };
      if (i % 2 === 0) roses.push(tf);
      else tulips.push(tf);
    }
  }
  for (let i = 0; i < 48; i++) {
    const a = rand() * Math.PI * 2;
    const r = 14 + rand() * 52;
    const fx = Math.cos(a) * r;
    const fz = Math.sin(a) * r;
    if (isTownArea(fx, fz) || isInPond(fx, fz, 2.0) || isOnRoadOrPlaza(fx, fz)) continue;
    const sc = 0.8 + rand() * 0.45;
    const tf = {
      x: fx,
      y: groundHeightAt(fx, fz),
      z: fz,
      rotY: rand() * Math.PI * 2,
      scaleX: sc,
      scaleY: sc,
      scaleZ: sc,
    };
    if (i % 3 === 0) sunflowers.push(tf);
    else if (i % 3 === 1) roses.push(tf);
    else tulips.push(tf);
  }
  spawnInstancedGlb('/models/world/ready/flower_rose.glb', roses, { castShadow: false, foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/flower_sunflower.glb', sunflowers, { castShadow: false, foliageAlpha: true });
  spawnInstancedGlb('/models/world/ready/flower_tulips.glb', tulips, { castShadow: false, foliageAlpha: true });

  // (Grass uses the continuous 1K PBR Grass005 terrain + flowers/shrubs; wide flat grass slabs removed to prevent slope floating.)

  // ---------------------------------------------------------------------------
  // 8. 24 Collectible 3D GLB Doggy Treats & Snacks Tucked Across Town & Park!
  // ---------------------------------------------------------------------------
  const treatPlacements: {
    name: string;
    kind: HiddenTreatEntity['kind'];
    x: number;
    z: number;
  }[] = [
    { name: 'Warm Bakery Croissant', kind: 'croissant', x: -33.2, z: -32 },
    { name: 'Alleyway Butter Roll', kind: 'croissant', x: -46.5, z: -38 },
    { name: 'Butcher’s Smoked Treats', kind: 'bone', x: -33.2, z: -48 },
    { name: 'Hidden Marrow Treats', kind: 'bone', x: -47, z: -53 },
    { name: 'Cafe Patio Crisp Apple', kind: 'biscuit', x: -12.4, z: -31.8 },
    { name: 'Pet Shop Crispy Strips', kind: 'bacon', x: -12.8, z: -49 },
    { name: 'Clocktower Golden Snack', kind: 'biscuit', x: -18.5, z: -8 },
    { name: 'Vet Clinic Good-Boy Bag', kind: 'bacon', x: -33.2, z: 18 },
    { name: 'Bookshop Sweet Banana', kind: 'croissant', x: -33.2, z: 36 },
    { name: 'Supermarket Treat Pack', kind: 'bone', x: -12.4, z: 20 },
    { name: 'West Lane Secret Snack', kind: 'bacon', x: -55, z: -7 },
    { name: 'Parked BMW Curb Treat', kind: 'biscuit', x: -23.0, z: -38 },
    { name: 'Park Gate Welcome Treat', kind: 'biscuit', x: 2.5, z: -9.5 },
    { name: 'Fountain Rim Treat Pack', kind: 'bone', x: 22.8, z: -14 },
    { name: 'North Fountain Sweet Slice', kind: 'croissant', x: 18, z: -20.5 },
    { name: 'Picnic Blanket Watermelon', kind: 'bacon', x: 28, z: -36 },
    { name: 'Gazebo Center Feast Pack', kind: 'bone', x: 52, z: -26 },
    { name: 'Agility Hoop Reward Apple', kind: 'biscuit', x: 32, z: -4 },
    { name: 'Willow Bridge Golden Treat', kind: 'bone', x: 34, z: 22 },
    { name: 'South Pond Shore Watermelon', kind: 'bacon', x: 34, z: 36.2 },
    { name: 'East Trail Sweet Banana', kind: 'croissant', x: 61, z: 8 },
    { name: 'South Meadow Picnic Apple', kind: 'biscuit', x: 4, z: 34 },
    { name: 'Birch Grove Secret Treats', kind: 'bone', x: 54, z: -52 },
    { name: 'Town Edge Hidden Snack', kind: 'bacon', x: -12, z: 46 },
  ];

  const treatGlbByKind: Record<HiddenTreatEntity['kind'], string> = {
    bone: '/models/world/ready/prop_treats.glb',
    bacon: '/models/world/ready/prop_watermelon.glb',
    biscuit: '/models/world/ready/prop_apple.glb',
    croissant: '/models/world/ready/prop_banana.glb',
  };

  treatPlacements.forEach((tp, idx) => {
    const grp = new THREE.Group();
    const ty = groundHeightAt(tp.x, tp.z);
    grp.position.set(tp.x, ty + 0.22, tp.z);

    loadReadyGlb(treatGlbByKind[tp.kind])
      .then((proto) => {
        if (disposed) return;
        const clone = proto.clone(true);
        clone.scale.setScalar(1.35);
        clone.traverse((ch) => {
          if ((ch as THREE.Mesh).isMesh) {
            ch.castShadow = true;
          }
        });
        grp.add(clone);
      })
      .catch(() => {});

    // Golden Scent Trail Beam (visible during Sniff mode or nearby)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd566,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const scentBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.42, 4.4, 12, 1, true), beamMat);
    scentBeam.position.y = 2.2;
    grp.add(scentBeam);

    root.add(grp);

    treats.push({
      id: `treat_${idx}`,
      name: tp.name,
      kind: tp.kind,
      position: new THREE.Vector3(tp.x, ty, tp.z),
      group: grp,
      scentBeam,
      found: false,
      hungerRestore: tp.kind === 'bone' || tp.kind === 'bacon' ? 28 : 22,
      energyRestore: 16,
    });
  });

  const update = (
    elapsed: number,
    dt: number,
    sniffActive: boolean,
    scentRadius: number,
    dogPos: THREE.Vector3,
  ) => {
    const arr = fountainDrops.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < dropCount; i++) {
      const angle = dropSeeds[i * 2];
      const t = (elapsed * 0.9 + dropSeeds[i * 2 + 1]) % 1;
      const spread = 0.2 + t * 2.1;
      arr[i * 3] = Math.cos(angle) * spread;
      arr[i * 3 + 1] = 2.65 + t * 2.2 - t * t * 3.8;
      arr[i * 3 + 2] = Math.sin(angle) * spread;
    }
    fountainDrops.geometry.attributes.position.needsUpdate = true;

    pondMaterial.roughness = 0.08 + Math.sin(elapsed * 1.4) * 0.025;

    for (let i = 0; i < treats.length; i++) {
      const tr = treats[i];
      if (tr.found) continue;
      tr.group.rotation.y += dt * 1.35;
      tr.group.position.y = tr.position.y + 0.24 + Math.sin(elapsed * 2.6 + i) * 0.06;

      const dist = tr.position.distanceTo(dogPos);
      const targetOpacity =
        sniffActive && dist < scentRadius
          ? 0.36 + Math.sin(elapsed * 5 + i) * 0.12
          : dist < 6.5
            ? 0.16
            : 0.0;
      const mat = tr.scentBeam.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.damp(mat.opacity, targetOpacity, 6, dt);
    }
  };

  const dispose = () => {
    disposed = true;
    extraTextures.forEach((t) => t.dispose());
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
        else m.material?.dispose();
      }
    });
  };

  return {
    root,
    treats,
    hydrants,
    doorways,
    pondMaterial,
    fountainDrops,
    lampGlowMaterials,
    wettableMaterials,
    update,
    dispose,
  };
}
