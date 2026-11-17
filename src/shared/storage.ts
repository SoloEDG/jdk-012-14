import type { GalleryDocument, JournalEvent } from "./types";
const key = "yujing-gallery-v1";
export const emptyDocument = (): GalleryDocument => ({
  favorites: [],
  visits: [],
  notes: {},
  journal: [],
});
export function loadDocument(): GalleryDocument {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "null");
    if (!d) return emptyDocument();
    return {
      favorites: Array.isArray(d.favorites)
        ? d.favorites.filter((v: unknown) => typeof v === "string")
        : [],
      visits: Array.isArray(d.visits)
        ? d.visits
            .filter(
              (v: { id?: unknown; seconds?: unknown }) =>
                typeof v.id === "string" && typeof v.seconds === "number",
            )
            .map(
              (v: {
                id: string;
                seconds: number;
                at?: number;
                approachSeconds?: number;
              }) => ({
                id: v.id,
                seconds: v.seconds,
                at: typeof v.at === "number" ? v.at : 0,
                approachSeconds:
                  typeof v.approachSeconds === "number"
                    ? v.approachSeconds
                    : v.seconds,
              }),
            )
        : [],
      notes: typeof d.notes === "object" && d.notes ? d.notes : {},
      journal: Array.isArray(d.journal)
        ? d.journal.filter(
            (e: Partial<JournalEvent>) =>
              e && typeof e.at === "number" && typeof e.type === "string",
          )
        : [],
    };
  } catch {
    return emptyDocument();
  }
}
export function saveDocument(d: GalleryDocument): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
