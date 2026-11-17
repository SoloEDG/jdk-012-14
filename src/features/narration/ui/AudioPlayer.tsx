import { Play, Pause, Headphones } from "lucide-react";
import type { AudioState } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import { formatTime } from "../lib/timeline";

/**
 * 播放条始终显示“当前介绍对象”：即使讲解尚未开始，也让人知道按下播放会讲哪一件。
 * 讲解对象只在关注真正成立时才会被交接（见 narration/lib/handover）。
 */
export function AudioPlayer({
  state,
  focusId,
  caption,
  supported,
  onToggle,
  onSeek,
  onRate,
}: {
  state: AudioState;
  focusId: string | null;
  caption: string;
  supported: boolean;
  onToggle: () => void;
  onSeek: (n: number) => void;
  onRate: (n: number) => void;
}) {
  // 播放条展示当前介绍对象；正在播放时以讲解对象为准。
  const displayId = focusId ?? (state.playing ? state.artworkId : null);
  const a = artworkById(displayId);
  const isCurrent = !!a && state.artworkId === a.id;
  return (
    <div className="audio-player">
      <div className="audio-icon">
        <Headphones size={20} />
      </div>
      <div className="audio-title">
        <small>语音讲解 · AUDIO GUIDE</small>
        <strong data-testid="audio-title">{a?.title || "让艺术，有声可循"}</strong>
      </div>
      <button
        aria-label={state.playing ? "暂停讲解" : "播放讲解"}
        className="play-button"
        onClick={onToggle}
        disabled={!a}
      >
        {state.playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <span className="time">{formatTime(isCurrent ? state.elapsed : 0)}</span>
      <input
        aria-label="讲解进度"
        type="range"
        min="0"
        max={a?.duration || 1}
        step=".1"
        value={isCurrent ? state.elapsed : 0}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className="time">{formatTime(a?.duration || 0)}</span>
      <select
        aria-label="讲解速度"
        value={state.rate}
        onChange={(e) => onRate(Number(e.target.value))}
      >
        <option value="1">1.0×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
      </select>
      <div className="caption">
        {!supported
          ? "设备不支持语音，请阅读字幕"
          : isCurrent && caption
            ? caption
            : a
              ? "正在关注这件作品 · 按播放收听讲解"
              : "选择一件作品，听见它背后的故事"}
      </div>
    </div>
  );
}
