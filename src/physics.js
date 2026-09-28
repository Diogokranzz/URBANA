import * as THREE from '../vendor/three.module.js';

const _box = new THREE.Box3();
const _hit = new THREE.Vector3();

export class Physics {
  constructor(colliders) {
    this.colliders = colliders;
    physicsColliders = colliders;
  }

  segmentHit(from, to) {
    let best = null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      let tmin = 0, tmax = 1, axis = -1, sign = 0;
      const o = [from.x, from.y, from.z], d = [dx, dy, dz];
      const bmin = [b.min.x, b.min.y, b.min.z], bmax = [b.max.x, b.max.y, b.max.z];
      if (o[0] > bmin[0] && o[0] < bmax[0] &&
          o[1] > bmin[1] && o[1] < bmax[1] &&
          o[2] > bmin[2] && o[2] < bmax[2]) continue;
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < bmin[a] || o[a] > bmax[a]) { ok = false; break; }
        } else {
          const inv = 1 / d[a];
          let t1 = (bmin[a] - o[a]) * inv;
          let t2 = (bmax[a] - o[a]) * inv;
          let s = -1;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (!ok) continue;
      if (tmax < 0 || tmin > 1) continue;
      const t = tmin >= 0 ? tmin : 0;
      if (best && t >= best.t) continue;

      _hit.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
      const n = new THREE.Vector3();
      if (axis === 0) n.set(sign, 0, 0);
      else if (axis === 1) n.set(0, sign, 0);
      else if (axis === 2) n.set(0, 0, sign);
      else n.set(0, 1, 0);

      const kind = guessKind(b);
      best = { t, point: _hit.clone(), normal: n, box: b, kind };
    }
    return best;
  }

  moveCapsule(pos, vel, dt, r, h) {
    let onGround = false, hitWall = false;

    pos.y += vel.y * dt;
    if (pos.y < 0) { pos.y = 0; vel.y = 0; onGround = true; }
    for (const b of this.colliders) {
      if (overlapXZ(pos, r, b)) {
        if (vel.y <= 0 &&
            pos.y >= b.max.y - 0.6 && pos.y <= b.max.y + Math.abs(vel.y) * dt + 0.01) {
          pos.y = b.max.y; vel.y = 0; onGround = true;
        }
        else if (vel.y > 0 && pos.y + h > b.min.y && pos.y < b.min.y) {
          pos.y = b.min.y - h; vel.y = 0;
        }
      }
    }

    const oldX = pos.x;
    pos.x += vel.x * dt;
    for (const b of this.colliders) {
      if (overlapXZ(pos, r, b) && verticalOverlap(pos, h, b)) {
        const step = b.max.y - pos.y;
        if (step > 0 && step <= 0.55 && headroomClear(pos, b.max.y, h, r, b)) {
          pos.y = b.max.y; onGround = true;
        } else {
          pos.x = oldX; vel.x = 0; hitWall = true;
          break;
        }
      }
    }

    const oldZ = pos.z;
    pos.z += vel.z * dt;
    for (const b of this.colliders) {
      if (overlapXZ(pos, r, b) && verticalOverlap(pos, h, b)) {
        const step = b.max.y - pos.y;
        if (step > 0 && step <= 0.55 && headroomClear(pos, b.max.y, h, r, b)) {
          pos.y = b.max.y; onGround = true;
        } else {
          pos.z = oldZ; vel.z = 0; hitWall = true;
          break;
        }
      }
    }
    return { onGround, hitWall };
  }

  lineOfSight(from, to) {
    return !this.segmentHit(from, to);
  }

  posClear(x, z, r, h = 1.7) {
    for (const b of this.colliders) {
      if (b.max.y <= 0.56) continue;
      if (x + r > b.min.x && x - r < b.max.x &&
          z + r > b.min.z && z - r < b.max.z &&
          b.min.y < h) return false;
    }
    return true;
  }
}

function overlapXZ(pos, r, b) {
  return pos.x + r > b.min.x && pos.x - r < b.max.x &&
         pos.z + r > b.min.z && pos.z - r < b.max.z;
}
function verticalOverlap(pos, h, b) {
  return pos.y + h > b.min.y && pos.y < b.max.y;
}
let physicsColliders = null;
function headroomClear(pos, newY, h, r, selfBox) {
  for (const b of physicsColliders) {
    if (b === selfBox) continue;
    if (overlapXZ(pos, r, b) && b.min.y < newY + h && b.max.y > newY + 0.05) return false;
  }
  return true;
}

function guessKind(b) {
  const h = b.max.y - b.min.y;
  const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
  if (h < 2.2 && w < 1.5 && d < 1.5) return 'metal';
  if (h < 2.0 && Math.max(w, d) < 5.5 && h > 0.8) return 'wood';
  return 'concrete';
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dampF(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
