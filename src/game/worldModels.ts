import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CollisionWorld,
  groundHeightAt,
  isInPond,
  isOnRoadOrPlaza,
  WORLD_PLAYABLE_RADIUS,
} from './terrain';

/**
 * Streams the hand-authored GLB set in /public/models/world into the Barkshire
 * worldspace: storefront blocks, a supermarket, a vet campus, a grandma-house
 * diorama, a scanned nature chunk, oak/fir groves, an animated tree and a pile
 * of flowers, lupines and grass clumps.
 *
 * Loading is progressive (2 concurrent requests, background scenes strictly one
 * at a time) so the procedural world stays interactive while the models stream
 * in. Every placement is grounded on the terrain, auto-scaled from its real GLB
 * bounding box, and (optionally) registers a collider with the world.
 */

export interface WorldModelStats {
  total: number;
  loaded: number;
  failed: number;
  skipped: number;
  pending: number;
}

interface PropSpec {
  /** GLB file inside /models/world */
  file: string;
  x: number;
  z: number;
  /** Explicit uniform scale (native GLB units -> metres) */
  scale?: number;
  /** Or: fit the widest horizontal dimension to this many metres */
  fitWidth?: number;
  /** Or: fit the model height to this many metres */
  fitHeight?: number;
  /** Yaw in radians */
  yaw?: number;
  /** Vertical offset applied after grounding (negative sinks into terrain) */
  yOffset?: number;
  /** Register a solid collider so the dog cannot walk through the model */
  collider?: { width: number; depth: number } | { radius: number };
  /** Disable shadow casting/receiving (used by giant backdrop scenes) */
  shadows?: boolean;
  /** Add the loaded scene directly instead of cloning it (one-off backdrops) */
  single?: boolean;
  /** Merge static meshes per material to collapse thousands of draw calls */
  compact?: boolean;
  /** Anchor the model on this named child (e.g. a tree trunk) instead of its bbox centre */
  pivotNode?: string;
  /** Only stream in once the foreground props are finished (skipped on weak GPUs) */
  background?: boolean;
}

export interface BuiltWorldModels {
  group: THREE.Group;
  update: (dt: number) => void;
  dispose: () => void;
  stats: () => WorldModelStats;
}

const WORLD_MODEL_DIR = '/models/world';

