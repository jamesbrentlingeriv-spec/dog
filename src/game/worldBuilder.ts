import * as THREE from 'three';
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
  ctx.font = 'bold 46px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildBarkshireWorld(
  textures: ProceduralTextureSet,
  collision: CollisionWorld,
  isSoftwareGl: boolean,
): BuiltWorld {
  const root = new THREE.Group();
  const treats: HiddenTreatEntity[] = [];
  const hydrants: HydrantSpot[] = [];
  const lampGlowMaterials: THREE.MeshStandardMaterial[] = [];
  const wettableMaterials: THREE.MeshStandardMaterial[] = [];
  const extraTextures: THREE.Texture[] = [];

  // ---------------------------------------------------------------------------
  // 1. Sculpted Rolling Terrain with Biome Vertex Tinting
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
      tmpColor.setHex(0xb8aa8e); // sandy pond bed
    } else if (isTownArea(x, z)) {
      tmpColor.setHex(0xf4f9ee); // manicured town turf
    } else if (Math.hypot(x, z) > WORLD_PLAYABLE_RADIUS) {
      tmpColor.setHex(0xdce8d0); // lush outer hills
    } else {
      const patch = Math.sin(x * 0.08) * Math.cos(z * 0.08);
      tmpColor.setHex(patch > 0.25 ? 0xfafdf4 : patch < -0.25 ? 0xe6f0dc : 0xf0f7e8);
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
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.grassRoughness,
    aoMap: textures.grassAo,
    aoMapIntensity: 0.7,
    vertexColors: true,
    roughness: 1.0,
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
    roughness: 0.85,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wettableMaterials.push(asphaltMat);

  const cobbleMat = new THREE.MeshStandardMaterial({
    map: textures.cobbleAlbedo,
    normalMap: textures.cobbleNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: textures.cobbleRoughness,
    aoMap: textures.cobbleAo,
    aoMapIntensity: 0.75,
    roughness: 1.0,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wettableMaterials.push(cobbleMat);

  const plazaMat = new THREE.MeshStandardMaterial({
    map: textures.plazaAlbedo,
    normalMap: textures.plazaNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.plazaRoughness,
    aoMap: textures.plazaAo,
    aoMapIntensity: 0.75,
    roughness: 1.0,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wettableMaterials.push(plazaMat);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xb7b1a5, roughness: 0.85 });

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

  // Winding photorealistic dirt/stone park pathways (Pathway001 PBR + organic alpha cutout)
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
      // U runs along path length, V runs 0..1 across width to match Pathway001_Opacity!
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

  buildPathRibbon(
    [
      [-8, -8],
      [4, -10],
      [18, -14],
      [34, -20],
      [52, -26],
    ],
    3.6,
  );
  buildPathRibbon(
    [
      [18, -14],
      [16, 4],
      [14, 22],
      [17, 22],
    ],
    3.2,
  );
  buildPathRibbon(
    [
      [51, 22],
      [62, 16],
      [64, -6],
      [52, -26],
    ],
    3.0,
  );
  buildPathRibbon(
    [
      [14, 22],
      [6, 42],
      [-10, 44],
      [-22, 42],
    ],
    3.2,
  );

  // ---------------------------------------------------------------------------
  // 3. Detailed Composite Town Buildings (6-12 parts each)
  // ---------------------------------------------------------------------------
  const brickMat = new THREE.MeshStandardMaterial({
    map: textures.brickAlbedo,
    bumpMap: textures.brickBump,
    bumpScale: 0.09,
    roughness: 0.86,
  });
  const plasterMat = new THREE.MeshStandardMaterial({
    map: textures.plasterAlbedo,
    roughness: 0.84,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.roofAlbedo,
    roughness: 0.74,
    metalness: 0.08,
  });
  const windowGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b5870,
    roughness: 0.1,
    metalness: 0.15,
    clearcoat: 1.0,
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

  interface BuildingSpec {
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    rotY: number;
    style: 'brick' | 'plaster' | 'painted';
    paintColor?: number;
    awningColor?: number;
    signText?: string;
    signBg?: string;
    signInk?: string;
  }

  const buildings: BuildingSpec[] = [
    {
      x: -40,
      z: -32,
      w: 13,
      h: 8.5,
      d: 10,
      rotY: Math.PI / 2,
      style: 'brick',
      awningColor: 0xb83b32,
      signText: 'BARKSHIRE BAKERY',
      signBg: '#f6ebd4',
      signInk: '#5c2a1b',
    },
    {
      x: -40,
      z: -48,
      w: 12,
      h: 7.4,
      d: 9.5,
      rotY: Math.PI / 2,
      style: 'plaster',
      awningColor: 0x2b6248,
      signText: 'PRIME BUTCHER & TREATS',
      signBg: '#234232',
      signInk: '#f4e3b8',
    },
    {
      x: -6,
      z: -32,
      w: 12.5,
      h: 7.8,
      d: 9.5,
      rotY: -Math.PI / 2,
      style: 'painted',
      paintColor: 0xd9c7a8,
      awningColor: 0x37597d,
      signText: 'SUNBEAM CAFE',
      signBg: '#2b3e52',
      signInk: '#f8eed9',
    },
    {
      x: -6,
      z: -49,
      w: 11.5,
      h: 9.2,
      d: 9.5,
      rotY: -Math.PI / 2,
      style: 'brick',
      awningColor: 0x8b5b2b,
      signText: 'PAWS & COLLARS',
      signBg: '#4c321b',
      signInk: '#f6e4ba',
    },
    {
      x: -41,
      z: 18,
      w: 14,
      h: 9.6,
      d: 11,
      rotY: Math.PI / 2,
      style: 'brick',
      awningColor: 0xa62626,
      signText: 'FIRE STATION NO. 4',
      signBg: '#8e1f1f',
      signInk: '#fff4d6',
    },
    {
      x: -41,
      z: 36,
      w: 12,
      h: 7.5,
      d: 10,
      rotY: Math.PI / 2,
      style: 'plaster',
      awningColor: 0x4b6e4e,
      signText: 'OLD TOWN BOOKS',
      signBg: '#324834',
      signInk: '#f5ebd3',
    },
    {
      x: -5.5,
      z: 20,
      w: 11,
      h: 7.2,
      d: 9,
      rotY: -Math.PI / 2,
      style: 'painted',
      paintColor: 0xc9b497,
      awningColor: 0xb6772c,
      signText: 'MARKET GROCER',
      signBg: '#5e3c19',
      signInk: '#fff2d1',
    },
    {
      x: -55,
      z: -18,
      w: 12,
      h: 8.2,
      d: 10,
      rotY: 0,
      style: 'painted',
      paintColor: 0xb5c2b7,
    },
    {
      x: -55,
      z: 4,
      w: 12,
      h: 8.8,
      d: 10,
      rotY: Math.PI,
      style: 'plaster',
    },
  ];

  buildings.forEach((b) => {
    const grp = new THREE.Group();
    const gy = groundHeightAt(b.x, b.z);
    grp.position.set(b.x, gy, b.z);
    grp.rotation.y = b.rotY;

    const wallMat =
      b.style === 'brick'
        ? brickMat
        : b.style === 'plaster'
          ? plasterMat
          : new THREE.MeshStandardMaterial({ color: b.paintColor ?? 0xd8cdb8, roughness: 0.85 });

    // Stone plinth base
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.35, 0.75, b.d + 0.35), curbMat);
    plinth.position.y = 0.375;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    grp.add(plinth);

    // Main masonry body
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), wallMat);
    body.position.y = b.h * 0.5 + 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    // Roof cornice trim
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.35, b.d + 0.6), curbMat);
    cornice.position.y = b.h + 0.55;
    grp.add(cornice);

    // Pitched hip roof (extruded prism / pyramid)
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.74, 3.2, 4),
      roofMat,
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(b.w / Math.max(b.w, b.d), 1, b.d / Math.max(b.w, b.d));
    roof.position.y = b.h + 2.25;
    roof.castShadow = true;
    grp.add(roof);

    // Brick Chimney
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.5, 1.1), brickMat);
    chimney.position.set(b.w * 0.28, b.h + 2.4, -b.d * 0.2);
    chimney.castShadow = true;
    grp.add(chimney);

    // Front Door with Frame
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.75, 0.24), woodMat);
    doorFrame.position.set(0, 1.85, b.d * 0.5 + 0.06);
    grp.add(doorFrame);
    const doorKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xe6bf55, metalness: 0.85, roughness: 0.2 }),
    );
    doorKnob.position.set(0.65, 1.65, b.d * 0.5 + 0.22);
    grp.add(doorKnob);

    // Shopfront & upper story recessed windows + flower boxes
    const winPositions = [
      [-b.w * 0.3, 2.1],
      [b.w * 0.3, 2.1],
      [-b.w * 0.3, 5.4],
      [0, 5.4],
      [b.w * 0.3, 5.4],
    ];
    winPositions.forEach(([wx, wy]) => {
      if (wy > b.h - 0.6) return;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.18, 0.36), curbMat);
      sill.position.set(wx, wy - 0.95, b.d * 0.5 + 0.12);
      grp.add(sill);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.85, 0.16), woodMat);
      frame.position.set(wx, wy, b.d * 0.5 + 0.04);
      grp.add(frame);

      const pane = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.52, 0.12), windowGlassMat);
      pane.position.set(wx, wy, b.d * 0.5 + 0.1);
      grp.add(pane);
    });

    // Fabric Storefront Awning
    if (b.awningColor) {
      const awningMat = new THREE.MeshStandardMaterial({
        color: b.awningColor,
        roughness: 0.88,
      });
      const awning = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.82, 0.18, 1.9), awningMat);
      awning.position.set(0, 3.65, b.d * 0.5 + 0.88);
      awning.rotation.x = 0.26;
      awning.castShadow = true;
      grp.add(awning);
    }

    // Painted Wooden Shop Sign
    if (b.signText) {
      const signTex = makeSignTexture(b.signText, b.signBg || '#332820', b.signInk || '#f6ecd4');
      extraTextures.push(signTex);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(b.w * 0.66, 1.05, 0.16),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }),
      );
      sign.position.set(0, 4.35, b.d * 0.5 + 0.14);
      grp.add(sign);
    }

    root.add(grp);

    // Add world-aligned collider accounting for rotation
    const rotated = Math.abs(Math.sin(b.rotY)) > 0.7;
    collision.addBox(b.x, b.z, (rotated ? b.d : b.w) + 0.6, (rotated ? b.w : b.d) + 0.6);
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
  // 4 Clock faces
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

    // Subtle territory ring that illuminates golden once marked!
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
  // 5. Street Props: Vintage Composite Cars, Benches, Street Lamps, Cafe Tables
  // ---------------------------------------------------------------------------
  const addVintageCar = (cx: number, cz: number, rotY: number, colorHex: number) => {
    const car = new THREE.Group();
    car.position.set(cx, groundHeightAt(cx, cz), cz);
    car.rotation.y = rotY;
    const paint = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      roughness: 0.22,
      metalness: 0.42,
      clearcoat: 0.9,
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdce2e8, roughness: 0.16, metalness: 0.92 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.88 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.1), paint);
    chassis.position.y = 0.62;
    chassis.castShadow = true;
    car.add(chassis);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.68, 2.05), paint);
    cabin.position.set(0, 1.24, -0.18);
    cabin.castShadow = true;
    car.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.56, 2.12), windowGlassMat);
    windshield.position.set(0, 1.24, -0.18);
    car.add(windshield);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 0.2), chrome);
    bumperF.position.set(0, 0.42, 2.1);
    car.add(bumperF);
    const bumperR = bumperF.clone();
    bumperR.position.z = -2.1;
    car.add(bumperR);

    [
      [-0.95, 1.25],
      [0.95, 1.25],
      [-0.95, -1.25],
      [0.95, -1.25],
    ].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      wheel.castShadow = true;
      car.add(wheel);
    });
    root.add(car);
    collision.addBox(cx, cz, 2.2, 4.3);
  };

  addVintageCar(-25.1, -38, 0, 0x3b6978);
  addVintageCar(-18.9, 26, Math.PI, 0xa84336);
  addVintageCar(-25.1, 6, 0, 0xc9a24b);

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

  // Wooden Park & Plaza Benches
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
  benchLocations.forEach(([bx, bz, rotY]) => {
    const bench = new THREE.Group();
    bench.position.set(bx, groundHeightAt(bx, bz), bz);
    bench.rotation.y = rotY;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.62), woodMat);
    seat.position.y = 0.52;
    seat.castShadow = true;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.54, 0.1), woodMat);
    back.position.set(0, 0.86, -0.26);
    back.rotation.x = -0.18;
    back.castShadow = true;
    bench.add(back);
    [-0.85, 0.85].forEach((lx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.58), darkMetalMat);
      leg.position.set(lx, 0.26, 0);
      bench.add(leg);
    });
    root.add(bench);
    collision.addCircle(bx, bz, 0.95);
  });

  // Cafe Patio Umbrella Tables outside Sunbeam Cafe (-12, -32)
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
  // 6. Expansive Park Landmarks: Fountain, Duck Pond + Bridge, Gazebo, Agility, Picnic
  // ---------------------------------------------------------------------------
  // A. Central Stone Fountain at (18, -14)
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

  // Animated Fountain Water Droplets
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

  // B. Reflective Duck Pond + Arched Wooden Bridge + Lily Pads
  const pondGeo = new THREE.CircleGeometry(1, 48);
  pondGeo.rotateX(-Math.PI / 2);
  pondGeo.scale(POND_RX, 1, POND_RZ);
  const pondMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2f6c7d,
    roughness: 0.12,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: isSoftwareGl ? 0.86 : 0.9,
  });
  const pondMesh = new THREE.Mesh(pondGeo, pondMaterial);
  pondMesh.position.set(POND_CENTER_X, -0.35, POND_CENTER_Z);
  pondMesh.receiveShadow = true;
  root.add(pondMesh);

  // Lily pads & wooden ducks on pond
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

  // Arched Wooden Footbridge spanning the pond
  const bridgeGroup = new THREE.Group();
  const plankCount = 34;
  for (let i = 0; i <= plankCount; i++) {
    const t = (i / plankCount) * 2 - 1; // -1..1
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
  // Curved bridge handrails
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

  // C. Timber Gazebo at (52, -26)
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

  // D. Picnic Blankets & Dog Agility Hoops in the Meadow
  [
    [28, -36, 0xbf473d],
    [4, 34, 0x3b6c94],
  ].forEach(([px, pz, col]) => {
    const py = groundHeightAt(px, pz);
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.06, 2.6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 }),
    );
    blanket.position.set(px, py + 0.04, pz);
    blanket.receiveShadow = true;
    root.add(blanket);

    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, 0.45), woodMat);
    basket.position.set(px + 1.0, py + 0.25, pz - 0.7);
    basket.castShadow = true;
    root.add(basket);
    collision.addCircle(px + 1.0, pz - 0.7, 0.42);
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
  // 7. Instanced Multi-Part Trees, Perimeter Forest, Shrubs & Boulders (180+ trees)
  // ---------------------------------------------------------------------------
  const treeCoords: { x: number; z: number; scale: number; tint: number }[] = [];

  // Deterministic pseudo-random helper so layout is hand-crafted & repeatable
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Park interior groves + town boulevard accents
  for (let i = 0; i < 140; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 12 + rand() * (WORLD_PLAYABLE_RADIUS - 14);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;

    if (isTownArea(tx, tz)) continue;
    if (isOnRoadOrPlaza(tx, tz)) continue;
    if (isInPond(tx, tz, 4.2)) continue;
    if (Math.hypot(tx - 52, tz - -26) < 8.5) continue; // keep gazebo clear
    if (Math.hypot(tx - 18, tz - -14) < 13) continue; // keep fountain clear
    if (Math.hypot(tx - 32, tz - -4) < 6) continue; // keep agility clear
    if (Math.abs(tz - POND_CENTER_Z) < 4.5 && tx > 12 && tx < 56) continue; // keep bridge approach clear

    // Avoid overlapping existing trees
    let tooClose = false;
    for (let j = 0; j < treeCoords.length; j++) {
      if (Math.hypot(tx - treeCoords[j].x, tz - treeCoords[j].z) < 5.2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    treeCoords.push({
      x: tx,
      z: tz,
      scale: 0.85 + rand() * 0.5,
      tint: rand(),
    });
    collision.addCircle(tx, tz, 0.55);
  }

  // Dense natural perimeter forest rim (so world never feels like a floating box!)
  for (let i = 0; i < 110; i++) {
    const angle = (i / 110) * Math.PI * 2 + (rand() - 0.5) * 0.04;
    const r = WORLD_PLAYABLE_RADIUS + 4 + rand() * 20;
    treeCoords.push({
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      scale: 1.1 + rand() * 0.65,
      tint: rand(),
    });
  }

  const treeCount = treeCoords.length;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.46, 3.8, 8);
  trunkGeo.translate(0, 1.9, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    map: textures.barkAlbedo,
    roughness: 0.94,
  });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  trunkInst.castShadow = true;
  trunkInst.receiveShadow = true;

  const crown1Geo = new THREE.DodecahedronGeometry(2.35, 1);
  crown1Geo.translate(0, 4.7, 0);
  const crown2Geo = new THREE.DodecahedronGeometry(1.75, 1);
  crown2Geo.translate(0.75, 6.1, -0.45);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.0,
  });
  const crown1Inst = new THREE.InstancedMesh(crown1Geo, foliageMat, treeCount);
  const crown2Inst = new THREE.InstancedMesh(crown2Geo, foliageMat, treeCount);
  crown1Inst.castShadow = true;
  crown1Inst.receiveShadow = true;
  crown2Inst.castShadow = true;

  const dummy = new THREE.Object3D();
  const cColor = new THREE.Color();
  const foliagePalette = [0x3d6e35, 0x4b7d39, 0x5d8c3e, 0x2f5e34, 0x768f3c];

  treeCoords.forEach((tc, i) => {
    const gy = groundHeightAt(tc.x, tc.z);
    dummy.position.set(tc.x, gy - 0.15, tc.z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(tc.scale, tc.scale * (0.92 + rand() * 0.2), tc.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    crown1Inst.setMatrixAt(i, dummy.matrix);
    crown2Inst.setMatrixAt(i, dummy.matrix);

    const baseHex = foliagePalette[Math.floor(tc.tint * foliagePalette.length)];
    cColor.setHex(baseHex).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.06);
    crown1Inst.setColorAt(i, cColor);
    cColor.offsetHSL(0.01, 0.04, 0.05);
    crown2Inst.setColorAt(i, cColor);
  });

  trunkInst.instanceMatrix.needsUpdate = true;
  crown1Inst.instanceMatrix.needsUpdate = true;
  crown2Inst.instanceMatrix.needsUpdate = true;
  if (crown1Inst.instanceColor) crown1Inst.instanceColor.needsUpdate = true;
  if (crown2Inst.instanceColor) crown2Inst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  crown1Inst.computeBoundingSphere();
  crown2Inst.computeBoundingSphere();
  root.add(trunkInst, crown1Inst, crown2Inst);

  // Decorative Park Rocks & Flower Bushes (Instanced)
  const bushCount = 85;
  const bushGeo = new THREE.DodecahedronGeometry(0.75, 1);
  bushGeo.translate(0, 0.52, 0);
  const bushInst = new THREE.InstancedMesh(
    bushGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    bushCount,
  );
  bushInst.castShadow = true;
  bushInst.receiveShadow = true;

  for (let i = 0; i < bushCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = 10 + rand() * (WORLD_PLAYABLE_RADIUS - 15);
    let bx = Math.cos(a) * r;
    let bz = Math.sin(a) * r;
    if (isTownArea(bx, bz) || isInPond(bx, bz, 2.5) || isOnRoadOrPlaza(bx, bz)) {
      bx = 16 + (rand() - 0.5) * 65;
      bz = -15 + (rand() - 0.5) * 65;
      if (isInPond(bx, bz, 2.5)) bz = -30;
    }
    const sc = 0.65 + rand() * 0.7;
    dummy.position.set(bx, groundHeightAt(bx, bz) - 0.08, bz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(sc * 1.2, sc * 0.85, sc);
    dummy.updateMatrix();
    bushInst.setMatrixAt(i, dummy.matrix);
    cColor.setHex(i % 5 === 0 ? 0xc25b78 : i % 7 === 0 ? 0xd9a738 : 0x45783a);
    bushInst.setColorAt(i, cColor);
  }
  bushInst.instanceMatrix.needsUpdate = true;
  if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
  bushInst.computeBoundingSphere();
  root.add(bushInst);

  // ---------------------------------------------------------------------------
  // 8. 24 Hidden Treats Tucked in Every Corner of Town & Park!
  // ---------------------------------------------------------------------------
  const treatPlacements: {
    name: string;
    kind: HiddenTreatEntity['kind'];
    x: number;
    z: number;
  }[] = [
    { name: 'Warm Bakery Croissant', kind: 'croissant', x: -33.2, z: -32 },
    { name: 'Alleyway Butter Roll', kind: 'croissant', x: -46.5, z: -38 },
    { name: 'Butcher’s Smoked Bone', kind: 'bone', x: -33.2, z: -48 },
    { name: 'Hidden Marrow Bone', kind: 'bone', x: -47, z: -53 },
    { name: 'Cafe Patio Biscuit', kind: 'biscuit', x: -12.4, z: -31.8 },
    { name: 'Pet Shop Crispy Bacon', kind: 'bacon', x: -12.8, z: -49 },
    { name: 'Clocktower Golden Treat', kind: 'biscuit', x: -18.5, z: -8 },
    { name: 'Firehouse Bacon Strip', kind: 'bacon', x: -33.2, z: 18 },
    { name: 'Bookshop Corner Crumb', kind: 'biscuit', x: -33.2, z: 36 },
    { name: 'Market Stall Bone', kind: 'bone', x: -12.4, z: 20 },
    { name: 'West Lane Secret Bacon', kind: 'bacon', x: -55, z: -7 },
    { name: 'Vintage Car Curb Biscuit', kind: 'biscuit', x: -23.0, z: -38 },
    { name: 'Park Gate Welcome Treat', kind: 'biscuit', x: 2.5, z: -9.5 },
    { name: 'Fountain Rim Bone', kind: 'bone', x: 22.8, z: -14 },
    { name: 'North Fountain Croissant', kind: 'croissant', x: 18, z: -20.5 },
    { name: 'Picnic Blanket Bacon', kind: 'bacon', x: 28, z: -36 },
    { name: 'Gazebo Center Feast Bone', kind: 'bone', x: 52, z: -26 },
    { name: 'Agility Hoop Reward', kind: 'biscuit', x: 32, z: -4 },
    { name: 'Willow Bridge Golden Bone', kind: 'bone', x: 34, z: 22 },
    { name: 'South Pond Shore Bacon', kind: 'bacon', x: 34, z: 36.2 },
    { name: 'East Trail Honey Biscuit', kind: 'biscuit', x: 61, z: 8 },
    { name: 'South Meadow Croissant', kind: 'croissant', x: 4, z: 34 },
    { name: 'Birch Grove Secret Bone', kind: 'bone', x: 54, z: -52 },
    { name: 'Town Edge Hidden Bacon', kind: 'bacon', x: -12, z: 46 },
  ];

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xf6ebd2,
    roughness: 0.42,
    emissive: 0x3b2c10,
    emissiveIntensity: 0.18,
  });
  const baconMat = new THREE.MeshStandardMaterial({
    color: 0xb83c2a,
    roughness: 0.36,
    emissive: 0x3a1008,
    emissiveIntensity: 0.2,
  });
  const biscuitMat = new THREE.MeshStandardMaterial({
    color: 0xd99b43,
    roughness: 0.65,
    emissive: 0x3d2408,
    emissiveIntensity: 0.18,
  });

  treatPlacements.forEach((tp, idx) => {
    const grp = new THREE.Group();
    const ty = groundHeightAt(tp.x, tp.z);
    grp.position.set(tp.x, ty + 0.22, tp.z);

    if (tp.kind === 'bone') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 10), boneMat);
      shaft.rotation.z = Math.PI / 2;
      grp.add(shaft);
      [-0.21, 0.21].forEach((ex) => {
        [-0.055, 0.055].forEach((ez) => {
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), boneMat);
          knob.position.set(ex, 0, ez);
          grp.add(knob);
        });
      });
    } else if (tp.kind === 'bacon') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.19), baconMat);
      grp.add(strip);
      const fat = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.068, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xf4dec6, roughness: 0.4 }),
      );
      grp.add(fat);
    } else if (tp.kind === 'croissant') {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.075, 8, 14, Math.PI * 1.2),
        biscuitMat,
      );
      arc.rotation.x = Math.PI / 2;
      grp.add(arc);
    } else {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 10), biscuitMat);
      grp.add(disc);
    }

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
    // Animate fountain water arc droplets
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

    // Gentle pond shimmer
    pondMaterial.roughness = 0.1 + Math.sin(elapsed * 1.4) * 0.03;

    // Rotate unfound treats + pulse scent trails when sniffing
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
    pondMaterial,
    fountainDrops,
    lampGlowMaterials,
    wettableMaterials,
    update,
    dispose,
  };
}
