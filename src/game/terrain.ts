import * as THREE from 'three';

export const WORLD_PLAYABLE_RADIUS = 92;
export const WORLD_SIZE = 280;

// Duck pond center in the expansive park (East/South-East)
export const POND_CENTER_X = 34;
export const POND_CENTER_Z = 22;
export const POND_RX = 16;
export const POND_RZ = 11.5;

// Town occupies west/north-west side (x < -4), Park occupies east/south side
export function isTownArea(x: number, z: number): boolean {
  return x < -2 && x > -76 && z > -64 && z < 56;
}

export function isOnRoadOrPlaza(x: number, z: number): boolean {
  // Main Street runs along x = -22 from z = -64 to z = 54
  if (Math.abs(x - -22) < 6.5 && z > -64 && z < 56) return true;
  // Cross Street runs along z = -8 from x = -66 to x = 4
  if (Math.abs(z - -8) < 5.5 && x > -68 && x < 6) return true;
  // Town Square Plaza around (-22, -8)
  if (Math.hypot(x - -22, z - -8) < 13.5) return true;
  // Park central fountain plaza around (18, -14)
  if (Math.hypot(x - 18, z - -14) < 9.5) return true;
  return false;
}

export function isInPond(x: number, z: number, margin = 0): boolean {
  const dx = (x - POND_CENTER_X) / (POND_RX + margin);
  const dz = (z - POND_CENTER_Z) / (POND_RZ + margin);
  return dx * dx + dz * dz < 1.0;
}

export function isOnBridge(x: number, z: number): boolean {
  // Wooden arched footbridge crosses pond along z = 22, x from 17 to 51
  return Math.abs(z - POND_CENTER_Z) < 2.25 && x > POND_CENTER_X - 17.5 && x < POND_CENTER_X + 17.5;
}

export function groundHeightAt(x: number, z: number): number {
  // Bridge arch height over the duck pond
  if (isOnBridge(x, z)) {
    const t = (x - POND_CENTER_X) / 17.5; // -1 to 1
    const arch = Math.max(0, Math.cos(t * Math.PI * 0.5)) * 1.45;
    return 0.15 + arch;
  }

  // Flat town district & plazas so buildings and streets sit perfectly flush
  const townBlend = THREE.MathUtils.smoothstep(x, -10, 12);
  let parkHill =
    (Math.sin(x * 0.045) * Math.cos(z * 0.04) * 1.35 +
      Math.sin((x + z) * 0.025) * 0.85) *
    townBlend;

  // Flatten around Park Fountain Plaza (18, -14)
  const distFountain = Math.hypot(x - 18, z - -14);
  const fountainFlat = THREE.MathUtils.smoothstep(distFountain, 10, 20);
  parkHill *= fountainFlat;

  // Flatten around Gazebo (52, -26)
  const distGazebo = Math.hypot(x - 52, z - -26);
  const gazeboFlat = THREE.MathUtils.smoothstep(distGazebo, 7, 16);
  parkHill *= gazeboFlat;

  // Pond basin depression
  const dxP = (x - POND_CENTER_X) / POND_RX;
  const dzP = (z - POND_CENTER_Z) / POND_RZ;
  const pondDistSq = dxP * dxP + dzP * dzP;
  if (pondDistSq < 1.75) {
    const basinFactor = 1 - THREE.MathUtils.smoothstep(Math.sqrt(pondDistSq), 0.72, 1.32);
    parkHill = THREE.MathUtils.lerp(parkHill, -1.25, basinFactor);
  }

  // Gentle perimeter hills beyond playable boundary so horizon feels natural
  const distCenter = Math.hypot(x, z);
  const outerRim = THREE.MathUtils.smoothstep(distCenter, WORLD_PLAYABLE_RADIUS - 2, WORLD_PLAYABLE_RADIUS + 34);
  const rimHeight = outerRim * (5.5 + Math.sin(x * 0.06) * 2.2 + Math.cos(z * 0.055) * 2.0);

  return parkHill + rimHeight;
}