// ---------------------------------------------------------------------------
// 1. Landmark placements (buildings, dioramas, whole scenes)
// ---------------------------------------------------------------------------
const LANDMARK_PROPS: PropSpec[] = [
  // --- Town: supermarket on the west lane, facing Main Street ---------------
  {
    file: 'super_market_for_free.glb',
    x: -64,
    z: 36,
    scale: 0.9,
    yaw: Math.PI / 2,
    collider: { width: 17, depth: 26 },
    compact: true,
  },
  // --- Town: Grandma's House diorama in the south meadow --------------------
  {
    file: 'dae_diorama_-_grandmas_house.glb',
    x: 7,
    z: 54,
    fitWidth: 24,
    yaw: -0.7,
    yOffset: 0.04,
    collider: { radius: 4.6 },
    compact: true,
  },
  // --- Park: Yangmingshan nature-park terrain chunk on the east ridge -------
  {
    file: 'taiwan_yangmingshan_-_datun_nature_park.glb',
    x: 64,
    z: 52,
    fitWidth: 24,
    yaw: 0.6,
    yOffset: -0.12,
  },
  // --- Park: plant pack garden beds ----------------------------------------
  {
    file: 'valars_plant_pack_2.glb',
    x: 22,
    z: 36,
    fitWidth: 13,
    yaw: 0.4,
    compact: true,
  },
  {
    file: 'valars_plant_pack_2.glb',
    x: 44,
    z: 34,
    fitWidth: 12,
    yaw: 2.1,
    compact: true,
  },
  // --- Town: produce crates outside the grocer & supermarket ---------------
  {
    file: 'game_ready_fruit_asset_pack.glb',
    x: -11.8,
    z: 24.2,
    fitHeight: 1.1,
    yaw: 0.2,
    compact: true,
  },
  {
    file: 'game_ready_fruit_asset_pack.glb',
    x: -53.4,
    z: 30,
    fitHeight: 1.3,
    yaw: 0.9,
    compact: true,
  },
  // --- Town: treat bags outside the pet shop & supermarket -----------------
  {
    file: 'doggy_treats_game_ready_prop.glb',
    x: -13,
    z: -53,
    fitHeight: 0.6,
    yaw: 0.5,
  },
  {
    file: 'doggy_treats_game_ready_prop.glb',
    x: -52.4,
    z: 34.5,
    fitHeight: 0.7,
    yaw: -0.4,
  },
  // --- Park: novelty poop prank props --------------------------------------
  {
    file: 'fake_dog_poop_prank.glb',
    x: 21,
    z: 6,
    fitHeight: 0.2,
    yaw: 0.6,
  },
  {
    file: 'fake_dog_poop_prank.glb',
    x: -12.6,
    z: 12.5,
    fitHeight: 0.17,
    yaw: 2.2,
  },
  // --- Tree groves ---------------------------------------------------------
  {
    file: 'oak_trees.glb',
    x: 66,
    z: -46,
    fitWidth: 22,
    yaw: 0.3,
    compact: true,
  },
  {
    file: 'oak_trees.glb',
    x: 8,
    z: 66,
    fitWidth: 20,
    yaw: 1.15,
    compact: true,
  },
  {
    file: 'oak_trees.glb',
    x: -38,
    z: 62,
    fitWidth: 22,
    yaw: 2.2,
    compact: true,
  },
  {
    file: 'realistic_fir_trees_pack_lods_gameready.glb',
    x: 74,
    z: 20,
    fitWidth: 46,
    yaw: -0.6,
  },
  {
    file: 'realistic_fir_trees_pack_lods_gameready.glb',
    x: -26,
    z: 72,
    fitWidth: 44,
    yaw: 0.2,
  },
  {
    file: 'fantasyassets_-_vol3_trees_and_bushes.glb',
    x: 56,
    z: 52,
    fitWidth: 24,
    yaw: 0.9,
    compact: true,
  },
  {
    file: 'fantasyassets_-_vol3_trees_and_bushes.glb',
    x: 2,
    z: -46,
    fitWidth: 24,
    yaw: 2.4,
    compact: true,
  },
  // --- Animated (morph-baked) tree, ticked by the mixer in update() -------
  {
    file: 'tree_animate.glb',
    x: 6,
    z: 18,
    fitHeight: 8,
    yaw: 0.2,
    pivotNode: 'Bark_9_2',
    compact: true,
  },
  {
    file: 'tree_animate.glb',
    x: 46,
    z: -8,
    fitHeight: 8.5,
    yaw: 1.7,
    pivotNode: 'Bark_9_2',
    compact: true,
  },
  {
    file: 'tree_animate.glb',
    x: 60,
    z: 38,
    fitHeight: 8,
    yaw: 2.2,
    pivotNode: 'Bark_9_2',
    compact: true,
  },
];

// ---------------------------------------------------------------------------
// 2. Whole-scene backdrops (beyond the playable rim, seen over the forest)
//    Streamed last and skipped entirely on software GL / low-memory devices.
// ---------------------------------------------------------------------------
const BACKDROP_PROPS: PropSpec[] = [
  {
    file: 'city_street_3.glb',
    x: -102,
    z: -56,
    scale: 1.2,
    yaw: -1.05,
    shadows: false,
    background: true,
    single: true,
    compact: true,
  },
  {
    file: 'neighbourhood_city_modular_lowpoly.glb',
    x: 4,
    z: -112,
    scale: 1.2,
    yaw: Math.PI,
    shadows: false,
    background: true,
    single: true,
    compact: true,
  },
  {
    file: 'westside_vet_hospital.glb',
    x: -94,
    z: 60,
    scale: 0.3,
    yaw: 2.4,
    shadows: false,
    background: true,
    single: true,
  },
  {
    file: 'old_city.glb',
    x: 100,
    z: 62,
    scale: 0.001,
    yaw: -2.2,
    shadows: false,
    background: true,
    single: true,
  },
];

