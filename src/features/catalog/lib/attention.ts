import type { ArtworkSighting } from "../../../shared/types";

/**
 * 关注（attention）判定。
 *
 * 空间层只提供“看不看得见”的线索，这里决定“谁拥有介绍”：
 * - 视线停留足够久、且没有被展台遮挡，作品才可能成为介绍对象；
 * - 已选中的作品有滞后优势（滞回），避免两幅相邻作品来回闪动；
 * - 距离只是得分的一部分，正面可见的中距离作品可以胜过侧后方的近处作品；
 * - 手动选择拥有一段稳定查看期，不会被自动选择立刻覆盖；
 * - 视线离开后必须及时交还介绍，不能一味延长延迟，也不能一直保留背后的介绍。
 */

export const ATTENTION = {
  /** 采样节拍：与画面帧率解耦，低帧率下判定仍按真实时间推进。 */
  tickMs: 100,
  /** 无论得分多高，都必须先停留的最小时间。 */
  minSettleMs: 240,
  /** 低分作品建立关注所需的最长停留。 */
  maxSettleMs: 900,
  /** 低于该得分不参与自动归属。 */
  scoreFloor: 0.18,
  /** 切换需要超越当前作品的最小分差，形成滞回。 */
  switchMargin: 0.16,
  /** 自动切换的最小间隔，防止连续抖动。 */
  switchCooldownMs: 1500,
  /** 视线离开当前作品后，交还介绍的时间。 */
  lookAwayReleaseMs: 900,
  /** 被中央展台遮挡时的容忍时间：穿行不应造成切换。 */
  occlusionReleaseMs: 3000,
  /** 手动点击作品的稳定查看期。 */
  manualHoldMs: 10000,
  /** 稳定查看期内，主动选择自带的分差优势（随时间线性衰减到 0）。 */
  manualAdvantage: 0.42,
  /** 稳定查看期内，别的作品也要先被持续注视这么久，才谈得上竞争。 */
  manualChallengerDwellMs: 1400,
  /** 即使处在稳定查看期，转头离开太久也会释放。 */
  manualAbandonMs: 1800,
  /** 当前作品在视线外时，确认新作品所需的最短停留（快速转身也及时）。 */
  reacquireMs: 320,
  /** 关注成立后的确认时间，用于讲解交接。 */
  settleConfirmMs: 260,
  /** 单次采样最多累计的时间，避免后台恢复时一次跳变。 */
  maxStepSeconds: 0.25,
} as const;

export type AttentionReason =
  | "initial"
  | "manual"
  | "attention"
  | "looked-away"
  | "occluded"
  | "none";

export type AttentionState = {
  selected: string | null;
  nearby: string | null;
  dwell: Record<string, number>;
  visibleIds: string[];
  lastVisibleAt: Record<string, number>;
  selectedAt: number;
  lastSwitchAt: number;
  stableSince: number | null;
  manualId: string | null;
  manualUntil: number;
  /** 手动选择刚发生、尚未真正看见作品。 */
  selecting: boolean;
  /** 仍在前往观看点（导览或点击前往），途中不因看不见而释放。 */
  traveling: boolean;
  lastReason: AttentionReason;
  clock: number;
};

export type AttentionEvent = {
  type: "switch" | "release";
  from: string | null;
  to: string | null;
  reason: AttentionReason;
  at: number;
};

export type AttentionInput = {
  now: number;
  /** 距上次采样的秒数；低帧率下由真实时间换算。 */
  dt: number;
  sightings: ArtworkSighting[];
  /**
   * 用户主动点击（列表 / 画面 / 地图），或导览把用户送往某件作品。
   * hold：是否拥有稳定查看期（用户主动点击才拥有）。
   * traveling：是否仍在前往观看点，途中作品可能不在视野内。
   */
  manual?: {
    id: string;
    at: number;
    hold?: boolean;
    traveling?: boolean;
  } | null;
  /** 当前是否仍在自动前往某个观看点；由行走层每帧告知。 */
  traveling?: boolean;
};

export type AttentionSnapshot = {
  active: string | null;
  nearby: string | null;
  selectedVisible: boolean;
  selectedOccluded: boolean;
  settled: boolean;
  stableMs: number;
  visibleIds: string[];
};

