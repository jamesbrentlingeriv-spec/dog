import * as THREE from 'three';
import type { WeatherMode } from './types';

interface WeatherPreset {
  skyColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  exposure: number;
  lampEmissive: number;
  wetRoughnessDelta: number;
}

const WEATHER_PRESETS: Record<WeatherMode, WeatherPreset> = {
  sunny: {
    skyColor: new THREE.Color(0x9bc8e8),
    fogColor: new THREE.Color(0xb8d7eb),
    fogDensity: 0.0052,
    sunColor: new THREE.Color(0xfff1d6),
    sunIntensity: 2.35,
    sunPos: new THREE.Vector3(48, 68, 36),
    hemiSky: new THREE.Color(0xa6d2f5),
    hemiGround: new THREE.Color(0x63734a),
    hemiIntensity: 0.92,
    exposure: 1.08,
    lampEmissive: 0.2,
    wetRoughnessDelta: 0,
  },
  sunset: {
    skyColor: new THREE.Color(0xd98a5b),
    fogColor: new THREE.Color(0xd4966e),
    fogDensity: 0.0068,
    sunColor: new THREE.Color(0xff9e54),
    sunIntensity: 2.15,
    sunPos: new THREE.Vector3(-72, 24, 42),
    hemiSky: new THREE.Color(0xe6a17e),
    hemiGround: new THREE.Color(0x4f4438),
    hemiIntensity: 0.78,
    exposure: 1.04,
    lampEmissive: 1.65,
    wetRoughnessDelta: 0,
  },
  rain: {
    skyColor: new THREE.Color(0x6b7c8c),
    fogColor: new THREE.Color(0x748594),
    fogDensity: 0.0115,
    sunColor: new THREE.Color(0xc5d4e2),
    sunIntensity: 0.95,
    sunPos: new THREE.Vector3(24, 52, 28),
    hemiSky: new THREE.Color(0x889cb0),
    hemiGround: new THREE.Color(0x3f4c3d),
    hemiIntensity: 0.88,
    exposure: 0.98,
    lampEmissive: 1.25,
    wetRoughnessDelta: -0.34,
  },
  autumn: {
    skyColor: new THREE.Color(0xa8bfd4),
    fogColor: new THREE.Color(0xc4cfc8),
    fogDensity: 0.0066,
    sunColor: new THREE.Color(0xffe1a8),
    sunIntensity: 1.85,
    sunPos: new THREE.Vector3(56, 44, -26),
    hemiSky: new THREE.Color(0xb8cfe0),
    hemiGround: new THREE.Color(0x7a613c),
    hemiIntensity: 0.85,
    exposure: 1.05,
    lampEmissive: 0.55,
    wetRoughnessDelta: -0.04,
  },
};

export class DynamicWeatherSystem {
  private mode: WeatherMode = 'sunny';
  private rainLines: THREE.LineSegments;
  private rainData: Float32Array;
  private rainCount = 650;

  private leafPoints: THREE.Points;
  private leafPositions: Float32Array;
  private leafCount = 240;

  private clouds: THREE.Group;

  private currentBg = WEATHER_PRESETS.sunny.skyColor.clone();
  private currentFog = WEATHER_PRESETS.sunny.fogColor.clone();
  private currentSunColor = WEATHER_PRESETS.sunny.sunColor.clone();
  private currentHemiSky = WEATHER_PRESETS.sunny.hemiSky.clone();
  private currentHemiGround = WEATHER_PRESETS.sunny.hemiGround.clone();
  private currentSunPos = WEATHER_PRESETS.sunny.sunPos.clone();

