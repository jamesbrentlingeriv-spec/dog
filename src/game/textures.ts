import * as THREE from 'three';

export interface ProceduralTextureSet {
  // Photorealistic PBR sets loaded from /textures/
  grassAlbedo: THREE.Texture;
  grassNormal: THREE.Texture;
  grassRoughness: THREE.Texture;
  grassAo: THREE.Texture;
  grassBump: THREE.Texture;

  cobbleAlbedo: THREE.Texture;
  cobbleNormal: THREE.Texture;
  cobbleRoughness: THREE.Texture;
  cobbleAo: THREE.Texture;
  cobbleBump: THREE.Texture;

  plazaAlbedo: THREE.Texture;
  plazaNormal: THREE.Texture;
  plazaRoughness: THREE.Texture;
  plazaAo: THREE.Texture;

  dirtPathAlbedo: THREE.Texture;
  dirtPathNormal: THREE.Texture;
  dirtPathRoughness: THREE.Texture;
  dirtPathAo: THREE.Texture;
  dirtPathAlpha: THREE.Texture;

  // Kept for backwards compatibility & secondary props/buildings
  asphaltAlbedo: THREE.CanvasTexture;
  brickAlbedo: THREE.CanvasTexture;
  brickBump: THREE.CanvasTexture;
  plasterAlbedo: THREE.CanvasTexture;
  roofAlbedo: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  barkAlbedo: THREE.CanvasTexture;
  gravelAlbedo: THREE.Texture;
  contactShadow: THREE.CanvasTexture;
  plaidAlbedo: THREE.CanvasTexture;
  dispose: () => void;
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const all: THREE.Texture[] = [];
  const loader = new THREE.TextureLoader();

  const loadPbrTex = (
    rawUrl: string,
    isColor: boolean,
    repeatX = 1,
    repeatY = 1,
    clampT = false,
  ): THREE.Texture => {
    const tex = loader.load(encodeURI(rawUrl));
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = clampT ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAnisotropy;
    all.push(tex);
    return tex;
  };

  // 1. Photorealistic Grass005 1K PBR Set
  const grassAlbedo = loadPbrTex('/textures/grass/Grass005_1K-JPG_Color.jpg', true, 48, 48);
  const grassNormal = loadPbrTex('/textures/grass/Grass005_1K-JPG_NormalGL.jpg', false, 48, 48);
  const grassRoughness = loadPbrTex('/textures/grass/Grass005_1K-JPG_Roughness.jpg', false, 48, 48);
  const grassAo = loadPbrTex('/textures/grass/Grass005_1K-JPG_AmbientOcclusion.jpg', false, 48, 48);

  // 2. Photorealistic Cobblestone (PavingStones138) 1K PBR Set
  const cobbleAlbedo = loadPbrTex('/textures/cobblestone/PavingStones138_1K-JPG_Color.jpg', true, 2, 28);
  const cobbleNormal = loadPbrTex('/textures/cobblestone/PavingStones138_1K-JPG_NormalGL.jpg', false, 2, 28);
  const cobbleRoughness = loadPbrTex('/textures/cobblestone/PavingStones138_1K-JPG_Roughness.jpg', false, 2, 28);
  const cobbleAo = loadPbrTex('/textures/cobblestone/PavingStones138_1K-JPG_AmbientOcclusion.jpg', false, 2, 28);

  // 3. Photorealistic Plaza Stone (PavingStones146) 1K PBR Set
  const plazaAlbedo = loadPbrTex('/textures/plaza stone/PavingStones146_1K-JPG_Color.jpg', true, 9, 9);
  const plazaNormal = loadPbrTex('/textures/plaza stone/PavingStones146_1K-JPG_NormalGL.jpg', false, 9, 9);
  const plazaRoughness = loadPbrTex('/textures/plaza stone/PavingStones146_1K-JPG_Roughness.jpg', false, 9, 9);
  const plazaAo = loadPbrTex('/textures/plaza stone/PavingStones146_1K-JPG_AmbientOcclusion.jpg', false, 9, 9);

