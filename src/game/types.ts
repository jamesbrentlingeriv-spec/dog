export type WeatherMode = 'sunny' | 'sunset' | 'rain' | 'autumn';

export type DogActionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'bark'
  | 'sniff'
  | 'pee'
  | 'poop'
  | 'bellyRub'
  | 'rest'
  | 'eat';

export type PhysicsPresetId = 'agile_small' | 'balanced_medium' | 'athletic_large' | 'gentle_heavy';

export interface BreedPhysicsProfile {
  presetId: PhysicsPresetId;
  label: string;
  walkSpeed: number; // m/s
  sprintSpeed: number; // m/s
  acceleration: number; // m/s^2
  deceleration: number; // m/s^2
  turnRate: number; // rad/s
  driftGrip: number; // 0.5..1.0 higher = tighter cornering
  jumpVelocity: number; // m/s
  gravity: number; // m/s^2
  bankAngle: number; // lean into turns (rad)
  strideFrequency: number;
  staminaDrain: number; // energy drain/sec while sprinting
  barkPitch: number; // Hz multiplier
  colliderRadius: number;
  targetHeight: number; // visual normalization height in meters
}

export interface GlbAnimationMapping {
  idle: string;
  walk: string;
  run: string;
  jump: string;
  action: string;
  bellyRub: string;
  bark?: string;
  sniff?: string;
  pee?: string;
  poop?: string;
  eat?: string;
}

export interface DogBreedConfig {
  id: string;
  name: string;
  subtitle: string;
  source: 'procedural' | 'glb';
  proceduralType?: 'golden' | 'corgi' | 'husky' | 'dachshund';
  physics: BreedPhysicsProfile;
  // Custom GLB fields
  glbUrl?: string;
  fileName?: string;
  availableClips?: string[];
  clipMapping?: GlbAnimationMapping;
  forwardRotationDeg?: number; // 0, 90, 180, 270
  scaleMultiplier?: number;
}

export interface SocialReward {
  id: 'bandana' | 'crown' | 'royal_collar' | 'legend_cape';
  name: string;
  description: string;
  perkLabel: string;
  requiredInteractions: number;
  unlocked: boolean;
  equipped: boolean;
}

export interface NearbyPrompt {
  key: string;
  label: string;
  sublabel?: string;
  action: 'pet' | 'pee_mark' | 'eat_treat';
}

export interface SpeechBubbleData {
  id: string;
  speaker: string;
  text: string;
  screenX: number;
  screenY: number;
  visible: boolean;
}

export interface GameHudSnapshot {
  zoneName: string;
  breedName: string;
  breedId: string;
  actionState: DogActionState;
  speedMs: number;
  hunger: number; // 0..100 (low = hungry)
  energy: number; // 0..100 (low = tired)
  bladder: number; // 0..100 (high = needs to pee/poop)
  treatsFound: number;
  treatsTotal: number;
  friendlyInteractions: number;
  hydrantsMarked: number;
  totalHydrants: number;
  sniffActive: boolean;
  weather: WeatherMode;
  autoWeather: boolean;
  muted: boolean;
  nearbyPrompt: NearbyPrompt | null;
  activeSpeech: { speaker: string; text: string } | null;
  notification: { id: number; title: string; detail?: string } | null;
  rewards: SocialReward[];
  lowHungerWarning: boolean;
  lowEnergyWarning: boolean;
  needsReliefWarning: boolean;
  fpsMode: 'gpu' | 'software';
}

export const PHYSICS_PRESETS: Record<PhysicsPresetId, BreedPhysicsProfile> = {
  agile_small: {
    presetId: 'agile_small',
    label: 'Small & Agile',
    walkSpeed: 3.4,
    sprintSpeed: 7.4,
    acceleration: 24,
    deceleration: 22,
    turnRate: 8.5,
    driftGrip: 0.94,
    jumpVelocity: 6.2,
    gravity: 19,
    bankAngle: 0.24,
    strideFrequency: 14.5,
    staminaDrain: 6.5,
    barkPitch: 1.55,
    colliderRadius: 0.36,
    targetHeight: 0.56,
  },
  balanced_medium: {
    presetId: 'balanced_medium',
    label: 'Medium & Balanced',
    walkSpeed: 4.1,
    sprintSpeed: 9.2,
    acceleration: 20,
    deceleration: 17,
    turnRate: 6.6,
    driftGrip: 0.86,
    jumpVelocity: 7.0,
    gravity: 18.5,
    bankAngle: 0.2,
    strideFrequency: 11.2,
    staminaDrain: 5.5,
    barkPitch: 1.0,
    colliderRadius: 0.45,
    targetHeight: 0.78,
  },
  athletic_large: {
    presetId: 'athletic_large',
    label: 'Athletic Runner',
    walkSpeed: 4.6,
    sprintSpeed: 11.0,
    acceleration: 18,
    deceleration: 14.5,
    turnRate: 5.5,
    driftGrip: 0.76,
    jumpVelocity: 7.7,
    gravity: 18,
    bankAngle: 0.26,
    strideFrequency: 10.4,
    staminaDrain: 4.2,
    barkPitch: 0.84,
    colliderRadius: 0.48,
    targetHeight: 0.84,
  },
  gentle_heavy: {
    presetId: 'gentle_heavy',
    label: 'Sturdy & Grounded',
    walkSpeed: 3.5,
    sprintSpeed: 7.8,
    acceleration: 14,
    deceleration: 13,
    turnRate: 4.8,
    driftGrip: 0.82,
    jumpVelocity: 5.8,
    gravity: 19.5,
    bankAngle: 0.14,
    strideFrequency: 9.2,
    staminaDrain: 7.0,
    barkPitch: 0.68,
    colliderRadius: 0.52,
    targetHeight: 0.88,
  },
};