// ---------------------------------------------------------------------------
// 3. Scatter helpers (flowers, lupines, grass clumps)
// ---------------------------------------------------------------------------
function collidesWithExisting(
  x: number,
  z: number,
  pad: number,
  collision: CollisionWorld,
): boolean {
  const colliders = collision.colliders;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.radius + pad) * (c.radius + pad)) return true;
    } else if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) {
      return true;
    }
  }
  return false;
}

function scatterPlants(
  file: string,
  count: number,
  seed: number,
  opts: {
    fitHeight?: number;
    fitWidth?: number;
    minRadius?: number;
    maxRadius?: number;
    minGap?: number;
  },
  collision: CollisionWorld,
  reserved: ReadonlyArray<{ x: number; z: number; radius: number }>,
): PropSpec[] {
  const out: PropSpec[] = [];
  const placed: [number, number][] = [];
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const minRadius = opts.minRadius ?? 12;
  const maxRadius = opts.maxRadius ?? WORLD_PLAYABLE_RADIUS - 6;
  const minGap = opts.minGap ?? 4;
  let guard = 0;

  while (out.length < count && guard++ < count * 80) {
    const angle = rand() * Math.PI * 2;
    const radius = minRadius + rand() * Math.max(1, maxRadius - minRadius);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (isOnRoadOrPlaza(x, z)) continue;
    if (isInPond(x, z, 2.4)) continue;
    if (collidesWithExisting(x, z, 1.6, collision)) continue;
    if (reserved.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius)) continue;
    if (placed.some(([px, pz]) => Math.hypot(x - px, z - pz) < minGap)) continue;

    placed.push([x, z]);
    out.push({
      file,
      x,
      z,
      fitHeight: opts.fitHeight,
      fitWidth: opts.fitWidth,
      yaw: rand() * Math.PI * 2,
      shadows: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Model compaction: merge static meshes per material to save draw calls
// ---------------------------------------------------------------------------
export function compactStaticMeshes(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

  interface Batch {
    material: THREE.Material;
    entries: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry }[];
  }
  const batches = new Map<string, Batch>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(mesh.material)) return;
    if (!mesh.geometry) return;
    if (mesh.geometry.morphAttributes && Object.keys(mesh.geometry.morphAttributes).length > 0) {
      return;
    }

    const source = mesh.geometry;
    const geo = source.clone();
    const localMatrix = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    geo.applyMatrix4(localMatrix);

    // Drop exotic attributes but preserve the ones materials actually consume.
    const hasUv1 = Boolean(geo.getAttribute('uv1'));
    const hasColor = Boolean(geo.getAttribute('color'));
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv', 'uv1', 'color'].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (!geo.getAttribute('uv')) {
      const count = geo.getAttribute('position').count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }

    const indexed = Boolean(geo.index);
    const key = `${(mesh.material as THREE.Material).uuid}|${indexed ? 'idx' : 'raw'}|${
      hasUv1 ? 'uv1' : 'no-uv1'
    }|${hasColor ? 'col' : 'no-col'}`;
    const batch = batches.get(key);
    if (batch) batch.entries.push({ mesh, geometry: geo });
    else batches.set(key, { material: mesh.material as THREE.Material, entries: [{ mesh, geometry: geo }] });
  });

  batches.forEach(({ material, entries }) => {
    if (entries.length < 2) {
      entries.forEach((entry) => entry.geometry.dispose());
      return;
    }

    const merged = mergeGeometries(
      entries.map((entry) => entry.geometry),
      false,
    );

    if (!merged) {
      // Keep the untouched originals rather than dropping part of the model.
      entries.forEach((entry) => entry.geometry.dispose());
      console.warn('[WorldModels] Could not merge a material batch; keeping originals.');
      return;
    }

    entries.forEach((entry) => {
      entry.mesh.parent?.remove(entry.mesh);
      entry.geometry.dispose();
    });
    merged.computeBoundingSphere();
    root.add(new THREE.Mesh(merged, material));
  });
}

