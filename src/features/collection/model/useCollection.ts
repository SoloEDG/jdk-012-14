import { useState, useEffect, useRef } from "react";
import type { JournalEvent } from "../../../shared/types";
import { loadDocument, saveDocument } from "../../../shared/storage";
import { artworkById } from "../../../shared/catalog";

const MAX_JOURNAL = 300;

/**
 * 收藏与回顾：区分“短暂路过”和“有效观看”。
 * - approachSeconds：作品进入视野的总时长，只要看见就累计；
 * - seconds：作品是当前介绍对象、视线确实停在其上时累计的有效观看时长。
 * 同一秒的采样同时写入操作记录，切换次数 / 讲解对象 / 观看时长可以互相核对。
 */
export function useCollection() {
  const [document, setDocument] = useState(loadDocument);
  const [storageError, setStorageError] = useState(false);
  const pending = useRef<JournalEvent[]>([]);
  useEffect(() => {
    setStorageError(!saveDocument(document));
  }, [document]);
  return {
    document,
    storageError,
    toggle: (id: string) =>
      setDocument((d) => ({
        ...d,
        favorites: d.favorites.includes(id)
          ? d.favorites.filter((x) => x !== id)
          : [...d.favorites, id],
      })),
    note: (id: string, text: string) =>
      setDocument((d) => ({ ...d, notes: { ...d.notes, [id]: text } })),
    /** 记录一次有效观看与画面内时长（按秒采样）。 */
    recordView: (watching: string | null, visible: string[], seconds: number) => {
      if (!visible.length && !watching) return;
      setDocument((d) => {
        const at = Date.now();
        const ids = new Set(visible);
        if (watching) ids.add(watching);
        const visits = d.visits.map((v) => {
          if (!ids.has(v.id)) return v;
          return {
            ...v,
            seconds: v.seconds + (v.id === watching ? seconds : 0),
            approachSeconds: (v.approachSeconds || 0) + seconds,
            lastAt: at,
          };
        });
        const existing = new Set(d.visits.map((v) => v.id));
        const missing = [...ids].filter(
          (id) => !existing.has(id) && artworkById(id),
        );
        if (!missing.length && !d.visits.some((v) => ids.has(v.id))) return d;
        return {
          ...d,
          visits: [
            ...visits,
            ...missing.map((id) => ({
              id,
              seconds: id === watching ? seconds : 0,
              at,
              approachSeconds: seconds,
              lastAt: at,
            })),
          ],
        };
      });
    },
    /** 写入同一条操作记录：切换、讲解交接、导览动作。 */
    journal: (event: JournalEvent) => {
      pending.current.push(event);
      setDocument((d) => {
        const next = [...(d.journal || []), ...pending.current];
        pending.current = [];
        return { ...d, journal: next.slice(-MAX_JOURNAL) };
      });
    },
    reset: () => setDocument({ favorites: [], visits: [], notes: {}, journal: [] }),
  };
}