export const BUILTIN_BREEDS: DogBreedConfig[] = [
  {
    id: 'pitbull',
    name: 'American Pitbull',
    subtitle: 'Athletic photorealistic GLB with 100+ mocap animations',
    source: 'glb',
    glbUrl: '/models/dogs/animated_pitbull_dog.glb',
    forwardRotationDeg: 180,
    clipMapping: {
      idle: 'idle 50',
      walk: 'walk_fwd 29',
      run: 'run_fwd 13',
      jump: 'jump 22',
      action: 'idle_sniff 83',
      sniff: 'idle_sniff 83',
      bark: 'idle_bark_04_warning 47',
      pee: 'pee 43',
      poop: 'poop 75',
      eat: 'interact_elmer_treat',
      bellyRub: 'idle_lay_pose 2',
    },
    physics: {
      ...PHYSICS_PRESETS.athletic_large,
      targetHeight: 0.68,
    },
  },
  {
    id: 'golden',
    name: 'Golden Retriever',
    subtitle: 'Friendly, balanced stride & joyful feathered tail',
    source: 'glb',
    glbUrl: '/models/dogs/golden_retriever_dog__3d_model_free.glb',
    forwardRotationDeg: 0,
    clipMapping: {
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      jump: 'jump',
      action: 'sniff',
      sniff: 'sniff',
      bark: 'bark',
      bellyRub: 'bellyRub',
    },
    physics: {
      ...PHYSICS_PRESETS.balanced_medium,
      targetHeight: 0.68,
    },
  },
  {
    id: 'shepherd',
    name: 'German Shepherd',
    subtitle: 'High sprint speed, agile cornering & keen scent tracker',
    source: 'glb',
    glbUrl: '/models/dogs/german_shepherd_dog_3d_model_free.glb',
    forwardRotationDeg: 0,
    clipMapping: {
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      jump: 'jump',
      action: 'sniff',
      sniff: 'sniff',
      bark: 'bark',
      bellyRub: 'bellyRub',
    },
    physics: {
      ...PHYSICS_PRESETS.athletic_large,
      targetHeight: 0.74,
    },
  },
  {
    id: 'saint_bernard',
    name: 'Saint Bernard',
    subtitle: 'Gentle alpine giant with booming bark & steady stride',
    source: 'glb',
    glbUrl: '/models/dogs/joyful_saint_bernard_dog_3d_model_free.glb',
    forwardRotationDeg: 0,
    clipMapping: {
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      jump: 'jump',
      action: 'sniff',
      sniff: 'sniff',
      bark: 'bark',
      bellyRub: 'bellyRub',
    },
    physics: {
      ...PHYSICS_PRESETS.gentle_heavy,
      targetHeight: 0.84,
    },
  },
  {
    id: 'pug',
    name: 'Fawn Pug',
    subtitle: 'Compact zoomies champion with tight turning radius',
    source: 'glb',
    glbUrl: '/models/dogs/pug_3d_model.glb',
    forwardRotationDeg: 0,
    clipMapping: {
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      jump: 'jump',
      action: 'sniff',
      sniff: 'sniff',
      bark: 'bark',
      bellyRub: 'bellyRub',
    },
    physics: {
      ...PHYSICS_PRESETS.agile_small,
      walkSpeed: 3.4,
      sprintSpeed: 7.6,
      turnRate: 9.4,
      targetHeight: 0.42,
      barkPitch: 1.48,
    },
  },
];

export const INITIAL_REWARDS: SocialReward[] = [
  {
    id: 'bandana',
    name: 'Plaid Explorer Bandana',
    description: 'Gifted by Barkshire townsfolk for being a polite pup.',
    perkLabel: '+15% Treat Scent Radius',
    requiredInteractions: 2,
    unlocked: false,
    equipped: false,
  },
  {
    id: 'crown',
    name: 'Golden Good-Boy Star',
    description: 'A shiny brass star badge awarded by park regulars.',
    perkLabel: '+20% Energy Recovery',
    requiredInteractions: 4,
    unlocked: false,
    equipped: false,
  },
  {
    id: 'royal_collar',
    name: 'Velvet Town Collar',
    description: 'Crafted by the Baker and Butcher for Barkshire’s favorite dog.',
    perkLabel: '+15% Sprint Zoomies Speed',
    requiredInteractions: 6,
    unlocked: false,
    equipped: false,
  },
  {
    id: 'legend_cape',
    name: 'Mayor of the Park Cape',
    description: 'The highest honor in Barkshire Park.',
    perkLabel: 'Full Scent Vision & Reduced Drain',
    requiredInteractions: 10,
    unlocked: false,
    equipped: false,
  },
];
