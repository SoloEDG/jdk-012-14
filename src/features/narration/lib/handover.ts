import type { AttentionSnapshot } from "../../catalog";
import type { AudioState, TourState } from "../../../shared/types";

export type HandoverDecision = {
  /** 讲解动作：开始 / 继续 / 交接给新对象 / 停下 / 不动。 */
  narration: "start" | "resume" | "handover" | "pause" | "none";
  /** 讲解对象（start / resume / handover 时有效）。 */
  to?: string;
  /** 导览动作：在当前站让位暂停，或回到让位前的状态。 */
  tour: "pause" | "resume" | "none";
};

const NONE: HandoverDecision = { narration: "none", tour: "none" };

/**
 * 讲解与导览的交接：只有关注真正成立（可见且稳定）之后才发生。
 * 讲解对象、导览状态与关注快照来自同一份判定，可以用同一段操作记录核对。
 */
export function decideHandover(
  attention: AttentionSnapshot,
  narration: AudioState,
  tour: TourState,
  tourTarget: string | null,
): HandoverDecision {
  const active = attention.active;
  const settled = attention.settled;
  const narrated = narration.artworkId;
  const listening = tour.phase === "listening" && !!tourTarget;

  // 导览到站且用户确实看向本站：开始本站讲解。
  if (listening && active === tourTarget && settled) {
    if (narrated === active && (narration.playing || narration.elapsed > 0))
      return NONE;
    return { narration: "start", to: active, tour: "none" };
  }

  if (listening) {
    // 到站后立即转向另一件作品：介绍已归新对象，导览在原站让位。
    if (active && active !== tourTarget && settled) {
      return {
        narration:
          narration.playing && narrated !== active ? "handover" : "none",
        to: active,
        tour: "pause",
      };
    }
    // 视线离开且没有新关注：讲解停在同一站，导览让位等待。
    if (!active) {
      return { narration: narration.playing ? "pause" : "none", tour: "pause" };
    }
    return NONE;
  }

  // 因让位而暂停的导览：用户又看回本站，就回到讲解并继续。
  if (
    tour.phase === "paused" &&
    tour.pausedFrom === "listening" &&
    tour.pausedReason === "diverted" &&
    tourTarget &&
    active === tourTarget &&
    settled
  ) {
    return {
      narration:
        narrated === active ? (narration.playing ? "none" : "resume") : "start",
      to: active,
      tour: "resume",
    };
  }

  // 自由探索 / 行走中：讲解只在已经播放时跟随关注对象。
  if (!narration.playing || !narrated) return NONE;
  if (active && active !== narrated) {
    if (!settled) return NONE;
    return { narration: "handover", to: active, tour: "none" };
  }
  if (!active) return { narration: "pause", tour: "none" };
  return NONE;
}