export function initialAttention(now = 0): AttentionState {
  return {
    selected: null,
    nearby: null,
    dwell: {},
    visibleIds: [],
    lastVisibleAt: {},
    selectedAt: 0,
    lastSwitchAt: -Infinity,
    stableSince: null,
    manualId: null,
    manualUntil: 0,
    selecting: false,
    traveling: false,
    lastReason: "initial",
    clock: now,
  };
}

/** 得分越高，建立关注越果断；低分作品需要更长的停留。 */
export function settleSeconds(score: number): number {
  const s = clamp(score, 0, 1);
  return (
    (ATTENTION.minSettleMs +
      (ATTENTION.maxSettleMs - ATTENTION.minSettleMs) * (1 - s)) /
    1000
  );
}

export function stepAttention(
  prev: AttentionState,
  input: AttentionInput,
): {
  state: AttentionState;
  events: AttentionEvent[];
  snapshot: AttentionSnapshot;
} {
  const now = input.now;
  // 低帧率 / 后台标签造成的巨大 dt 不应一次性填满停留时间。
  const dt = clamp(input.dt, 0, ATTENTION.maxStepSeconds);
  const events: AttentionEvent[] = [];
  const next: AttentionState = {
    ...prev,
    dwell: { ...prev.dwell },
    lastVisibleAt: { ...prev.lastVisibleAt },
    clock: now,
  };

  const byId = new Map(input.sightings.map((s) => [s.id, s]));
  for (const s of input.sightings) {
    const previous = prev.dwell[s.id] || 0;
    next.dwell[s.id] = s.visible
      ? Math.min(10, previous + dt)
      : Math.max(0, previous - dt * 2.5);
    if (s.visible) next.lastVisibleAt[s.id] = now;
  }
  next.visibleIds = input.sightings.filter((s) => s.visible).map((s) => s.id);

  // 手动选择：立即获得介绍；只有用户主动点击才开启稳定查看期。
  if (input.manual && input.manual.id !== prev.manualId) {
    const id = input.manual.id;
    const at = input.manual.at;
    const hold = input.manual.hold !== false;
    next.manualId = id;
    next.manualUntil = hold ? at + ATTENTION.manualHoldMs : 0;
    next.selecting = true;
    next.traveling = !!input.manual.traveling;
    next.selected = id;
    next.selectedAt = at;
    next.lastSwitchAt = at;
    next.stableSince = null;
    next.lastReason = "manual";
    next.lastVisibleAt[id] = at;
    // 手动选择不是“看见”，不伪造停留时间；它靠查看期稳定。
    events.push({
      type: "switch",
      from: prev.selected,
      to: id,
      reason: "manual",
      at,
    });
  } else if (input.manual && input.manual.id === prev.manualId) {
    // 再次点击同一作品，续上稳定查看期。
    next.selecting = true;
    next.traveling = !!input.manual.traveling;
    next.manualUntil = input.manual.hold === false
      ? next.manualUntil
      : Math.max(next.manualUntil, input.manual.at + ATTENTION.manualHoldMs);
  }

  const manualActive =
    !!next.manualId &&
    (next.selecting || now < next.manualUntil) &&
    next.selected === next.manualId;
  // 稳定查看期的保护随时间线性衰减，而不是到点才突然失效。
  const manualAdvantage = manualActive
    ? ATTENTION.manualAdvantage *
      clamp((next.manualUntil - now) / ATTENTION.manualHoldMs, 0, 1)
    : 0;

  const selectedSight = next.selected ? byId.get(next.selected) : undefined;
  const selectedVisible = !!selectedSight?.visible;
  const selectedInView = !!selectedSight?.inView;
  const selectedOccluded = !!selectedSight?.occluded && selectedInView;

  // 行走层每帧告知“是否仍在前往观看点”。新选择发生的那一拍，
  // 行走可能还没真正启动，以选择自带的 traveling 为准。
  const startingTravel =
    !!input.manual &&
    input.manual.traveling === true &&
    input.manual.id !== prev.manualId;
  next.traveling =
    startingTravel ||
    (typeof input.traveling === "boolean"
      ? input.traveling
      : next.traveling);

  if (selectedVisible) {
    // 一旦真的看见，赴约标记结束；稳定查看期继续按查看期计时。
    next.selecting = false;
    next.traveling = false;
  }

  // 视线离开 / 被遮挡 / 手动查看期离开：都必须及时释放。
  if (next.selected && !selectedVisible && !next.traveling) {
    const since = next.lastVisibleAt[next.selected] ?? next.selectedAt;
    // 被展台遮挡时给足容忍时间：穿过展台不应产生切换；
    // 真正的转身离开则更早交还。
    const grace = selectedOccluded
      ? ATTENTION.occlusionReleaseMs
      : manualActive
        ? ATTENTION.manualAbandonMs
        : ATTENTION.lookAwayReleaseMs;
    if (now - since > grace) {
      const reason: AttentionReason = selectedOccluded
        ? "occluded"
        : "looked-away";
      events.push({
        type: "release",
        from: next.selected,
        to: null,
        reason,
        at: now,
      });
      if (next.manualId === next.selected) {
        next.manualId = null;
        next.manualUntil = 0;
      }
      next.selected = null;
      next.stableSince = null;
      next.lastReason = reason;
    }
  }

  // 候选排序：视线优先，持续停留作为轻微加成。
  const candidates = input.sightings
    .filter((s) => s.visible && s.score >= ATTENTION.scoreFloor)
    .map((s) => ({
      id: s.id,
      score: s.score,
      dwell: next.dwell[s.id] || 0,
      rank: s.score + Math.min(next.dwell[s.id] || 0, 2) * 0.02,
    }))
    .sort((a, b) => b.rank - a.rank);

  const best = candidates[0] || null;
  next.nearby = best?.id ?? null;

  const switchTo = (id: string, reason: AttentionReason, at: number) => {
    events.push({ type: "switch", from: next.selected, to: id, reason, at });
    next.selected = id;
    next.selectedAt = at;
    next.lastSwitchAt = at;
    next.stableSince = null;
    next.lastReason = reason;
    // 自动归属不会继承别人的手动查看期。
    if (next.manualId && next.manualId !== id) {
      next.manualId = null;
      next.manualUntil = 0;
    }
  };

  // 赴约途中（正自动走向观看点）不建立新的归属，避免路过的作品抢走介绍。
  if (!next.traveling) {
    const current = next.selected ? byId.get(next.selected) : undefined;
    if (!next.selected) {
      if (best && best.dwell >= settleSeconds(best.score)) {
        switchTo(best.id, "attention", now);
      }
    } else if (!current?.visible) {
      // 当前对象已看不清：视线离开时快速交还；
      // 被展台遮挡时保持安静，交给上面的遮挡容忍时间处理。
      if (
        !selectedOccluded &&
        best &&
        best.id !== next.selected &&
        best.dwell >= ATTENTION.reacquireMs / 1000 &&
        now - next.lastSwitchAt >= 250
      ) {
        switchTo(best.id, "looked-away", now);
      }
    } else if (best && best.id !== next.selected) {
      // 当前对象仍然可见：需要明显更高的得分 + 足够的停留，形成滞回。
      const threshold =
        (current?.score ?? 0) + ATTENTION.switchMargin + manualAdvantage;
      const requiredDwell = manualActive
        ? ATTENTION.manualChallengerDwellMs / 1000
        : settleSeconds(best.score);
      if (
        best.dwell >= requiredDwell &&
        now - next.lastSwitchAt >= ATTENTION.switchCooldownMs &&
        best.score > threshold
      ) {
        switchTo(best.id, "attention", now);
      }
    }
  }

  const selectedFinal = next.selected ? byId.get(next.selected) : undefined;
  const fineVisible = !!selectedFinal?.visible;
  if (fineVisible) {
    if (next.stableSince === null) next.stableSince = now;
  } else {
    next.stableSince = null;
  }

  const stableMs = next.stableSince === null ? 0 : now - next.stableSince;
  const snapshot: AttentionSnapshot = {
    active: next.selected,
    nearby: next.nearby,
    selectedVisible: fineVisible,
    selectedOccluded: !!selectedFinal?.occluded,
    settled: fineVisible && stableMs >= ATTENTION.settleConfirmMs,
    stableMs,
    visibleIds: next.visibleIds,
  };
  return { state: next, events, snapshot };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