  private baseRoughnesses: Map<THREE.MeshStandardMaterial, number> = new Map();

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private sunLight: THREE.DirectionalLight,
    private hemiLight: THREE.HemisphereLight,
    private lampGlowMaterials: THREE.MeshStandardMaterial[],
    private wettableMaterials: THREE.MeshStandardMaterial[],
  ) {
    wettableMaterials.forEach((m) => this.baseRoughnesses.set(m, m.roughness));

    // Setup scene background & fog
    scene.background = this.currentBg;
    scene.fog = new THREE.FogExp2(this.currentFog.getHex(), WEATHER_PRESETS.sunny.fogDensity);

    // Soft Volumetric-style Cloud Puffs high in the sky
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.84,
    });
    for (let i = 0; i < 16; i++) {
      const cGrp = new THREE.Group();
      const angle = (i / 16) * Math.PI * 2;
      const dist = 38 + (i % 3) * 32;
      cGrp.position.set(Math.cos(angle) * dist, 42 + (i % 4) * 4, Math.sin(angle) * dist);
      for (let p = 0; p < 4; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + (p % 2) * 2.2, 10, 8), cloudMat);
        puff.position.set((p - 1.5) * 3.8, (p % 2) * 1.1, (p % 3 - 1) * 1.5);
        puff.scale.set(1.2, 0.52, 0.9);
        cGrp.add(puff);
      }
      this.clouds.add(cGrp);
    }
    scene.add(this.clouds);

    // Rain Streak Lines
    const rainPositions = new Float32Array(this.rainCount * 6);
    this.rainData = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainData[i * 3] = (Math.random() - 0.5) * 52;
      this.rainData[i * 3 + 1] = Math.random() * 24;
      this.rainData[i * 3 + 2] = (Math.random() - 0.5) * 52;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xd4e6f5,
      transparent: true,
      opacity: 0.0,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.frustumCulled = false;
    scene.add(this.rainLines);

    // Drifting Autumn Leaves
    this.leafPositions = new Float32Array(this.leafCount * 3);
    for (let i = 0; i < this.leafCount; i++) {
      this.leafPositions[i * 3] = (Math.random() - 0.5) * 60;
      this.leafPositions[i * 3 + 1] = Math.random() * 18;
      this.leafPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.BufferAttribute(this.leafPositions, 3));
    const leafMat = new THREE.PointsMaterial({
      color: 0xd97f2b,
      size: 0.24,
      transparent: true,
      opacity: 0.0,
    });
    this.leafPoints = new THREE.Points(leafGeo, leafMat);
    this.leafPoints.frustumCulled = false;
    scene.add(this.leafPoints);
  }

  public setMode(mode: WeatherMode) {
    this.mode = mode;
  }

  public getMode(): WeatherMode {
    return this.mode;
  }

  public update(elapsed: number, dt: number, focusPos: THREE.Vector3) {
    const preset = WEATHER_PRESETS[this.mode];
    const t = 1 - Math.exp(-1.6 * dt);

    // Smoothly blend lighting, sky, and horizon-matched fog
    this.currentBg.lerp(preset.skyColor, t);
    this.currentFog.lerp(preset.fogColor, t);
    this.currentSunColor.lerp(preset.sunColor, t);
    this.currentHemiSky.lerp(preset.hemiSky, t);
    this.currentHemiGround.lerp(preset.hemiGround, t);
    this.currentSunPos.lerp(preset.sunPos, t);

    if (!(this.scene.background instanceof THREE.Texture)) {
      this.scene.background = this.currentBg;
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.currentFog);
      this.scene.fog.density = THREE.MathUtils.damp(this.scene.fog.density, preset.fogDensity, 1.8, dt);
    }

    this.sunLight.color.copy(this.currentSunColor);
    this.sunLight.intensity = THREE.MathUtils.damp(this.sunLight.intensity, preset.sunIntensity, 2.0, dt);
    // Keep shadow frustum centered near the player dog for razor-sharp shadows everywhere!
    this.sunLight.position.set(
      focusPos.x + this.currentSunPos.x * 0.65,
      this.currentSunPos.y,
      focusPos.z + this.currentSunPos.z * 0.65,
    );
    this.sunLight.target.position.set(focusPos.x, focusPos.y, focusPos.z);
    this.sunLight.target.updateMatrixWorld();

    this.hemiLight.color.copy(this.currentHemiSky);
    this.hemiLight.groundColor.copy(this.currentHemiGround);
    this.hemiLight.intensity = THREE.MathUtils.damp(this.hemiLight.intensity, preset.hemiIntensity, 2.0, dt);
    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,
      preset.exposure,
      2.0,
      dt,
    );

    // Street lamp glow at sunset & rain
    this.lampGlowMaterials.forEach((m) => {
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, preset.lampEmissive, 2.2, dt);
    });

    // Subtle rain-wet surface sheen on roads/cobblestones/terrain
    this.wettableMaterials.forEach((m) => {
      const base = this.baseRoughnesses.get(m) ?? 0.85;
      const targetR = THREE.MathUtils.clamp(base + preset.wetRoughnessDelta, 0.28, 0.96);
      m.roughness = THREE.MathUtils.damp(m.roughness, targetR, 1.5, dt);
    });

    // Slowly drift clouds
    this.clouds.rotation.y = elapsed * 0.008;

    // Rain particle lines
    const rainMat = this.rainLines.material as THREE.LineBasicMaterial;
    const targetRainAlpha = this.mode === 'rain' ? 0.56 : 0.0;
    rainMat.opacity = THREE.MathUtils.damp(rainMat.opacity, targetRainAlpha, 3.0, dt);
    this.rainLines.visible = rainMat.opacity > 0.02;
    if (this.rainLines.visible) {
      const posArr = this.rainLines.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < this.rainCount; i++) {
        this.rainData[i * 3 + 1] -= dt * 24;
        this.rainData[i * 3] -= dt * 2.8; // slight wind slant
        if (this.rainData[i * 3 + 1] < 0) {
          this.rainData[i * 3] = (Math.random() - 0.5) * 52;
          this.rainData[i * 3 + 1] = 20 + Math.random() * 6;
          this.rainData[i * 3 + 2] = (Math.random() - 0.5) * 52;
        }
        const rx = focusPos.x + this.rainData[i * 3];
        const ry = focusPos.y + this.rainData[i * 3 + 1];
        const rz = focusPos.z + this.rainData[i * 3 + 2];
        posArr[i * 6] = rx;
        posArr[i * 6 + 1] = ry;
        posArr[i * 6 + 2] = rz;
        posArr[i * 6 + 3] = rx - 0.14;
        posArr[i * 6 + 4] = ry - 0.95;
        posArr[i * 6 + 5] = rz;
      }
      this.rainLines.geometry.attributes.position.needsUpdate = true;
    }

    // Autumn drifting leaves
    const leafMat = this.leafPoints.material as THREE.PointsMaterial;
    const targetLeafAlpha = this.mode === 'autumn' ? 0.85 : 0.0;
    leafMat.opacity = THREE.MathUtils.damp(leafMat.opacity, targetLeafAlpha, 2.5, dt);
    this.leafPoints.visible = leafMat.opacity > 0.02;
    if (this.leafPoints.visible) {
      const lArr = this.leafPoints.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < this.leafCount; i++) {
        lArr[i * 3] += (Math.sin(elapsed * 1.4 + i) * 1.8 + 1.4) * dt;
        lArr[i * 3 + 1] -= (1.1 + (i % 3) * 0.35) * dt;
        lArr[i * 3 + 2] += Math.cos(elapsed * 1.1 + i) * 1.2 * dt;
        if (lArr[i * 3 + 1] < 0) {
          lArr[i * 3] = focusPos.x + (Math.random() - 0.5) * 56;
          lArr[i * 3 + 1] = focusPos.y + 12 + Math.random() * 8;
          lArr[i * 3 + 2] = focusPos.z + (Math.random() - 0.5) * 56;
        }
      }
      this.leafPoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  public dispose() {
    this.rainLines.geometry.dispose();
    (this.rainLines.material as THREE.Material).dispose();
    this.leafPoints.geometry.dispose();
    (this.leafPoints.material as THREE.Material).dispose();
  }
}