  // 4. Photorealistic Dirt Path (Pathway001) 1K PBR Set (U = along path, V = across path with alpha cutout)
  const dirtPathAlbedo = loadPbrTex('/textures/dirt path/Pathway001_1K-JPG_Color.jpg', true, 1, 1, true);
  const dirtPathNormal = loadPbrTex('/textures/dirt path/Pathway001_1K-JPG_NormalGL.jpg', false, 1, 1, true);
  const dirtPathRoughness = loadPbrTex('/textures/dirt path/Pathway001_1K-JPG_Roughness.jpg', false, 1, 1, true);
  const dirtPathAo = loadPbrTex('/textures/dirt path/Pathway001_1K-JPG_AmbientOcclusion.jpg', false, 1, 1, true);
  const dirtPathAlpha = loadPbrTex('/textures/dirt path/Pathway001_1K-JPG_Opacity.jpg', false, 1, 1, true);

  // 5. Town Asphalt Road
  const [aC, aCtx] = createCanvas(512);
  aCtx.fillStyle = '#36393e';
  aCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8000; i++) {
    const v = 42 + Math.floor(Math.random() * 32);
    aCtx.fillStyle = `rgb(${v},${v},${v + 2})`;
    aCtx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  aCtx.fillStyle = '#d4b459';
  for (let y = 16; y < 512; y += 96) {
    aCtx.fillRect(250, y, 12, 52);
  }
  const asphaltAlbedo = finalizeTexture(aC, true, maxAnisotropy, 1, 14);
  all.push(asphaltAlbedo);

  // 6. Warm Heritage Brick Albedo + Bump
  const [bC, bCtx] = createCanvas(512);
  const [bbC, bbCtx] = createCanvas(512);
  bCtx.fillStyle = '#b9b1a3';
  bCtx.fillRect(0, 0, 512, 512);
  bbCtx.fillStyle = '#404040';
  bbCtx.fillRect(0, 0, 512, 512);
  const bRows = 16;
  const bCols = 8;
  for (let r = 0; r < bRows; r++) {
    const off = (r % 2) * (512 / bCols / 2);
    for (let c = -1; c <= bCols; c++) {
      const bx = c * (512 / bCols) + off + 2;
      const by = r * (512 / bRows) + 2;
      const bw = 512 / bCols - 4;
      const bh = 512 / bRows - 4;
      const red = 148 + Math.floor(Math.random() * 44);
      const grn = 66 + Math.floor(Math.random() * 24);
      const blu = 52 + Math.floor(Math.random() * 18);
      bCtx.fillStyle = `rgb(${red},${grn},${blu})`;
      bCtx.fillRect(bx, by, bw, bh);
      bbCtx.fillStyle = '#d8d8d8';
      bbCtx.fillRect(bx, by, bw, bh);
    }
  }
  const brickAlbedo = finalizeTexture(bC, true, maxAnisotropy, 2, 2);
  const brickBump = finalizeTexture(bbC, false, maxAnisotropy, 2, 2);
  all.push(brickAlbedo, brickBump);

  // 7. Timber & Plaster Facade
  const [pC, pCtx] = createCanvas(512);
  pCtx.fillStyle = '#e5dccb';
  pCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3500; i++) {
    const v = 208 + Math.floor(Math.random() * 26);
    pCtx.fillStyle = `rgba(${v},${v - 8},${v - 18},0.35)`;
    pCtx.fillRect(Math.random() * 512, Math.random() * 512, 4, 4);
  }
  pCtx.fillStyle = '#4b3626';
  pCtx.fillRect(0, 0, 512, 24);
  pCtx.fillRect(0, 244, 512, 24);
  pCtx.fillRect(0, 488, 512, 24);
  pCtx.fillRect(0, 0, 22, 512);
  pCtx.fillRect(245, 0, 22, 512);
  pCtx.fillRect(490, 0, 22, 512);
  const plasterAlbedo = finalizeTexture(pC, true, maxAnisotropy, 2, 1);
  all.push(plasterAlbedo);

  // 8. Slate / Terracotta Roof Shingles
  const [rC, rCtx] = createCanvas(512);
  rCtx.fillStyle = '#3d444d';
  rCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 16; row++) {
    const off = (row % 2) * 16;
    for (let col = -1; col < 17; col++) {
      const shade = 52 + Math.floor(Math.random() * 24);
      rCtx.fillStyle = `rgb(${shade + 4},${shade + 8},${shade + 14})`;
      rCtx.fillRect(col * 32 + off + 1, row * 32 + 1, 30, 29);
      rCtx.fillStyle = 'rgba(0,0,0,0.22)';
      rCtx.fillRect(col * 32 + off, row * 32 + 29, 32, 3);
    }
  }
  const roofAlbedo = finalizeTexture(rC, true, maxAnisotropy, 3, 3);
  all.push(roofAlbedo);

  // 9. Warm Cedar Wood Planks
  const [wC, wCtx] = createCanvas(512);
  wCtx.fillStyle = '#8b5e3c';
  wCtx.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 8; p++) {
    const y = p * 64;
    const tone = 122 + Math.floor(Math.random() * 28);
    wCtx.fillStyle = `rgb(${tone},${Math.floor(tone * 0.68)},${Math.floor(tone * 0.43)})`;
    wCtx.fillRect(0, y + 2, 512, 60);
    for (let g = 0; g < 22; g++) {
      wCtx.fillStyle = 'rgba(55,32,16,0.12)';
      wCtx.fillRect(0, y + Math.random() * 60, 512, 1.5);
    }
    wCtx.fillStyle = '#3b2414';
    wCtx.fillRect(0, y, 512, 3);
  }
  const woodAlbedo = finalizeTexture(wC, true, maxAnisotropy, 2, 2);
  all.push(woodAlbedo);

  // 10. Oak Tree Bark
  const [bkC, bkCtx] = createCanvas(256);
  bkCtx.fillStyle = '#4f3a2a';
  bkCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 450; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const shade = 52 + Math.floor(Math.random() * 38);
    bkCtx.fillStyle = `rgb(${shade + 18},${shade + 4},${shade - 8})`;
    bkCtx.fillRect(x, y, 2 + Math.random() * 4, 18 + Math.random() * 40);
  }
  const barkAlbedo = finalizeTexture(bkC, true, maxAnisotropy, 2, 3);
  all.push(barkAlbedo);

  // 11. Soft Radial Contact Shadow
  const [csC, csCtx] = createCanvas(128);
  const grad = csCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(12, 16, 12, 0.56)');
  grad.addColorStop(0.55, 'rgba(12, 16, 12, 0.25)');
  grad.addColorStop(1, 'rgba(12, 16, 12, 0)');
  csCtx.fillStyle = grad;
  csCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(csC);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  all.push(contactShadow);

  // 12. Red Plaid Bandana Pattern
  const [plC, plCtx] = createCanvas(128);
  plCtx.fillStyle = '#b92b27';
  plCtx.fillRect(0, 0, 128, 128);
  plCtx.fillStyle = 'rgba(28, 32, 42, 0.55)';
  for (let i = 0; i < 128; i += 32) {
    plCtx.fillRect(i, 0, 10, 128);
    plCtx.fillRect(0, i, 128, 10);
  }
  plCtx.fillStyle = 'rgba(245, 232, 198, 0.7)';
  for (let i = 16; i < 128; i += 32) {
    plCtx.fillRect(i, 0, 3, 128);
    plCtx.fillRect(0, i, 128, 3);
  }
  const plaidAlbedo = finalizeTexture(plC, true, maxAnisotropy, 2, 2);
  all.push(plaidAlbedo);

  return {
    grassAlbedo,
    grassNormal,
    grassRoughness,
    grassAo,
    grassBump: grassNormal,
    cobbleAlbedo,
    cobbleNormal,
    cobbleRoughness,
    cobbleAo,
    cobbleBump: cobbleNormal,
    plazaAlbedo,
    plazaNormal,
    plazaRoughness,
    plazaAo,
    dirtPathAlbedo,
    dirtPathNormal,
    dirtPathRoughness,
    dirtPathAo,
    dirtPathAlpha,
    asphaltAlbedo,
    brickAlbedo,
    brickBump,
    plasterAlbedo,
    roofAlbedo,
    woodAlbedo,
    barkAlbedo,
    gravelAlbedo: dirtPathAlbedo,
    contactShadow,
    plaidAlbedo,
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}
