import { useEffect, useRef } from "react";
import {
  useWalker,
  distance,
  viewingPoint,
  sampleVisibility,
} from "../features/space";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useTour } from "../features/tours";
import { useCollection } from "../features/collection";
import { decideHandover } from "../features/narration";
import { artworkById } from "../shared/catalog";
import type { AttentionEvent } from "../features/catalog";

export function useGallery() {
  const walker = useWalker();
  // 空间层提供可见性，作品模块决定介绍归属；两者用同一份行走状态。
  const catalog = useCatalog({
    sample: () =>
      sampleVisibility(walker.positionRef.current, walker.yaw.current),
    isTraveling: () => walker.traveling(),
  });
  const tour = useTour();
  const collection = useCollection();

  const journal = useRef(collection.journal);
  journal.current = collection.journal;

  const tourRef = useRef(tour.state);
  tourRef.current = tour.state;
  const tourNextRef = useRef(tour.next);
  tourNextRef.current = tour.next;

  const narration = useNarration(
    () => {
      if (tourRef.current.phase === "listening") tourNextRef.current();
    },
    (action, id, from) => {
      journal.current({
        at: Date.now(),
        type: "narration",
        action,
        to: id,
        from: from ?? null,
      });
    },
  );

  /** 前往作品：空间层只负责走，不决定介绍归属。 */
  const walkTo = (id: string) => {
    const a = artworkById(id);
    if (!a) return;
    walker.go(viewingPoint(a.position, a.facing));
    walker.yaw.current = a.facing;
  };

  /** 用户主动点击：作品立刻获得介绍，并拥有一段稳定查看期。 */
  const go = (id: string) => {
    if (!artworkById(id)) return;
    // 导览进行中被手动打断：导览让位暂停，手动选择优先。
    if (tour.state.phase === "walking" || tour.state.phase === "listening") {
      tour.pause("diverted");
      journal.current({
        at: Date.now(),
        type: "tour",
        action: "diverted",
        from: tour.target,
        to: id,
      });
    }
    catalog.select(id);
    walkTo(id);
  };

  /** 导览换站：介绍交给导览目标，但不会覆盖用户主动查看的作品。 */
  const followTourTarget = (id: string) => {
    if (!catalog.isManualHold()) catalog.follow(id);
    walkTo(id);
  };

  /** 主动开始一条导览路线。 */
  const startTour = (routeId: string) => {
    walker.stop();
    narration.pause();
    catalog.clearManual();
    tour.start(routeId);
    journal.current({ at: Date.now(), type: "tour", action: "start" });
  };

  // 切换 / 释放事件写入同一条操作记录。
  useEffect(() => {
    return catalog.onAttention((events: AttentionEvent[]) => {
      for (const e of events) {
        journal.current({
          at: e.at,
          type: "switch",
          from: e.from,
          to: e.to,
          action: e.type,
          reason: e.reason,
        });
      }
    });
  }, [catalog]);

  // 导览行走：关注模块先建立归属，再由行走层前往。
  useEffect(() => {
    if (tour.state.phase === "walking" && tour.target) {
      followTourTarget(tour.target);
      journal.current({
        at: Date.now(),
        type: "tour",
        action: "depart",
        to: tour.target,
      });
    }
  }, [tour.state.phase, tour.target]);

  // 到站：只有确实走到该作品的观看点才签到。
  useEffect(() => {
    if (tour.state.phase !== "walking" || !tour.target) return;
    const a = artworkById(tour.target);
    if (!a || walker.traveling()) return;
    if (distance(walker.position, viewingPoint(a.position, a.facing)) < 0.4) {
      tour.arrive();
      journal.current({
        at: Date.now(),
        type: "tour",
        action: "arrive",
        to: a.id,
      });
    }
  }, [walker.position, tour.state.phase, tour.target]);

  // 讲解交接：关注真正成立（可见且稳定），才把讲解交给该作品。
  useEffect(() => {
    const decision = decideHandover(
      catalog.snapshot,
      narration.state,
      tour.state,
      tour.target,
    );
    if (decision.narration === "start" && decision.to) {
      narration.play(decision.to);
      journal.current({
        at: Date.now(),
        type: "narration",
        action: "start",
        to: decision.to,
      });
    } else if (decision.narration === "handover" && decision.to) {
      const from = narration.state.artworkId;
      narration.play(decision.to);
      journal.current({
        at: Date.now(),
        type: "narration",
        action: "handover",
        from,
        to: decision.to,
      });
    } else if (decision.narration === "resume" && decision.to) {
      narration.play(decision.to);
      journal.current({
        at: Date.now(),
        type: "narration",
        action: "resume",
        to: decision.to,
      });
    } else if (decision.narration === "pause") {
      narration.pause();
      journal.current({
        at: Date.now(),
        type: "narration",
        action: "released",
        to: narration.state.artworkId,
      });
    }
    if (decision.tour === "pause" && tour.state.phase === "listening") {
      tour.pause("diverted");
      journal.current({
        at: Date.now(),
        type: "tour",
        action: "diverted",
        from: narration.state.artworkId,
        to: catalog.snapshot.active,
      });
    } else if (decision.tour === "resume" && tour.state.phase === "paused") {
      tour.resume();
      journal.current({
        at: Date.now(),
        type: "tour",
        action: "rejoin",
        to: tour.target,
      });
    }
  }, [
    catalog.snapshot,
    narration.state,
    tour.state,
    tour.target,
    narration,
    tour,
  ]);

  // 每秒结算：有效观看（关注成立且视线仍在）计入 seconds；
  // 仅仅入画的时长计入路过时长。切换次数与观看时长来自同一条操作记录。
  const span = useRef<{ id: string | null; watched: number }>({
    id: null,
    watched: 0,
  });
  const live = useRef({ catalog, recordView: collection.recordView });
  live.current = { catalog, recordView: collection.recordView };
  useEffect(() => {
    const t = setInterval(() => {
      const { catalog: c, recordView } = live.current;
      const active = c.active;
      const watching = active && c.isWatching(active) ? active : null;
      if (span.current.id !== active) {
        if (span.current.id && span.current.watched > 0) {
          journal.current({
            at: Date.now(),
            type: "watch",
            action: "span",
            to: span.current.id,
            seconds: span.current.watched,
          });
        }
        span.current = { id: active, watched: 0 };
      }
      if (watching) span.current.watched += 1;
      recordView(watching, c.snapshot.visibleIds, 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const pauseTour = () => {
    tour.pause();
    walker.stop();
    narration.pause();
    journal.current({
      at: Date.now(),
      type: "tour",
      action: "pause",
      to: tour.target,
    });
  };
  const stopTour = () => {
    tour.stop();
    walker.stop();
    narration.pause();
    journal.current({ at: Date.now(), type: "tour", action: "stop" });
  };
  const resumeTour = () => {
    tour.resume();
    journal.current({
      at: Date.now(),
      type: "tour",
      action: "resume",
      to: tour.target,
    });
  };
  const nextTour = () => {
    walker.stop();
    narration.pause();
    tour.next();
    journal.current({
      at: Date.now(),
      type: "tour",
      action: "next",
      to: tour.target,
    });
  };

  return {
    catalog,
    tour,
    collection,
    walker,
    narration,
    go,
    startTour,
    pauseTour,
    stopTour,
    resumeTour,
    nextTour,
  };
}