// ---------------------------------------------------------------------------
// Legacy material fallback: three no longer ships the
// KHR_materials_pbrSpecularGlossiness plugin, so two of the Sketchfab exports
// would otherwise render as untextured white meshes. Rebuild their standard
// materials from the raw glTF definition instead.
// ---------------------------------------------------------------------------
export interface GltfWithParser {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  parser?: {
    json: { materials?: Array<Record<string, unknown>> };
    associations: Map<object, { materials?: number }>;
    getDependency: (type: string, index: number) => Promise<unknown>;
  };
}

interface SpecGlossExt {
  diffuseFactor?: [number, number, number, number];
  diffuseTexture?: { index: number; texCoord?: number };
  glossinessFactor?: number;
}

export async function applyLegacyMaterialFallback(gltf: GltfWithParser): Promise<void> {
  const parser = gltf.parser;
  if (!parser) return;

  const materials = new Set<THREE.Material>();
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((mat) => {
      if (mat) materials.add(mat);
    });
  });

  await Promise.all(
    Array.from(materials).map(async (mat) => {
      const index = parser.associations.get(mat)?.materials;
      if (index === undefined) return;
      const raw = parser.json.materials?.[index] as
        | { extensions?: Record<string, SpecGlossExt> }
        | undefined;
      const ext = raw?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!ext) return;

      const std = mat as THREE.MeshStandardMaterial;
      const diffuse = ext.diffuseFactor;
      if (diffuse) {
        std.color.setRGB(diffuse[0], diffuse[1], diffuse[2], THREE.LinearSRGBColorSpace);
        std.opacity = diffuse[3];
      }
      std.metalness = 0;
      std.roughness = 1 - Math.min(1, Math.max(0, ext.glossinessFactor ?? 1));

      if (ext.diffuseTexture && ext.diffuseTexture.index !== undefined) {
        const tex = (await parser.getDependency('texture', ext.diffuseTexture.index)) as THREE.Texture;
        tex.colorSpace = THREE.SRGBColorSpace;
        if (ext.diffuseTexture.texCoord !== undefined) tex.channel = ext.diffuseTexture.texCoord;
        tex.needsUpdate = true;
        std.map = tex;
      }
      std.needsUpdate = true;
    }),
  );
}