export function getZoneName(x: number, z: number): string {
  if (isOnBridge(x, z)) return 'Willow Pond Bridge';
  if (Math.hypot(x - POND_CENTER_X, z - POND_CENTER_Z) < 22) return 'Duck Pond Shores';
  if (Math.hypot(x - 18, z - -14) < 16) return 'Sunbeam Fountain Plaza';
  if (Math.hypot(x - 52, z - -26) < 14) return 'Oakridge Gazebo';
  if (Math.hypot(x - -22, z - -8) < 16) return 'Barkshire Town Square';
  if (x < -10 && z < -22) return 'Bakery & Market Row';
  if (x < -10 && z > 12) return 'Firehouse Lane';
  if (x < -2) return 'Main Street';
  if (z > 32) return 'South Meadow Trail';
  return 'Barkshire Central Park';
}

export interface BoxCollider {
  type: 'box';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircleCollider {
  type: 'circle';
  x: number;
  z: number;
  radius: number;
}

export type WorldCollider = BoxCollider | CircleCollider;

export class CollisionWorld {
  public colliders: WorldCollider[] = [];

  public addBox(cx: number, cz: number, width: number, depth: number) {
    this.colliders.push({
      type: 'box',
      minX: cx - width * 0.5,
      maxX: cx + width * 0.5,
      minZ: cz - depth * 0.5,
      maxZ: cz + depth * 0.5,
    });
  }

  public addCircle(x: number, z: number, radius: number) {
    this.colliders.push({ type: 'circle', x, z, radius });
  }

  public resolvePosition(pos: THREE.Vector3, radius: number) {
    // 1. Keep inside playable world perimeter
    const distFromOrigin = Math.hypot(pos.x, pos.z);
    if (distFromOrigin > WORLD_PLAYABLE_RADIUS - radius) {
      const scale = (WORLD_PLAYABLE_RADIUS - radius) / distFromOrigin;
      pos.x *= scale;
      pos.z *= scale;
    }

    // 2. Keep out of deep pond water unless on bridge
    if (!isOnBridge(pos.x, pos.z)) {
      const dx = (pos.x - POND_CENTER_X) / (POND_RX - 0.8);
      const dz = (pos.z - POND_CENTER_Z) / (POND_RZ - 0.8);
      const dSq = dx * dx + dz * dz;
      if (dSq < 1.0 && dSq > 0.0001) {
        const inv = 1 / Math.sqrt(dSq);
        pos.x = POND_CENTER_X + dx * inv * (POND_RX - 0.8);
        pos.z = POND_CENTER_Z + dz * inv * (POND_RZ - 0.8);
      }
    }

    // 3. Resolve against all static obstacles (two iterations for clean corners)
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.type === 'circle') {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const minD = radius + c.radius;
          const dSq = dx * dx + dz * dz;
          if (dSq < minD * minD && dSq > 0.00001) {
            const d = Math.sqrt(dSq);
            const push = (minD - d) / d;
            pos.x += dx * push;
            pos.z += dz * push;
          }
        } else {
          const closestX = THREE.MathUtils.clamp(pos.x, c.minX, c.maxX);
          const closestZ = THREE.MathUtils.clamp(pos.z, c.minZ, c.maxZ);
          const dx = pos.x - closestX;
          const dz = pos.z - closestZ;
          const dSq = dx * dx + dz * dz;
          if (dSq < radius * radius) {
            if (dSq > 0.00001) {
              const d = Math.sqrt(dSq);
              const push = (radius - d) / d;
              pos.x += dx * push;
              pos.z += dz * push;
            } else {
              // Inside box fallback: push to nearest face
              const toLeft = Math.abs(pos.x - c.minX);
              const toRight = Math.abs(c.maxX - pos.x);
              const toTop = Math.abs(pos.z - c.minZ);
              const toBot = Math.abs(c.maxZ - pos.z);
              const m = Math.min(toLeft, toRight, toTop, toBot);
              if (m === toLeft) pos.x = c.minX - radius;
              else if (m === toRight) pos.x = c.maxX + radius;
              else if (m === toTop) pos.z = c.minZ - radius;
              else pos.z = c.maxZ + radius;
            }
          }
        }
      }
    }
  }
}
