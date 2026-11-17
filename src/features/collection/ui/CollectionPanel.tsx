import { useState } from "react";
import { Heart, Download, ArrowUpRight, Footprints, Eye } from "lucide-react";
import type { GalleryDocument } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import {
  recapStats,
  recapEntries,
  createRecap,
  EFFECTIVE_VIEW_SECONDS,
} from "../lib/recap";
import { downloadRecap } from "../lib/download";
export function CollectionPanel({
  document,
  onSelect,
  onNote,
  onToggle,
}: {
  document: GalleryDocument;
  onSelect: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onToggle: (id: string) => void;
}) {
  const stats = recapStats(document);
  const entries = recapEntries(document);
  const [logOpen, setLogOpen] = useState(false);
  return (
    <div className="collection-panel">
      <div className="eyebrow">YOUR PERSONAL GALLERY</div>
      <h2>把共鸣，留在这里。</h2>
      <div className="stats">
        <span>
          <strong data-testid="stat-seen">{stats.seen}</strong>有效观看
        </span>
        <span>
          <strong>{stats.saved}</strong>已收藏
        </span>
        <span>
          <strong>{Math.floor(stats.seconds / 60)}′</strong>驻留时长
        </span>
      </div>
      <p className="viewing-note">
        有效观看指介绍归属成立、视线停留在作品上的累计时长（≥
        {EFFECTIVE_VIEW_SECONDS} 秒）；只入画片刻的作品记为短暂路过。
        {stats.passing > 0 && (
          <span data-testid="stat-passing">
            {" "}
            本次有 {stats.passing} 件短暂路过。
          </span>
        )}
      </p>
      {entries.length > 0 && (
        <div className="viewing-list">
          {entries.slice(0, 4).map((e) => (
            <button
              key={e.id}
              className={e.effective ? "viewing-row effective" : "viewing-row"}
              onClick={() => onSelect(e.id)}
              data-testid={"viewing-" + e.id}
              data-effective={e.effective ? "true" : "false"}
            >
              {e.effective ? <Eye size={13} /> : <Footprints size={13} />}
              <span>{e.title}</span>
              <small>
                {e.effective ? "有效观看" : "短暂路过"} · {e.seconds}s · 切换{" "}
                {e.switchCount}
              </small>
            </button>
          ))}
        </div>
      )}
      <button
        className="text-button log-toggle"
        aria-expanded={logOpen}
        onClick={() => setLogOpen((v) => !v)}
      >
        参观记录 · 切换 {stats.switches} 次
        <ArrowUpRight size={13} />
      </button>
      {logOpen && (
        <ol className="visit-log" data-testid="visit-log">
          {(document.journal || [])
            .slice(-24)
            .reverse()
            .map((e, i) => (
              <li key={e.at + "-" + i}>
                <time>{new Date(e.at).toLocaleTimeString()}</time>
                <span className="log-type">{e.type}</span>
                <span>
                  {e.action || ""}
                  {e.from ? ` ${short(e.from)} →` : ""} {short(e.to)}
                  {typeof e.seconds === "number" ? ` · ${e.seconds}s` : ""}
                  {e.reason && e.reason !== "none" ? ` · ${e.reason}` : ""}
                </span>
              </li>
            ))}
        </ol>
      )}
      {document.favorites.length === 0 ? (
        <div className="empty">
          <Heart size={28} />
          <p>遇见喜欢的作品，点亮一颗心。</p>
          <small>你的参观故事，将从这里开始。</small>
        </div>
      ) : (
        document.favorites.map((id) => {
          const a = artworkById(id);
          if (!a) return null;
          const entry = entries.find((e) => e.id === id);
          return (
            <article className="saved-card" key={id}>
              <button className="saved-title" onClick={() => onSelect(id)}>
                {a.title}
                <ArrowUpRight size={15} />
              </button>
              <small>
                {a.artist} · {a.year}
                {entry
                  ? ` · 有效观看 ${entry.seconds} 秒 · 切换 ${entry.switchCount} 次`
                  : ""}
              </small>
              <textarea
                aria-label={"感想-" + a.title}
                placeholder="写下此刻的感受…"
                value={document.notes[id] || ""}
                onChange={(e) => onNote(id, e.target.value)}
                maxLength={1000}
              />
              <button className="text-button" onClick={() => onToggle(id)}>
                移出收藏
              </button>
            </article>
          );
        })
      )}
      <button
        className="primary full"
        disabled={!stats.saved}
        onClick={() => downloadRecap(createRecap(document))}
      >
        <Download size={16} />
        生成个人参观回顾
      </button>
    </div>
  );
}
function short(id: string | null | undefined) {
  if (!id) return "—";
  return artworkById(id)?.title || id;
}