// ---------------------------------------------------------------------------
// 5. Streaming manager
// ---------------------------------------------------------------------------
export function buildWorldModels(
  collision: CollisionWorld,
  isSoftwareGl: boolean,
  onMaterial?: (material: THREE.MeshStandardMaterial) => void,
): BuiltWorldModels {
  const group = new THREE.Group();
  group.name = 'worldGlbModels';

  const loader = new GLTFLoader();
  const assetCache = new Map<
    string,
    Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>
  >();
  const mixers: THREE.AnimationMixer[] = [];
  const instances: THREE.Object3D[] = [];

  const specs: PropSpec[] = [...LANDMARK_PROPS];

  // Keep the flower/grass scatter clear of the big landmark footprints
  const reservedZones = LANDMARK_PROPS.filter((spec) => spec.fitWidth || spec.collider).map(
    (spec) => {
      let radius = 6;
      if (spec.collider) {
        radius =
          'radius' in spec.collider
            ? spec.collider.radius
            : Math.hypot(spec.collider.width, spec.collider.depth) * 0.5;
      } else if (spec.fitWidth) {
        radius = spec.fitWidth * 0.55;
      }
      return { x: spec.x, z: spec.z, radius: radius + 2 };
    },
  );

  // Flowers, lupines and grass clumps sprinkled across the park & meadows
  specs.push(
    ...scatterPlants(
      'flowersrose_and_sunflower.glb',
      9,
      9137,
      { fitHeight: 0.8, minRadius: 10, maxRadius: WORLD_PLAYABLE_RADIUS - 8, minGap: 5 },
      collision,
      reservedZones,
    ),
    ...scatterPlants(
      'realistic_hd_yellow_bush_lupine_1525.glb',
      7,
      5521,
      { fitHeight: 1.0, minRadius: 12, maxRadius: WORLD_PLAYABLE_RADIUS - 8, minGap: 6 },
      collision,
      reservedZones,
    ),
    ...scatterPlants(
      'grass_claster__downoad__like_please.glb',
      16,
      7734,
      { fitWidth: 3.2, minRadius: 10, maxRadius: WORLD_PLAYABLE_RADIUS - 8, minGap: 5 },
      collision,
      reservedZones,
    ),
  );

  const queue: PropSpec[] = [...specs];

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowMemoryDevice =
    typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 4;
  const skipBackdrops = isSoftwareGl || lowMemoryDevice;
  const skipped = skipBackdrops ? BACKDROP_PROPS.length : 0;
  const total = specs.length + BACKDROP_PROPS.length;

  let loaded = 0;
  let failed = 0;
  let active = 0;
  let activeBackground = 0;
  let disposed = false;
  let backgroundTimer: number | undefined;

  const loadAsset = (file: string) => {
    const url = `${WORLD_MODEL_DIR}/${file}`;
    let promise = assetCache.get(url);
    if (!promise) {
      const started = performance.now();
      promise = new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            void applyLegacyMaterialFallback(gltf as unknown as GltfWithParser)
              .catch((err) => {
                console.warn(`[WorldModels] Legacy material fallback failed for ${file}:`, err);
              })
              .then(() => {
                console.info(
                  `[WorldModels] Loaded ${file} in ${Math.round(performance.now() - started)}ms`,
                );
                resolve({ scene: gltf.scene, animations: gltf.animations });
              });
          },
          undefined,
          (err) => reject(err),
        );
      });
      assetCache.set(url, promise);
    }
    return promise;
  };

  const addInstance = (
    asset: { scene: THREE.Group; animations: THREE.AnimationClip[] },
    spec: PropSpec,
  ) => {
    const model = spec.single ? asset.scene : SkeletonUtils.clone(asset.scene);
    model.updateMatrixWorld(true);

    // Optional pivot (e.g. a tree trunk) measured before compaction drops meshes
    let pivotX = 0;
    let pivotZ = 0;
    let pivotMinY: number | null = null;
    if (spec.pivotNode) {
      const pivotObject = model.getObjectByName(spec.pivotNode);
      if (pivotObject) {
        const pivotBox = new THREE.Box3().setFromObject(pivotObject);
        if (!pivotBox.isEmpty()) {
          const pivotCenter = new THREE.Vector3();
          pivotBox.getCenter(pivotCenter);
          pivotX = pivotCenter.x;
          pivotZ = pivotCenter.z;
          pivotMinY = pivotBox.min.y;
        }
      }
    }

    if (spec.compact) compactStaticMeshes(model);

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    let scale = spec.scale ?? 1;
    if (spec.fitWidth) scale = spec.fitWidth / Math.max(size.x, size.z, 0.001);
    if (spec.fitHeight) scale = spec.fitHeight / Math.max(size.y, 0.001);

    const holder = new THREE.Group();
    holder.name = `glb:${spec.file}`;
    holder.position.set(spec.x, groundHeightAt(spec.x, spec.z) + (spec.yOffset ?? 0), spec.z);
    holder.rotation.y = spec.yaw ?? 0;

    // Keep any authored root offset, then centre the model on the holder and
    // plant its lowest point on y = 0 (the holder already sits on the ground).
    const baseX = model.position.x;
    const baseY = model.position.y;
    const baseZ = model.position.z;
    model.scale.multiplyScalar(scale);
    const sx = model.scale.x;
    const sy = model.scale.y;
    const sz = model.scale.z;
    const anchorX = pivotMinY !== null ? pivotX : center.x;
    const anchorZ = pivotMinY !== null ? pivotZ : center.z;
    const anchorMinY = pivotMinY !== null ? pivotMinY : box.min.y;
    model.position.set(
      baseX - anchorX * sx,
      baseY - anchorMinY * sy,
      baseZ - anchorZ * sz,
    );

    const reportedMaterials = new Set<THREE.Material>();
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (spec.shadows !== false) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      } else {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }

      // Let the weather system pick up the streamed surfaces (skip distant backdrops)
      if (onMaterial && !spec.background) {
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        list.forEach((mat) => {
          if (!mat || reportedMaterials.has(mat)) return;
          const std = mat as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial) return;
          reportedMaterials.add(mat);
          onMaterial(std);
        });
      }
    });

    holder.add(model);
    group.add(holder);
    instances.push(holder);

    if (asset.animations.length > 0 && !spec.single) {
      const mixer = new THREE.AnimationMixer(model);
      asset.animations.forEach((clip) => mixer.clipAction(clip).play());
      mixer.update(Math.random() * 3);
      mixers.push(mixer);
    }

    if (spec.collider) {
      if ('radius' in spec.collider) {
        collision.addCircle(spec.x, spec.z, spec.collider.radius);
      } else {
        collision.addBox(spec.x, spec.z, spec.collider.width, spec.collider.depth);
      }
    }
  };

  const pump = () => {
    if (disposed) return;
    for (let i = 0; i < queue.length; i++) {
      if (active >= 2) break;
      const spec = queue[i];
      if (spec.background && activeBackground >= 1) continue;

      queue.splice(i, 1);
      i -= 1;
      active += 1;
      if (spec.background) activeBackground += 1;

      loadAsset(spec.file)
        .then((asset) => {
          if (disposed) return;
          addInstance(asset, spec);
          loaded += 1;
        })
        .catch((err) => {
          if (disposed) return;
          failed += 1;
          console.warn(`[WorldModels] Failed to load ${spec.file}:`, err);
        })
        .finally(() => {
          active -= 1;
          if (spec.background) activeBackground -= 1;
          if (!disposed && queue.length === 0 && active === 0) {
            console.info(
              `[WorldModels] Streamed ${loaded}/${total} world models` +
                (failed ? ` (${failed} failed, ${skipped} skipped)` : ''),
            );
          }
          pump();
        });
    }
  };

  pump();

  // Backdrops are pushed after the foreground props so the playable set appears
  // first; they are also skipped entirely on software/limited GPUs.
  if (!skipBackdrops) {
    backgroundTimer = window.setTimeout(() => {
      if (disposed) return;
      queue.push(...BACKDROP_PROPS);
      pump();
    }, 6000);
  }

  const update = (dt: number) => {
    for (let i = 0; i < mixers.length; i++) mixers[i].update(dt);
  };

  const stats = (): WorldModelStats => ({
    total,
    loaded,
    failed,
    skipped,
    pending: queue.length + active,
  });

  const dispose = () => {
    disposed = true;
    if (backgroundTimer !== undefined) window.clearTimeout(backgroundTimer);

    mixers.forEach((mixer) => mixer.stopAllAction());
    mixers.length = 0;

    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const texes = new Set<THREE.Texture>();

    instances.forEach((inst) => {
      inst.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.geometry) geos.add(mesh.geometry);
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        list.forEach((mat) => {
          if (!mat) return;
          mats.add(mat);
          const anyMat = mat as THREE.MeshStandardMaterial;
          [
            anyMat.map,
            anyMat.normalMap,
            anyMat.roughnessMap,
            anyMat.metalnessMap,
            anyMat.aoMap,
            anyMat.emissiveMap,
            anyMat.alphaMap,
            anyMat.bumpMap,
            anyMat.displacementMap,
          ].forEach((tex) => {
            if (tex) texes.add(tex);
          });
        });
      });
    });

    texes.forEach((tex) => tex.dispose());
    mats.forEach((mat) => mat.dispose());
    geos.forEach((geo) => geo.dispose());

    group.removeFromParent();
    instances.length = 0;
  };

  return { group, update, dispose, stats };
}


