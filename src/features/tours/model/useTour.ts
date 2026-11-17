import { useState } from "react";
import type { TourState } from "../../../shared/types";
import { routes } from "../../../shared/catalog";
import { tourTarget, tourRoute } from "../lib/routeProgress";
const initial: TourState = { routeId: null, step: 0, phase: "idle" };
export function useTour() {
  const [state, setState] = useState<TourState>(initial);
  return {
    state,
    target: tourTarget(state),
    start: (id: string) => {
      if (routes.some((r) => r.id === id))
        setState({ routeId: id, step: 0, phase: "walking" });
    },
    arrive: () =>
      setState((t) =>
        t.phase === "walking" ? { ...t, phase: "listening" } : t,
      ),
    next: () =>
      setState((t) => {
        const r = tourRoute(t);
        if (!r) return t;
        return t.step + 1 >= r.stops.length
          ? { ...t, phase: "done" }
          : { ...t, step: t.step + 1, phase: "walking" };
      }),
    /** 暂停时记住当前阶段与原因，恢复后不会把“讲解”误变回“行走”。 */
    pause: (reason: "user" | "diverted" = "user") =>
      setState((t) => {
        if (t.phase === "paused")
          return t.pausedReason === reason ? t : { ...t, pausedReason: reason };
        if (t.phase === "idle" || t.phase === "done") return t;
        return {
          ...t,
          phase: "paused",
          pausedFrom: t.phase,
          pausedReason: reason,
        };
      }),
    resume: () =>
      setState((t) =>
        t.phase === "paused"
          ? {
              ...t,
              phase: t.pausedFrom === "listening" ? "listening" : "walking",
              pausedFrom: undefined,
              pausedReason: undefined,
            }
          : t,
      ),
    stop: () => setState(initial),
  };
}
