import { useState, useEffect, useRef } from "react";
import type { AudioState } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import { captionAt } from "../lib/timeline";
import { speak, stopSpeech } from "../lib/speech";

/**
 * 语音讲解：只有关注真正成立时，上层才会调用 play。
 * play 对同一件作品是幂等的（不重头开始），切换作品时才换讲解对象。
 */
export function useNarration(
  onEnd: () => void,
  onAction?: (
    action: "play" | "resume" | "pause" | "handover" | "released" | "end",
    id: string | null,
    from?: string | null,
  ) => void,
) {
  const [state, setState] = useState<AudioState>({
    artworkId: null,
    elapsed: 0,
    playing: false,
    rate: 1,
  });
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    if (!state.playing) return;
    let previous = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const delta = (now - previous) / 1000;
      previous = now;
      setState((s) => ({ ...s, elapsed: s.elapsed + delta * s.rate }));
    }, 150);
    return () => clearInterval(t);
  }, [state.playing]);
  const a = artworkById(state.artworkId);
  const caption = a ? captionAt(a, state.elapsed) : "";
  useEffect(() => {
    if (state.playing && caption) setSupported(speak(caption, state.rate));
    else stopSpeech();
    return stopSpeech;
  }, [caption, state.playing, state.rate]);
  useEffect(() => {
    if (a && state.playing && state.elapsed >= a.duration) {
      setState((s) => ({ ...s, playing: false, elapsed: a.duration }));
      actionRef.current?.("end", a.id);
      endRef.current();
    }
  }, [state.elapsed, state.playing, a]);
  /** 播讲某件作品；已在该作品上时只恢复播放，不重头开始。 */
  const play = (id: string) => {
    setState((s) => {
      const duration = artworkById(id)?.duration || 0;
      const same = s.artworkId === id;
      const atEnd = same && s.elapsed >= duration;
      const next: AudioState = {
        ...s,
        artworkId: id,
        elapsed: same && !atEnd ? s.elapsed : 0,
        playing: true,
      };
      if (!same) actionRef.current?.("play", id, s.artworkId);
      else if (!s.playing) actionRef.current?.("resume", id);
      return next;
    });
  };
  return {
    state,
    caption,
    supported,
    play,
    pause: () => {
      setState((s) => {
        if (s.playing && s.artworkId) actionRef.current?.("pause", s.artworkId);
        return { ...s, playing: false };
      });
    },
    toggle: () =>
      setState((s) => {
        if (s.artworkId) {
          actionRef.current?.(s.playing ? "pause" : "resume", s.artworkId);
        }
        return { ...s, playing: !s.playing };
      }),
    seek: (elapsed: number) => setState((s) => ({ ...s, elapsed })),
    rate: (rate: number) => setState((s) => ({ ...s, rate })),
  };
}
