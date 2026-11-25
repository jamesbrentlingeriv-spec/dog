import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DogAudioEngine } from './audio';
import {
  ActiveDogRig,
  buildGlbDogRig,
  buildProceduralDogRig,
  updateDogRigAnimation,
} from './dogModels';
import { buildNpcPopulation, NpcCharacter } from './npcs';
import { CollisionWorld, getZoneName, isOnRoadOrPlaza, surfaceHeightAt } from './terrain';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  BUILTIN_BREEDS,
  DogActionState,
  DogBreedConfig,
  GameHudSnapshot,
  INITIAL_REWARDS,
  NearbyPrompt,
  SocialReward,
  WeatherMode,
} from './types';
import { DynamicWeatherSystem } from './weather';
import { buildBarkshireWorld, BuiltWorld, StoreDoorway } from './worldBuilder';
import { ActiveStoreInterior, buildStoreInterior } from './interiors';

interface FloatingParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const WEATHER_ORDER: WeatherMode[] = ['sunny', 'sunset', 'rain', 'autumn'];

// Reusable module-scope math objects (zero GC in render loop)
const _moveDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camGoalPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class BarkshireGameEngine {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private collision: CollisionWorld;
  private world: BuiltWorld;
  private npcSystem: {
    group: THREE.Group;
    npcs: NpcCharacter[];
    update: (elapsed: number, dt: number, dogPos: THREE.Vector3) => void;
    dispose: () => void;
  };
  private weatherSystem: DynamicWeatherSystem;
  private audio: DogAudioEngine;

  // Player dog state
  private activeBreed: DogBreedConfig = BUILTIN_BREEDS[0];
  private dogRig: ActiveDogRig | null = null;
  private breedLoadSeq = 0;
  private dogPos = new THREE.Vector3(-18, 0, -14); // Starts in Town Square facing Main Street shops!
  private dogVel = new THREE.Vector3();
  private dogYaw = Math.PI; // Facing north up Main Street toward Paws & Collars Pet Store & Bakery
  private verticalVel = 0;
  private isGrounded = true;
  private turnBank = 0;
  private actionState: DogActionState = 'idle';
  private actionTimer = 0;
  private sniffActive = false;

  // Needs & progress
  private hunger = 86;
  private energy = 92;
  private bladder = 28;
  private treatsFound = 0;
  private friendlyInteractions = 0;
  private hydrantsMarked = 0;
  private rewards: SocialReward[] = INITIAL_REWARDS.map((r) => ({ ...r }));
  private autoWeather = true;
  private autoWeatherTimer = 0;

  // Camera orbit state (starts behind the dog looking straight up Main Street storefronts)
  private camYaw = 0.18;
  private camPitch = 0.24;
  private camDistance = 4.2;
  private isDraggingCam = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private currentCamPos = new THREE.Vector3(-17, 2.4, -10);
  private currentLookAt = new THREE.Vector3(-18, 0.8, -14);

  // Input keys
  private keys = new Set<string>();
  private virtualInput = { forward: 0, right: 0, sprint: false };

  // Dynamic world decals & particles (pee puddles, poop mounds, hearts, crumbs)
  private worldMarksGroup = new THREE.Group();
  private poopProto: THREE.Object3D | null = null;
  private particles: FloatingParticle[] = [];
  private activeSpeech: { speaker: string; text: string; timer: number } | null = null;
  private notification: { id: number; title: string; detail?: string; timer: number } | null = null;
  private notifCounter = 1;

  // Dedicated loadable store interior scene state
  private activeInterior: ActiveStoreInterior | null = null;
  private savedOutdoorState: {
    pos: THREE.Vector3;
    yaw: number;
    camYaw: number;
    skyBg: THREE.Color | THREE.Texture | null;
    fog: THREE.Fog | THREE.FogExp2 | null;
  } | null = null;
  private isTransitioning = false;
  private onTransitionChange?: (fading: boolean, label?: string) => void;
  private outdoorSunLight!: THREE.DirectionalLight;
  private outdoorHemiLight!: THREE.HemisphereLight;

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private lastFrameTime = 0;
  private elapsed = 0;
  private hudEmitTimer = 0;
  private onHudUpdate: (snap: GameHudSnapshot) => void;
  private onContextLostChange?: (lost: boolean) => void;

  // Bound event listeners for clean teardown
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;
  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: () => void;
  private handleWheel: (e: WheelEvent) => void;
  private handleResize: () => void;
  private handleContextLost: (e: Event) => void;
  private handleContextRestored: () => void;

  constructor(
    container: HTMLElement,
    onHudUpdate: (snap: GameHudSnapshot) => void,
    onContextLostChange?: (lost: boolean) => void,
    onTransitionChange?: (fading: boolean, label?: string) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onContextLostChange = onContextLostChange;
    this.onTransitionChange = onTransitionChange;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.audio = new DogAudioEngine();

    // 1. Renderer setup (tuned for stable VRAM & ring pacing on Linux/APU GPUs)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'default',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene + lightweight 1K HDRI IBL + 2K Tonemapped Sky Dome (saves ~400 MB VRAM vs 8K float HDR)
    this.scene = new THREE.Scene();
    this.scene.environmentIntensity = 0.38;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const fallbackEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = fallbackEnv;

    new RGBELoader().load(
      '/hdri/sky_1k.hdr',
      (hdrTex) => {
        if (this.disposed) {
          hdrTex.dispose();
          pmrem.dispose();
          return;
        }
        hdrTex.mapping = THREE.EquirectangularReflectionMapping;
        const envRT = pmrem.fromEquirectangular(hdrTex);
        this.scene.environment = envRT.texture;
        hdrTex.dispose();
        fallbackEnv.dispose();
        pmrem.dispose();
      },
      undefined,
      () => {
        pmrem.dispose();
      },
    );

    new THREE.TextureLoader().load('/hdri/DaySkyHDRI006A_2K_TONEMAPPED.jpg', (skyBg) => {
      if (this.disposed) {
        skyBg.dispose();
        return;
      }
      skyBg.colorSpace = THREE.SRGBColorSpace;
      skyBg.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = skyBg;
      this.scene.backgroundBlurriness = 0.015;
    });

    // 3. Camera (tight 0.04m near plane so close-up zooms never clip the dog)
    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.04, 320);

    // 4. Lighting rig (Balanced warm directional sun + subtle sky/ground HemisphereLight)
    const hemiLight = new THREE.HemisphereLight(0xa6d2f5, 0x52613e, 0.42);
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);
    this.outdoorHemiLight = hemiLight;

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 1.55);
    this.outdoorSunLight = sunLight;
    sunLight.position.set(48, 68, 36);
    sunLight.castShadow = !this.isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 4;
    sunLight.shadow.camera.far = 160;
    const sd = 36;
    sunLight.shadow.camera.left = -sd;
    sunLight.shadow.camera.right = sd;
    sunLight.shadow.camera.top = sd;
    sunLight.shadow.camera.bottom = -sd;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.025;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);

    // 5. Procedural Textures, World, Colliders, NPCs, Weather
    const maxAniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 4);
    this.textures = createProceduralTextures(maxAniso);
    this.collision = new CollisionWorld();
    this.world = buildBarkshireWorld(this.textures, this.collision, this.isSoftwareGl);
    this.scene.add(this.world.root);
    this.scene.add(this.worldMarksGroup);

    this.npcSystem = buildNpcPopulation(this.textures);
    this.scene.add(this.npcSystem.group);

    this.weatherSystem = new DynamicWeatherSystem(
      this.scene,
      this.renderer,
      sunLight,
      hemiLight,
      this.world.lampGlowMaterials,
      this.world.wettableMaterials,
    );

    // 6. Initial Dog Rig (loads default American Pitbull GLB directly — never spawns low-poly placeholder)
    this.dogPos.y = surfaceHeightAt(this.dogPos.x, this.dogPos.z);
    void this.setBreed(this.activeBreed, { silent: true });

    // Preload realistic 3D poop prop GLB for triggerPoop()
    new GLTFLoader().load(
      '/models/world/ready/prop_poop.glb',
      (gltf) => {
        if (this.disposed) return;
        gltf.scene.traverse((ch) => {
          if ((ch as THREE.Mesh).isMesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        this.poopProto = gltf.scene;
      },
      undefined,
      () => {},
    );

    // 7. Bind Input & Resize Listeners
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      this.audio.unlock();
      const code = e.code;
      this.keys.add(code);

      if (code === 'Space') {
        e.preventDefault();
        this.triggerJump();
      } else if (code === 'KeyB') {
        this.triggerBark();
      } else if (code === 'KeyF') {
        this.toggleSniff();
      } else if (code === 'KeyP') {
        this.triggerPee();
      } else if (code === 'KeyO') {
        this.triggerPoop();
      } else if (code === 'KeyE') {
        this.triggerInteractOrBellyRub();
      } else if (code === 'KeyR') {
        this.triggerRest();
      }
    };

    this.handleKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    this.handlePointerDown = (e: PointerEvent) => {
      if (e.target !== this.renderer.domElement) return;
      this.audio.unlock();
      this.isDraggingCam = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    };

    this.handlePointerMove = (e: PointerEvent) => {
      if (!this.isDraggingCam) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.camYaw -= dx * 0.0055;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0045, -0.08, 1.05);
    };

    this.handlePointerUp = () => {
      this.isDraggingCam = false;
    };

    this.handleWheel = (e: WheelEvent) => {
      if (e.target !== this.renderer.domElement) return;
      e.preventDefault();
      const step = Math.max(0.0012, this.camDistance * 0.00095);
      this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * step, 0.55, 12.5);
    };

    this.handleResize = () => {
      if (this.disposed) return;
      const w = this.container.clientWidth || window.innerWidth;
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    this.handleContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLostChange?.(true);
    };

    this.handleContextRestored = () => {
      this.contextLost = false;
      this.onContextLostChange?.(false);
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.emitHud();
    this.lastFrameTime = performance.now();
    this.startLoop();
  }

  // ---------------------------------------------------------------------------
  // Public API for React UI Controls & Breed Studio
  // ---------------------------------------------------------------------------
  public async setBreed(breed: DogBreedConfig, opts?: { silent?: boolean }): Promise<void> {
    const seq = ++this.breedLoadSeq;
    this.activeBreed = breed;
    let nextRig: ActiveDogRig;
    if (breed.source === 'glb' && breed.glbUrl) {
      nextRig = await buildGlbDogRig(breed, this.textures);
    } else {
      nextRig = buildProceduralDogRig(breed.proceduralType ?? 'golden', this.textures);
    }

    if (this.disposed || seq !== this.breedLoadSeq) {
      nextRig.dispose();
      return;
    }

    // Swap rig seamlessly at current world coordinates
    if (this.dogRig) {
      this.scene.remove(this.dogRig.root);
      this.dogRig.dispose();
    }

    this.dogRig = nextRig;
    this.dogRig.root.position.copy(this.dogPos);
    this.dogRig.root.rotation.y = this.dogYaw;
    this.syncEquippedRewardsToRig();
    this.scene.add(this.dogRig.root);

    if (!opts?.silent) {
      this.pushNotification(`Switched to ${breed.name}`, breed.physics.label);
      this.audio.playBark(breed.physics.barkPitch);
    }
    this.emitHud();
  }

  public updateActiveBreedSettings(breed: DogBreedConfig) {
    if (this.activeBreed.id !== breed.id) return;
    this.activeBreed = breed;
    if (this.dogRig && this.dogRig.source === 'glb') {
      if (this.dogRig.glbWrapper) {
        this.dogRig.glbWrapper.rotation.y = THREE.MathUtils.degToRad(breed.forwardRotationDeg ?? 0);
      }
      if (breed.clipMapping) {
        this.dogRig.clipMapping = { ...breed.clipMapping };
      }
    }
    this.emitHud();
  }

  public setWeather(mode: WeatherMode) {
    this.weatherSystem.setMode(mode);
    this.audio.setWeatherAmbience(mode);
    this.autoWeatherTimer = 0;
    this.emitHud();
  }

  public setAutoWeather(enabled: boolean) {
    this.autoWeather = enabled;
    this.emitHud();
  }

  public toggleMute() {
    this.audio.setMuted(!this.audio.isMuted());
    this.emitHud();
  }

  public toggleEquipReward(rewardId: SocialReward['id']) {
    const r = this.rewards.find((item) => item.id === rewardId);
    if (!r || !r.unlocked) return;
    r.equipped = !r.equipped;
    this.syncEquippedRewardsToRig();
    this.emitHud();
  }

  public teleportToLandmark(landmark: 'town' | 'pet_store' | 'park' | 'pond' | 'gazebo') {
    if (this.activeInterior) {
      this.exitStoreImmediate();
    }
    const coords: Record<typeof landmark, [number, number]> = {
      town: [-18, -14],
      pet_store: [-11.8, -24],
      park: [12, -14],
      pond: [16, 22],
      gazebo: [45, -24],
    };
    const [tx, tz] = coords[landmark];
    this.dogPos.set(tx, surfaceHeightAt(tx, tz), tz);
    this.dogVel.set(0, 0, 0);
    this.actionState = 'idle';
    this.pushNotification(
      landmark === 'pet_store' ? 'Arrived at Paws & Collars Pet Store' : `Arrived at ${getZoneName(tx, tz)}`,
    );
    this.emitHud();
  }

  public setVirtualInput(forward: number, right: number, sprint: boolean) {
    this.virtualInput.forward = forward;
    this.virtualInput.right = right;
    this.virtualInput.sprint = sprint;
  }

  // ---------------------------------------------------------------------------
  // Dog Actions (Bark, Sniff, Pee, Poop, Belly Rub, Rest, Jump)
  // ---------------------------------------------------------------------------
  public triggerJump() {
    if (!this.isGrounded) return;
    if (this.energy < 4) {
      this.pushNotification('Too tired to jump', 'Rest [R] or eat a treat to recover energy');
      return;
    }
    this.verticalVel = this.activeBreed.physics.jumpVelocity;
    this.isGrounded = false;
    this.actionState = 'jump';
    this.actionTimer = 0;
    this.energy = Math.max(0, this.energy - 3.5);
  }

  public triggerBark() {
    this.audio.playBark(this.activeBreed.physics.barkPitch);
    if (this.isGrounded) {
      this.actionState = 'bark';
      this.actionTimer = 0.65;
    }
    // Spawn subtle sound ring around head
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.28, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c2,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
    );
    ring.position.set(
      this.dogPos.x + Math.sin(this.dogYaw) * 0.5,
      this.dogPos.y + 0.65,
      this.dogPos.z + Math.cos(this.dogYaw) * 0.5,
    );
    ring.lookAt(this.camera.position);
    this.scene.add(ring);
    this.particles.push({
      mesh: ring,
      vel: new THREE.Vector3(0, 0.8, 0),
      life: 0,
      maxLife: 0.55,
    });

    // Nearby NPC smiles & calls out
    const nearestNpc = this.findNearestNpc(6.5);
    if (nearestNpc) {
      this.setSpeech(nearestNpc.name, `${nearestNpc.greetingLine}`);
    }
  }

  public toggleSniff() {
    this.sniffActive = !this.sniffActive;
    if (this.sniffActive) {
      this.audio.playSniff();
      if (this.isGrounded && this.dogVel.length() < 0.8) {
        this.actionState = 'sniff';
        this.actionTimer = 1.2;
      }
      this.pushNotification('Sniff Mode Active', 'Follow the rising golden scent trails to hidden treats');
    }
    this.emitHud();
  }

  public triggerPee() {
    if (!this.isGrounded) return;
    this.actionState = 'pee';
    this.actionTimer = 1.65;
    this.dogVel.multiplyScalar(0.15);
    this.audio.playPee();

    // Spawn wet puddle decal on ground
    const px = this.dogPos.x + Math.cos(this.dogYaw) * 0.22;
    const pz = this.dogPos.z - Math.sin(this.dogYaw) * 0.22;
    const py = surfaceHeightAt(px, pz);
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 16),
      new THREE.MeshStandardMaterial({
        color: 0xc29e2b,
        roughness: 0.12,
        metalness: 0.1,
        transparent: true,
        opacity: 0.68,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(px, py + 0.035, pz);
    this.worldMarksGroup.add(puddle);
    this.pruneOldMarks();

    this.bladder = Math.max(0, this.bladder - 55);

    // Check if marking a Fire Hydrant!
    const hydrant = this.findNearestHydrant(2.4);
    if (hydrant) {
      if (!hydrant.marked) {
        hydrant.marked = true;
        this.hydrantsMarked++;
        (hydrant.ringMesh.material as THREE.MeshBasicMaterial).opacity = 0.72;
        this.pushNotification(
          `Hydrant Territory Marked (${this.hydrantsMarked}/${this.world.hydrants.length})`,
          'Every dog in Barkshire now knows this spot is yours.',
        );
      } else {
        this.pushNotification('Refreshed Territory Scent', 'Hydrant scent mark renewed.');
      }
    } else {
      this.pushNotification('Nature Called', 'Bladder relieved!');
    }
    this.emitHud();
  }

  public triggerPoop() {
    if (!this.isGrounded) return;
    this.actionState = 'poop';
    this.actionTimer = 1.75;
    this.dogVel.multiplyScalar(0.1);
    this.audio.playPoop();

    // Spawn realistic 3D poop GLB behind the dog (falls back to sculpted coil while loading)
    const bx = this.dogPos.x - Math.sin(this.dogYaw) * 0.48;
    const bz = this.dogPos.z - Math.cos(this.dogYaw) * 0.48;
    const by = surfaceHeightAt(bx, bz);
    const poopGroup = new THREE.Group();
    poopGroup.position.set(bx, by + 0.01, bz);
    poopGroup.rotation.y = Math.random() * Math.PI * 2;
    if (this.poopProto) {
      const clonedPoop = this.poopProto.clone(true);
      poopGroup.add(clonedPoop);
    } else {
      const poopMat = new THREE.MeshStandardMaterial({ color: 0x4f331c, roughness: 0.62 });
      const tier1 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.055, 8, 14), poopMat);
      tier1.rotation.x = Math.PI / 2;
      tier1.position.y = 0.045;
      const tier2 = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.045, 8, 12), poopMat);
      tier2.rotation.x = Math.PI / 2;
      tier2.position.y = 0.11;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.09, 10), poopMat);
      tip.position.y = 0.175;
      poopGroup.add(tier1, tier2, tip);
    }
    this.worldMarksGroup.add(poopGroup);
    this.pruneOldMarks();

    // Spawn 4 little rising stink/steam wisps
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xd9e0cc, transparent: true, opacity: 0.45 }),
      );
      puff.position.set(bx + (Math.random() - 0.5) * 0.16, by + 0.25 + i * 0.08, bz + (Math.random() - 0.5) * 0.16);
      this.scene.add(puff);
      this.particles.push({
        mesh: puff,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.45 + Math.random() * 0.25, (Math.random() - 0.5) * 0.2),
        life: 0,
        maxLife: 1.5,
      });
    }

    this.bladder = Math.max(0, this.bladder - 65);
    this.hunger = Math.max(0, this.hunger - 4);

    const nearbyNpc = this.findNearestNpc(6.0);
    if (nearbyNpc) {
      this.setSpeech(nearbyNpc.name, 'Whoa there, pup! Right on the fresh grass?!');
    } else {
      this.pushNotification('Left a Little Present', 'Feeling much lighter now!');
    }
    this.emitHud();
  }

  private findNearestDoorway(maxDist: number): StoreDoorway | null {
    if (this.activeInterior) return null;
    let best: StoreDoorway | null = null;
    let bestD = maxDist;
    for (const d of this.world.doorways) {
      const dist = Math.hypot(d.position.x - this.dogPos.x, d.position.z - this.dogPos.z);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  private enterStore(door: StoreDoorway) {
    if (this.isTransitioning || this.activeInterior) return;
    this.isTransitioning = true;
    this.dogVel.set(0, 0, 0);
    this.onTransitionChange?.(true, `Entering ${door.name}...`);

    window.setTimeout(() => {
      if (this.disposed) return;
      // Save outdoor world state and hide outdoor scene completely
      this.savedOutdoorState = {
        pos: door.position.clone(),
        yaw: door.exitYaw,
        camYaw: this.camYaw,
        skyBg: this.scene.background,
        fog: this.scene.fog,
      };
      this.world.root.visible = false;
      this.worldMarksGroup.visible = false;
      this.npcSystem.group.visible = false;
      this.outdoorSunLight.visible = false;
      this.outdoorHemiLight.visible = false;
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0x161412);

      // Load dedicated interior scene
      const interior = buildStoreInterior(door.id, this.textures, this.isSoftwareGl);
      this.activeInterior = interior;
      this.scene.add(interior.root);

      this.dogPos.copy(interior.spawnPos);
      this.dogYaw = interior.spawnYaw;
      this.camYaw = 0;
      this.camDistance = Math.min(this.camDistance, 3.6);
      this.currentCamPos.set(this.dogPos.x, 2.0, this.dogPos.z + 3.0);
      this.currentLookAt.set(this.dogPos.x, 0.7, this.dogPos.z - 1.5);
      this.actionState = 'idle';
      this.pushNotification(`Welcome to ${interior.name}`, 'Explore inside, grab treats, or press E at the exit door!');
      this.emitHud();

      window.setTimeout(() => {
        if (this.disposed) return;
        this.isTransitioning = false;
        this.onTransitionChange?.(false);
      }, 220);
    }, 220);
  }

  private exitStoreImmediate() {
    if (!this.activeInterior) return;
    this.scene.remove(this.activeInterior.root);
    this.activeInterior.dispose();
    this.activeInterior = null;

    this.world.root.visible = true;
    this.worldMarksGroup.visible = true;
    this.npcSystem.group.visible = true;
    this.outdoorSunLight.visible = true;
    this.outdoorHemiLight.visible = true;
    if (this.savedOutdoorState) {
      this.scene.background = this.savedOutdoorState.skyBg;
      this.scene.fog = this.savedOutdoorState.fog;
      this.dogPos.copy(this.savedOutdoorState.pos);
      this.dogPos.y = surfaceHeightAt(this.dogPos.x, this.dogPos.z);
      this.dogYaw = this.savedOutdoorState.yaw;
      this.camYaw = this.savedOutdoorState.camYaw;
      this.savedOutdoorState = null;
    }
    this.dogVel.set(0, 0, 0);
    this.actionState = 'idle';
  }

  private exitStore() {
    if (this.isTransitioning || !this.activeInterior) return;
    this.isTransitioning = true;
    this.dogVel.set(0, 0, 0);
    this.onTransitionChange?.(true, 'Heading back to Barkshire...');

    window.setTimeout(() => {
      if (this.disposed) return;
      this.exitStoreImmediate();
      this.pushNotification('Back on Main Street', 'Explore Barkshire or visit another store!');
      this.emitHud();

      window.setTimeout(() => {
        if (this.disposed) return;
        this.isTransitioning = false;
        this.onTransitionChange?.(false);
      }, 220);
    }, 220);
  }

  public triggerInteractOrBellyRub() {
    if (!this.isGrounded || this.isTransitioning) return;

    // 1. Inside a store: check Exit Doorway first, then Indoor Shopkeeper!
    if (this.activeInterior) {
      const interior = this.activeInterior;
      if (this.dogPos.distanceTo(interior.exitPos) < 2.2) {
        this.exitStore();
        return;
      }
      const shopNpc = interior.npc;
      if (this.dogPos.distanceTo(shopNpc.position) < 3.6) {
        shopNpc.pettingTimer = 2.8;
        this.actionState = 'bellyRub';
        this.actionTimer = 2.8;
        this.dogVel.set(0, 0, 0);
        this.audio.playBellyRub();
        this.spawnHeartBurst(this.dogPos);
        if (shopNpc.petCooldown <= 0) {
          shopNpc.petCooldown = 8.0;
          this.friendlyInteractions++;
          this.energy = Math.min(100, this.energy + 18);
          this.pushNotification(`Belly Rubs from ${shopNpc.name}!`, `Friendly interactions: ${this.friendlyInteractions} · +Energy`);
        }
        this.setSpeech(shopNpc.name, shopNpc.greetingLine);
        this.emitHud();
        return;
      }
      this.actionState = 'bellyRub';
      this.actionTimer = 1.9;
      this.dogVel.multiplyScalar(0.2);
      this.emitHud();
      return;
    }

    // 2. Outdoors: check Enterable Store Doorway!
    const door = this.findNearestDoorway(2.8);
    if (door) {
      this.enterStore(door);
      return;
    }

    const npc = this.findNearestNpc(3.6);
    if (npc) {
      if (npc.petCooldown > 0) {
        this.setSpeech(npc.name, 'Haha, one more scratch behind the ears!');
        this.audio.playBellyRub();
        this.actionState = 'bellyRub';
        this.actionTimer = 2.0;
        npc.pettingTimer = 2.0;
        this.spawnHeartBurst(this.dogPos);
        return;
      }

      npc.petCooldown = 8.0;
      npc.pettingTimer = 2.8;
      this.actionState = 'bellyRub';
      this.actionTimer = 2.8;
      this.dogVel.set(0, 0, 0);
      this.audio.playBellyRub();
      this.spawnHeartBurst(this.dogPos);

      this.friendlyInteractions++;
      const recoveryBonus = this.hasEquippedReward('crown') ? 1.2 : 1.0;
      this.energy = Math.min(100, this.energy + 18 * recoveryBonus);
      this.setSpeech(npc.name, npc.greetingLine);

      // Check unlockable social rewards!
      let unlockedNew: SocialReward | null = null;
      for (const r of this.rewards) {
        if (!r.unlocked && this.friendlyInteractions >= r.requiredInteractions) {
          r.unlocked = true;
          r.equipped = true;
          unlockedNew = r;
        }
      }
      if (unlockedNew) {
        this.syncEquippedRewardsToRig();
        this.audio.playRewardUnlock();
        this.pushNotification(
          `Unlocked: ${unlockedNew.name}!`,
          `${unlockedNew.perkLabel} — Equipped automatically.`,
        );
      } else {
        this.pushNotification(
          `Belly Rubs from ${npc.name}!`,
          `Friendly interactions: ${this.friendlyInteractions} · +Energy`,
        );
      }
      this.emitHud();
      return;
    }

    // If no NPC nearby, check if near a hydrant to mark, or do a joyful solo roll!
    const hydrant = this.findNearestHydrant(2.2);
    if (hydrant) {
      this.triggerPee();
      return;
    }

    this.actionState = 'bellyRub';
    this.actionTimer = 1.9;
    this.dogVel.multiplyScalar(0.2);
    this.pushNotification('Happy Grass Roll', 'Find a townsperson to get real belly rubs & unlock rewards!');
    this.emitHud();
  }

  public triggerRest() {
    if (!this.isGrounded) return;
    if (this.actionState === 'rest') {
      this.actionState = 'idle';
      this.actionTimer = 0;
    } else {
      this.actionState = 'rest';
      this.actionTimer = 999; // Stays resting until player moves or toggles
      this.dogVel.set(0, 0, 0);
      this.pushNotification('Curled Up for a Nap', 'Energy restoring rapidly — move anytime to get up.');
    }
    this.emitHud();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------
  private hasEquippedReward(id: SocialReward['id']): boolean {
    return this.rewards.some((r) => r.id === id && r.unlocked && r.equipped);
  }

  private syncEquippedRewardsToRig() {
    const rig = this.dogRig;
    if (!rig) return;
    this.rewards.forEach((r) => {
      const obj = rig.rewardMeshes[r.id];
      if (obj) obj.visible = r.unlocked && r.equipped;
    });
  }

  private findNearestNpc(maxDist: number): NpcCharacter | null {
    let best: NpcCharacter | null = null;
    let bestD = maxDist;
    for (const npc of this.npcSystem.npcs) {
      const d = npc.position.distanceTo(this.dogPos);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  }

  private findNearestHydrant(maxDist: number) {
    let best = null;
    let bestD = maxDist;
    for (const h of this.world.hydrants) {
      const d = h.position.distanceTo(this.dogPos);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  private spawnHeartBurst(center: THREE.Vector3) {
    const heartMat = new THREE.MeshBasicMaterial({ color: 0xef5b6c, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 8; i++) {
      const h = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), heartMat.clone());
      h.scale.set(1.1, 1.25, 0.5);
      h.position.set(
        center.x + (Math.random() - 0.5) * 0.7,
        center.y + 0.7 + Math.random() * 0.3,
        center.z + (Math.random() - 0.5) * 0.7,
      );
      this.scene.add(h);
      this.particles.push({
        mesh: h,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.7, 1.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.7),
        life: 0,
        maxLife: 1.25,
      });
    }
  }

  private spawnCrumbBurst(center: THREE.Vector3) {
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.055, 0),
        new THREE.MeshStandardMaterial({ color: 0xe8b658, roughness: 0.6, transparent: true, opacity: 1 }),
      );
      c.position.set(center.x, center.y + 0.35, center.z);
      this.scene.add(c);
      this.particles.push({
        mesh: c,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.4 + Math.random() * 1.1, (Math.random() - 0.5) * 2.2),
        life: 0,
        maxLife: 0.75,
      });
    }
  }

  private pruneOldMarks() {
    while (this.worldMarksGroup.children.length > 35) {
      const oldest = this.worldMarksGroup.children[0];
      this.worldMarksGroup.remove(oldest);
    }
  }

  private setSpeech(speaker: string, text: string) {
    this.activeSpeech = { speaker, text, timer: 4.0 };
    this.emitHud();
  }

  private pushNotification(title: string, detail?: string) {
    this.notification = { id: this.notifCounter++, title, detail, timer: 3.8 };
    this.emitHud();
  }

  // ---------------------------------------------------------------------------
  // Main Simulation & Render Loop (with Software WebGL afterDraw Pacing)
  // ---------------------------------------------------------------------------
  private startLoop() {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawElapsedMs = now - this.lastFrameTime;
      // Cap frame rate at ~60 FPS to prevent high-refresh GPU ring saturation on Linux APUs
      if (!this.isSoftwareGl && this.lastFrameTime > 0 && rawElapsedMs < 15.5) {
        this.frameId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(rawElapsedMs / 1000, 0.05);
      this.lastFrameTime = now;
      this.elapsed += dt;

      if (!this.contextLost) {
        this.stepSimulation(dt);
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private stepSimulation(dt: number) {
    const phys = this.activeBreed.physics;

    // 1. Auto-cycling dynamic weather (every ~70 seconds)
    if (this.autoWeather) {
      this.autoWeatherTimer += dt;
      if (this.autoWeatherTimer > 70) {
        this.autoWeatherTimer = 0;
        const idx = WEATHER_ORDER.indexOf(this.weatherSystem.getMode());
        const next = WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];
        this.weatherSystem.setMode(next);
        this.audio.setWeatherAmbience(next);
        this.pushNotification(`Weather Shifting`, `Now entering ${next} skies in Barkshire.`);
      }
    }

    // 2. Camera keyboard rotation (Q/E)
    if (this.keys.has('KeyQ')) this.camYaw += 1.9 * dt;

    // 3. Movement input vector relative to camera
    let inFwd = this.virtualInput.forward;
    let inRight = this.virtualInput.right;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inFwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inFwd -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inRight -= 1;

    const hasMoveInput = Math.abs(inFwd) > 0.05 || Math.abs(inRight) > 0.05;

    // Interrupt rest or sniff when moving
    if (hasMoveInput && (this.actionState === 'rest' || this.actionState === 'sniff')) {
      this.actionState = 'idle';
      this.actionTimer = 0;
    }

    // Action lock timer for pee/poop/bellyRub/eat
    const lockedInAction =
      this.actionState === 'pee' ||
      this.actionState === 'poop' ||
      this.actionState === 'bellyRub' ||
      this.actionState === 'eat';

    if (this.actionTimer > 0 && this.actionState !== 'rest') {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) {
        this.actionTimer = 0;
        if (this.isGrounded) this.actionState = 'idle';
      }
    }

    // 4. Breed-specific Physics & Momentum
    const wantsSprint =
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtualInput.sprint) &&
      this.energy > 6;
    const zoomiesMult = this.hasEquippedReward('royal_collar') ? 1.15 : 1.0;
    const tiredMult = this.energy < 15 ? 0.65 : this.hunger < 15 ? 0.8 : 1.0;
    const targetMaxSpeed = (wantsSprint ? phys.sprintSpeed : phys.walkSpeed) * zoomiesMult * tiredMult;

    _camForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    _camRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();

    if (hasMoveInput && !lockedInAction) {
      _moveDir
        .set(0, 0, 0)
        .addScaledVector(_camForward, inFwd)
        .addScaledVector(_camRight, inRight);
      if (_moveDir.lengthSq() > 0.001) _moveDir.normalize();

      // Smooth turn toward movement direction + dynamic lean/bank into corners
      const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
      let yawDelta = targetYaw - this.dogYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;

      const turnStep = THREE.MathUtils.clamp(yawDelta, -phys.turnRate * dt, phys.turnRate * dt);
      this.dogYaw += turnStep;

      const desiredBank = THREE.MathUtils.clamp(-yawDelta * 0.45, -phys.bankAngle, phys.bankAngle);
      this.turnBank = THREE.MathUtils.damp(this.turnBank, desiredBank, 9, dt);

      // Breed-tuned lateral grip vs sprint drift!
      _desiredVel.set(Math.sin(this.dogYaw) * targetMaxSpeed, 0, Math.cos(this.dogYaw) * targetMaxSpeed);
      const accelBlend = 1 - Math.exp(-phys.acceleration * phys.driftGrip * dt * 0.45);
      this.dogVel.lerp(_desiredVel, accelBlend);
    } else {
      // Natural friction deceleration
      const decel = 1 - Math.exp(-phys.deceleration * dt * 0.55);
      this.dogVel.lerp(_desiredVel.set(0, 0, 0), decel);
      this.turnBank = THREE.MathUtils.damp(this.turnBank, 0, 10, dt);
    }

    // Apply horizontal motion + collision sliding (uses active interior walls when indoors!)
    this.dogPos.x += this.dogVel.x * dt;
    this.dogPos.z += this.dogVel.z * dt;
    if (this.activeInterior) {
      this.activeInterior.collision.resolvePosition(this.dogPos, phys.colliderRadius);
    } else {
      this.collision.resolvePosition(this.dogPos, phys.colliderRadius);
    }

    // Apply vertical gravity + ground snap
    const floorY = this.activeInterior ? 0 : surfaceHeightAt(this.dogPos.x, this.dogPos.z);
    if (!this.isGrounded) {
      this.verticalVel -= phys.gravity * dt;
      this.dogPos.y += this.verticalVel * dt;
      if (this.dogPos.y <= floorY) {
        this.dogPos.y = floorY;
        this.verticalVel = 0;
        this.isGrounded = true;
        if (this.actionState === 'jump') this.actionState = 'idle';
      }
    } else {
      this.dogPos.y = THREE.MathUtils.damp(this.dogPos.y, floorY, 22, dt);
    }

    const speedMs = Math.hypot(this.dogVel.x, this.dogVel.z);

    // Update locomotion action state when not locked
    if (this.isGrounded && !lockedInAction && this.actionState !== 'bark' && this.actionState !== 'rest' && this.actionState !== 'sniff') {
      if (speedMs > phys.walkSpeed * 1.18) this.actionState = 'run';
      else if (speedMs > 0.28) this.actionState = 'walk';
      else this.actionState = 'idle';
    }

    // Footstep sound feedback (pavement/indoor tile claw-clicks vs soft grass pawfalls)
    if (this.isGrounded && speedMs > 0.18) {
      const onPavement = Boolean(this.activeInterior) || isOnRoadOrPlaza(this.dogPos.x, this.dogPos.z);
      this.audio.playFootstep(speedMs / phys.sprintSpeed, onPavement, dt);
    } else {
      this.audio.playFootstep(0, false, dt);
    }

    // 5. Hunger, Energy & Bladder Need Simulation
    const capeSlowdown = this.hasEquippedReward('legend_cape') ? 0.65 : 1.0;
    const crownRegen = this.hasEquippedReward('crown') ? 1.25 : 1.0;
    if (this.actionState === 'run') {
      this.energy = Math.max(0, this.energy - phys.staminaDrain * capeSlowdown * dt);
      this.hunger = Math.max(0, this.hunger - 0.55 * capeSlowdown * dt);
    } else if (this.actionState === 'rest') {
      this.energy = Math.min(100, this.energy + 18 * crownRegen * dt);
      this.hunger = Math.max(0, this.hunger - 0.12 * dt);
    } else if (this.actionState === 'walk') {
      this.energy = Math.min(100, this.energy + 1.4 * crownRegen * dt);
      this.hunger = Math.max(0, this.hunger - 0.25 * capeSlowdown * dt);
    } else {
      this.energy = Math.min(100, this.energy + 4.2 * crownRegen * dt);
      this.hunger = Math.max(0, this.hunger - 0.14 * capeSlowdown * dt);
    }
    this.bladder = Math.min(100, this.bladder + 0.55 * dt);

    // 6. Check Hidden Treat Pickups (Indoor vs Outdoor)
    if (this.activeInterior) {
      for (const tr of this.activeInterior.treats) {
        if (tr.found) continue;
        const dist = Math.hypot(tr.position.x - this.dogPos.x, tr.position.z - this.dogPos.z);
        if (dist < 1.3) {
          tr.found = true;
          tr.group.visible = false;
          this.hunger = Math.min(100, this.hunger + tr.hungerRestore);
          this.energy = Math.min(100, this.energy + tr.energyRestore);
          this.actionState = 'eat';
          this.actionTimer = 0.8;
          this.audio.playTreatChomp();
          this.spawnCrumbBurst(tr.position);
          this.pushNotification(`Enjoyed ${tr.name}!`, `+${tr.hungerRestore}% Hunger · +${tr.energyRestore}% Energy`);
        }
      }
    } else {
      for (let i = 0; i < this.world.treats.length; i++) {
        const tr = this.world.treats[i];
        if (tr.found) continue;
        const dist = Math.hypot(tr.position.x - this.dogPos.x, tr.position.z - this.dogPos.z);
        if (dist < 1.35) {
          tr.found = true;
          tr.group.visible = false;
          this.treatsFound++;
          this.hunger = Math.min(100, this.hunger + tr.hungerRestore);
          this.energy = Math.min(100, this.energy + tr.energyRestore);
          this.bladder = Math.min(100, this.bladder + 10);
          this.actionState = 'eat';
          this.actionTimer = 0.8;
          this.audio.playTreatChomp();
          this.spawnCrumbBurst(tr.position);
          this.pushNotification(
            `Found ${tr.name}! (${this.treatsFound}/${this.world.treats.length})`,
            `+${tr.hungerRestore}% Hunger · +${tr.energyRestore}% Energy`,
          );
        }
      }
    }

    // 7. Update Dog Transform & Animation
    if (this.dogRig) {
      this.dogRig.root.position.copy(this.dogPos);
      this.dogRig.root.rotation.y = this.dogYaw;
      updateDogRigAnimation(
        this.dogRig,
        this.actionState,
        speedMs,
        phys.sprintSpeed,
        this.turnBank,
        phys.strideFrequency,
        this.actionTimer,
        this.elapsed,
        dt,
      );
    }

    // 8. Update Active Interior OR Outdoor World, NPCs & Weather
    if (this.activeInterior) {
      this.activeInterior.update(this.elapsed, dt, this.dogPos);
    } else {
      const scentRadius = this.hasEquippedReward('legend_cape')
        ? 95
        : this.hasEquippedReward('bandana')
          ? 46
          : 34;
      this.world.update(this.elapsed, dt, this.sniffActive, scentRadius, this.dogPos);
      this.npcSystem.update(this.elapsed, dt, this.dogPos);
      this.weatherSystem.update(this.elapsed, dt, this.dogPos);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        this.scene.remove(pt.mesh);
        pt.mesh.geometry.dispose();
        if (Array.isArray(pt.mesh.material)) pt.mesh.material.forEach((m) => m.dispose());
        else pt.mesh.material.dispose();
        this.particles.splice(i, 1);
      } else {
        pt.mesh.position.addScaledVector(pt.vel, dt);
        const alpha = 1 - pt.life / pt.maxLife;
        const mat = pt.mesh.material as THREE.MeshBasicMaterial;
        if ('opacity' in mat) mat.opacity = alpha * 0.9;
        pt.mesh.scale.multiplyScalar(1 + dt * 0.65);
      }
    }

    // 9. Smooth Third-Person Chase Camera with Close-Up Framing & Indoor Room Clamping
    const effectiveCamDist = this.activeInterior ? Math.min(this.camDistance, 4.4) : this.camDistance;
    const dogFocusY = Math.max(0.22, this.activeBreed.physics.targetHeight * 0.65);
    const zoomLift = THREE.MathUtils.clamp((effectiveCamDist - 0.8) * 0.2, 0.04, 0.95);
    const horizDist = Math.cos(this.camPitch) * effectiveCamDist;
    const vertDist = Math.sin(this.camPitch) * effectiveCamDist + dogFocusY + zoomLift;
    _camGoalPos.set(
      this.dogPos.x + Math.sin(this.camYaw) * horizDist,
      this.dogPos.y + vertDist,
      this.dogPos.z + Math.cos(this.camYaw) * horizDist,
    );
    if (this.activeInterior) {
      const margin = 0.45;
      _camGoalPos.x = THREE.MathUtils.clamp(
        _camGoalPos.x,
        -this.activeInterior.roomHalfW + margin,
        this.activeInterior.roomHalfW - margin,
      );
      _camGoalPos.z = THREE.MathUtils.clamp(
        _camGoalPos.z,
        -this.activeInterior.roomHalfD + margin,
        this.activeInterior.roomHalfD - margin,
      );
      _camGoalPos.y = THREE.MathUtils.clamp(_camGoalPos.y, 0.25, this.activeInterior.roomHeight - 0.45);
    } else {
      const minCamClearance = THREE.MathUtils.clamp(effectiveCamDist * 0.14, 0.12, 0.55);
      const camFloor = surfaceHeightAt(_camGoalPos.x, _camGoalPos.z) + minCamClearance;
      if (_camGoalPos.y < camFloor) _camGoalPos.y = camFloor;
    }

    const camLambda = 8.5;
    this.currentCamPos.x = THREE.MathUtils.damp(this.currentCamPos.x, _camGoalPos.x, camLambda, dt);
    this.currentCamPos.y = THREE.MathUtils.damp(this.currentCamPos.y, _camGoalPos.y, camLambda, dt);
    this.currentCamPos.z = THREE.MathUtils.damp(this.currentCamPos.z, _camGoalPos.z, camLambda, dt);

    _camLookTarget.set(this.dogPos.x, this.dogPos.y + dogFocusY, this.dogPos.z);
    this.currentLookAt.x = THREE.MathUtils.damp(this.currentLookAt.x, _camLookTarget.x, 12, dt);
    this.currentLookAt.y = THREE.MathUtils.damp(this.currentLookAt.y, _camLookTarget.y, 12, dt);
    this.currentLookAt.z = THREE.MathUtils.damp(this.currentLookAt.z, _camLookTarget.z, 12, dt);

    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentLookAt);

    // Subtle sprint FOV expansion for speed sensation
    const targetFov = 56 + THREE.MathUtils.clamp((speedMs - 4) * 1.4, 0, 9);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    // 10. Timers for Speech & Notifications + Throttled HUD Sync (8 Hz)
    if (this.activeSpeech) {
      this.activeSpeech.timer -= dt;
      if (this.activeSpeech.timer <= 0) this.activeSpeech = null;
    }
    if (this.notification) {
      this.notification.timer -= dt;
      if (this.notification.timer <= 0) this.notification = null;
    }

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.12) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }
  }

  private computeNearbyPrompt(): NearbyPrompt | null {
    if (this.activeInterior) {
      if (this.dogPos.distanceTo(this.activeInterior.exitPos) < 2.2) {
        return {
          key: 'E',
          label: 'Exit to Main Street',
          sublabel: `Leave ${this.activeInterior.name}`,
          action: 'exit_store',
        };
      }
      if (this.dogPos.distanceTo(this.activeInterior.npc.position) < 3.6) {
        return {
          key: 'E',
          label: `Get Belly Rubs from ${this.activeInterior.npc.name}`,
          sublabel: this.activeInterior.npc.role,
          action: 'pet',
        };
      }
      return null;
    }

    const door = this.findNearestDoorway(2.8);
    if (door) {
      return {
        key: 'E',
        label: `Enter ${door.name}`,
        sublabel: door.subtitle,
        action: 'enter_store',
      };
    }

    const npc = this.findNearestNpc(3.6);
    if (npc) {
      return {
        key: 'E',
        label: `Get Belly Rubs from ${npc.name}`,
        sublabel: npc.role,
        action: 'pet',
      };
    }
    const hydrant = this.findNearestHydrant(2.4);
    if (hydrant) {
      return {
        key: 'P',
        label: hydrant.marked ? 'Refresh Hydrant Scent' : 'Mark Fire Hydrant',
        sublabel: 'Territory spot',
        action: 'pee_mark',
      };
    }
    return null;
  }

  private emitHud() {
    this.onHudUpdate({
      zoneName: this.activeInterior ? this.activeInterior.name : getZoneName(this.dogPos.x, this.dogPos.z),
      breedName: this.activeBreed.name,
      breedId: this.activeBreed.id,
      actionState: this.actionState,
      speedMs: Math.hypot(this.dogVel.x, this.dogVel.z),
      hunger: Math.round(this.hunger),
      energy: Math.round(this.energy),
      bladder: Math.round(this.bladder),
      treatsFound: this.treatsFound,
      treatsTotal: this.world.treats.length,
      friendlyInteractions: this.friendlyInteractions,
      hydrantsMarked: this.hydrantsMarked,
      totalHydrants: this.world.hydrants.length,
      sniffActive: this.sniffActive,
      weather: this.weatherSystem.getMode(),
      autoWeather: this.autoWeather,
      muted: this.audio.isMuted(),
      nearbyPrompt: this.computeNearbyPrompt(),
      activeSpeech: this.activeSpeech
        ? { speaker: this.activeSpeech.speaker, text: this.activeSpeech.text }
        : null,
      notification: this.notification
        ? {
            id: this.notification.id,
            title: this.notification.title,
            detail: this.notification.detail,
          }
        : null,
      rewards: this.rewards.map((r) => ({ ...r })),
      lowHungerWarning: this.hunger < 26,
      lowEnergyWarning: this.energy < 24,
      needsReliefWarning: this.bladder > 78,
      fpsMode: this.isSoftwareGl ? 'software' : 'gpu',
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.activeInterior?.dispose();
    this.dogRig?.dispose();
    this.world.dispose();
    this.npcSystem.dispose();
    this.weatherSystem.dispose();
    this.textures.dispose();
    this.audio.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
