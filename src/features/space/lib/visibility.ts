import { artworks } from "../../../shared/catalog";
import type { ArtworkSighting, Point } from "../../../shared/types";

/** 视点高度与作品中心高度：与 buildScene 中的摆位保持一致。 */
export const EYE_HEIGHT = 1.7;
const ARTWORK_Y = 2.45;
/** 水平视野半角：覆盖 65° 纵向 FOV 在常见宽高比下的可见范围。 */
const VIEW_HALF_ANGLE = (50 * Math.PI) / 180;
/** 作品法线与视线的最大夹角，超过即视为只能看到侧面/背面。 */
const FRONT_HALF_ANGLE = (72 * Math.PI) / 180;
/** 超过这个距离的作品只作为空间背景，不参与介绍归属。 */
export const MAX_SIGHT_DISTANCE = 8.5;
/** 中央展台与雕塑可遮挡背后的作品。 */
const INSTALLATION = { x: 0, y: EYE_HEIGHT, z: -0.3, radius: 0.82 };

/**
 * 空间层只回答“看不看得见”，不决定谁拥有介绍。
 * 可见性由视野角、作品朝向与中央展台遮挡共同决定。
 */
export function sampleVisibility(p: Point, yaw: number): ArtworkSighting[] {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const out: ArtworkSighting[] = [];
  for (const a of artworks) {
    const dx = a.position.x - p.x;
    const dz = a.position.z - p.z;
    const horizontal = Math.hypot(dx, dz);
    const normX = horizontal > 1e-6 ? dx / horizontal : 0;
    const normZ = horizontal > 1e-6 ? dz / horizontal : 0;
    const gazeCos = Math.max(
      -1,
      Math.min(1, normX * forwardX + normZ * forwardZ),
    );
    const angle = Math.acos(gazeCos);
    const inView = horizontal <= MAX_SIGHT_DISTANCE && angle <= VIEW_HALF_ANGLE;

    // 作品法线朝向房间内部；观察点必须在正面一侧，且不能过于侧掠。
    const normalX = Math.sin(a.facing);
    const normalZ = Math.cos(a.facing);
    const facingCos = normalX * -normX + normalZ * -normZ;
    const frontFacing =
      facingCos >= Math.cos(FRONT_HALF_ANGLE) && facingCos > 0.05;

    const occluded = segmentHitsSphere(
      { x: p.x, y: EYE_HEIGHT, z: p.z },
      { x: a.position.x, y: ARTWORK_Y, z: a.position.z },
      INSTALLATION,
    );
    const visible =
      inView && !occluded && frontFacing && horizontal <= MAX_SIGHT_DISTANCE;

    // 几何得分：视线越居中、越正面、距离越近，分数越高；
    // 距离只占一部分权重，因此“正面较远”可以胜过“侧后方更近”。
    const proximity = clamp01(1 - (horizontal - 1.8) / 5.2);
    const centered = clamp01((gazeCos - Math.cos(VIEW_HALF_ANGLE)) / (1 - Math.cos(VIEW_HALF_ANGLE)));
    const front = clamp01((facingCos - 0.2) / 0.8);
    const score = occluded
      ? 0
      : Math.pow(centered, 0.7) * front * (0.5 + 0.5 * proximity);

    out.push({
      id: a.id,
      visible,
      inView,
      occluded,
      frontFacing,
      distance: round(horizontal),
      angle: round(angle),
      gaze: round(clamp01(gazeCos)),
      score: round(score),
    });
  }
  return out;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 视线段与中央雕塑球体相交：站在展台正前方看向背后作品时会被遮挡，
 * 侧移半步后即可重新看见。
 */
function segmentHitsSphere(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  sphere: { x: number; y: number; z: number; radius: number },
): boolean {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vz = b.z - a.z;
  const wx = sphere.x - a.x;
  const wy = sphere.y - a.y;
  const wz = sphere.z - a.z;
  const lengthSq = vx * vx + vy * vy + vz * vz;
  if (lengthSq < 1e-6) return false;
  const t = Math.max(
    0,
    Math.min(1, (wx * vx + wy * vy + wz * vz) / lengthSq),
  );
  const cx = a.x + vx * t - sphere.x;
  const cy = a.y + vy * t - sphere.y;
  const cz = a.z + vz * t - sphere.z;
  return cx * cx + cy * cy + cz * cz <= sphere.radius * sphere.radius;
}
