import type { GalleryDocument } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";

/** 有效观看：介绍归属成立、视线确实停在作品上。 */
export const EFFECTIVE_VIEW_SECONDS = 4;
/** 短暂路过：进入过视野但远未形成有效观看。 */
export const PASSING_SECONDS = 1.5;

export type RecapEntry = {
  id: string;
  title: string;
  seconds: number;
  approachSeconds: number;
  effective: boolean;
  passing: boolean;
  switchCount: number;
};

/** 从同一条操作记录里还原每件作品的切换次数，供回顾与调试核对。 */
export function switchCounts(d: GalleryDocument): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of d.journal || []) {
    if (event.type !== "switch" || event.action !== "switch" || !event.to)
      continue;
    counts[event.to] = (counts[event.to] || 0) + 1;
  }
  return counts;
}

export function recapEntries(d: GalleryDocument): RecapEntry[] {
  const counts = switchCounts(d);
  return d.visits
    .map((v) => {
      const a = artworkById(v.id);
      const seconds = Math.round(v.seconds);
      const approachSeconds = Math.round(v.approachSeconds ?? v.seconds);
      const effective = v.seconds >= EFFECTIVE_VIEW_SECONDS;
      return {
        id: v.id,
        title: a?.title || v.id,
        seconds,
        approachSeconds,
        effective,
        passing: !effective && approachSeconds >= PASSING_SECONDS,
        switchCount: counts[v.id] || 0,
      };
    })
    .filter((e) => e.approachSeconds > 0 || e.switchCount > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

export function recapStats(d: GalleryDocument) {
  const entries = recapEntries(d);
  const effective = entries.filter((e) => e.effective);
  const passing = entries.filter((e) => e.passing);
  return {
    seen: effective.length,
    passing: passing.length,
    seconds: Math.round(
      entries.reduce((n, v) => n + v.approachSeconds, 0),
    ),
    effectiveSeconds: Math.round(entries.reduce((n, v) => n + v.seconds, 0)),
    saved: d.favorites.length,
    switches: (d.journal || []).filter(
      (e) => e.type === "switch" && e.action === "switch",
    ).length,
  };
}

export function createRecap(d: GalleryDocument): string {
  const stats = recapStats(d);
  const entries = recapEntries(d);
  const effective = entries.filter((e) => e.effective);
  const passing = entries.filter((e) => e.passing);
  const lines = [
    "余境 · 我的参观回顾",
    `有效观看 ${stats.seen} 件作品 · 有效停留 ${stats.effectiveSeconds} 秒`,
    `驻留总时长 ${stats.seconds} 秒 · 介绍切换 ${stats.switches} 次`,
  ];
  if (passing.length) {
    lines.push(
      `短暂路过 ${passing.length} 件：${passing.map((e) => e.title).join("、")}`,
    );
  }
  if (effective.length) {
    lines.push(
      "",
      "有效观看",
      ...effective.map(
        (e) => `${e.title} · ${e.seconds} 秒 · 切换 ${e.switchCount} 次`,
      ),
    );
  }
  if (d.favorites.length) {
    lines.push(
      "",
      "收藏",
      ...d.favorites.map((id) => {
        const a = artworkById(id);
        const entry = entries.find((e) => e.id === id);
        if (!a) return "";
        const note = d.notes[id] || "未添加感想";
        return `${a.title} / ${a.artist}\n${note}${
          entry ? `\n有效观看 ${entry.seconds} 秒` : ""
        }`;
      }),
    );
  }
  return lines.join("\n\n");
}
