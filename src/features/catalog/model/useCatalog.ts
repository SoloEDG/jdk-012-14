import { useState, useRef, useEffect, useCallback } from "react";
import type { ArtworkSighting } from "../../../shared/types";
import {
  ATTENTION,
  initialAttention,
  stepAttention,
} from "../lib/attention";
import type {
  AttentionEvent,
  AttentionInput,
  AttentionSnapshot,
  AttentionState,
} from "../lib/attention";

export type { AttentionEvent, AttentionSnapshot };

const EMPTY: AttentionSnapshot = {
  active: null,
  nearby: null,
  selectedVisible: false,
  selectedOccluded: false,
  settled: false,
  stableMs: 0,
  visibleIds: [],
};

/**
 * 作品模块的关注模型：空间层只上报“看不看得见”，由这里决定介绍归属，
 * 并通过 events 把切换原因交给讲解、导览与收藏模块。
 *
 * 采样与判定都在同一固定节拍上完成，按真实时间推进：
 * 画面帧率再低、或站着不动，关注判定都不会停摆，也不会漏掉关注边界。
 */
export function useCatalog(options: {
  sample: () => ArtworkSighting[];
  isTraveling: () => boolean;
}) {
  const sampler = useRef(options.sample);
  sampler.current = options.sample;
  const travelingOf = useRef(options.isTraveling);
  travelingOf.current = options.isTraveling;

  const state = useRef<AttentionState>(initialAttention());
  const [active, setActive] = useState<string | null>(null);
  const [nearby, setNearby] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AttentionSnapshot>(EMPTY);
  const listeners = useRef(new Set<(e: AttentionEvent[]) => void>());
  const sightings = useRef<ArtworkSighting[]>([]);
  const lastTick = useRef(0);

  const emit = useCallback((events: AttentionEvent[]) => {
    for (const l of listeners.current) l(events);
  }, []);

  const commit = useCallback(() => {
    const s = state.current;
    setActive(s.selected);
    setNearby(s.nearby);
    setSnapshot((prev) => {
      const sight = sightings.current.find((x) => x.id === s.selected);
      const visible = !!sight?.visible;
      const stableMs =
        s.stableSince === null ? 0 : Math.max(0, Date.now() - s.stableSince);
      const settled = visible && stableMs >= ATTENTION.settleConfirmMs;
      const sameVisible =
        prev.visibleIds.length === s.visibleIds.length &&
        prev.visibleIds.every((id) => s.visibleIds.includes(id));
      if (
        prev.active === s.selected &&
        prev.nearby === s.nearby &&
        prev.selectedVisible === visible &&
        prev.selectedOccluded === !!sight?.occluded &&
        prev.settled === settled &&
        sameVisible
      )
        return prev;
      return {
        active: s.selected,
        nearby: s.nearby,
        selectedVisible: visible,
        selectedOccluded: !!sight?.occluded,
        settled,
        stableMs,
        visibleIds: s.visibleIds,
      };
    });
  }, []);

  const advance = useCallback(
    (now: number, manual: AttentionInput["manual"] = null) => {
      // 每次推进前先刷新一次可见性，避免用的是旧帧的采样。
      sightings.current = sampler.current();
      const dt = lastTick.current
        ? (now - lastTick.current) / 1000
        : ATTENTION.tickMs / 1000;
      lastTick.current = now;
      const { state: next, events } = stepAttention(state.current, {
        now,
        dt,
        sightings: sightings.current,
        manual,
        traveling: travelingOf.current(),
      });
      state.current = next;
      commit();
      if (events.length) emit(events);
    },
    [commit, emit],
  );

  /** 用户主动点击：立即获得介绍，并开启一段稳定查看期。 */
  const select = useCallback(
    (id: string) => {
      const at = Date.now();
      // 点击后马上会前往观看点，先标记“赴约中”，避免出发前一拍被误释放。
      advance(at, { id, at, hold: true, traveling: true });
    },
    [advance],
  );

  /** 导览前往：介绍交给导览目标，但不占用“稳定查看期”。 */
  const follow = useCallback(
    (id: string) => {
      const at = Date.now();
      advance(at, { id, at, hold: false, traveling: true });
    },
    [advance],
  );

  useEffect(() => {
    const tick = () => {
      if (document.hidden) {
        lastTick.current = Date.now();
        return;
      }
      advance(Date.now(), null);
    };
    const timer = window.setInterval(tick, ATTENTION.tickMs);
    return () => window.clearInterval(timer);
  }, [advance]);

  const onAttention = useCallback(
    (listener: (e: AttentionEvent[]) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

  const getState = useCallback(() => state.current, []);

  /** 当前是否处在“用户主动点击”的稳定查看期（导览赴约不算）。 */
  const isManualHold = useCallback(() => {
    const s = state.current;
    return (
      !!s.manualId &&
      s.selected === s.manualId &&
      (s.selecting || Date.now() < s.manualUntil)
    );
  }, []);

  /** 开始新的导览 / 主动离场时，结束旧的稳定查看期。 */
  const clearManual = useCallback(() => {
    state.current = { ...state.current, manualId: null, manualUntil: 0 };
  }, []);

  return {
    active,
    nearby,
    snapshot,
    select,
    follow,
    onAttention,
    getState,
    isManualHold,
    clearManual,
    /** 有效观看判定：作品是当前介绍对象，视线停在上面且关注已稳定。 */
    isWatching: (id: string) => {
      const s = state.current;
      if (s.selected !== id || s.stableSince === null) return false;
      if (Date.now() - s.stableSince < ATTENTION.settleConfirmMs) return false;
      return !!sightings.current.find((x) => x.id === id)?.visible;
    },
  };
}
