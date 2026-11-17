export type Point = { x: number; z: number };
export type Artwork = {
  id: string;
  title: string;
  en: string;
  artist: string;
  year: string;
  medium: string;
  color: string;
  position: Point;
  facing: number;
  description: string;
  transcript: string[];
  duration: number;
};
export type Route = {
  id: string;
  name: string;
  subtitle: string;
  stops: string[];
};
export type Visit = {
  id: string;
  /** 有效观看时长（秒）：作品已被认定为当前关注对象时累计。 */
  seconds: number;
  at: number;
  /** 进入过画面的总时长（秒），包含只看了一眼的短暂路过。 */
  approachSeconds?: number;
  lastAt?: number;
};
export type JournalEvent = {
  at: number;
  type: "switch" | "narration" | "tour" | "select" | "watch";
  from?: string | null;
  to?: string | null;
  action?: string;
  reason?: string;
  seconds?: number;
};
export type GalleryDocument = {
  favorites: string[];
  visits: Visit[];
  notes: Record<string, string>;
  /** 同一条参观记录：切换、讲解交接与观看时长都写在这里。 */
  journal?: JournalEvent[];
};
export type TourPhase = "idle" | "walking" | "listening" | "paused" | "done";
export type TourState = {
  routeId: string | null;
  step: number;
  phase: TourPhase;
  /** 暂停前所处的阶段，用于恢复到正确的讲解/行走状态。 */
  pausedFrom?: Exclude<TourPhase, "idle" | "paused" | "done">;
  /** 暂停原因：用户主动暂停，或因关注转移到别的作品而让位。 */
  pausedReason?: "user" | "diverted";
};
export type AudioState = {
  artworkId: string | null;
  elapsed: number;
  playing: boolean;
  rate: number;
};
/** 空间层给出的可见性线索：作品是否在视野内、是否被展台遮挡、是否正面朝向。 */
export type ArtworkSighting = {
  id: string;
  visible: boolean;
  inView: boolean;
  occluded: boolean;
  frontFacing: boolean;
  /** 到观看点的距离（米）。 */
  distance: number;
  /** 视线与作品法线的夹角（弧度）。 */
  angle: number;
  /** 视线与作品法线夹角的余弦，1 为完全正面。 */
  gaze: number;
  /** 观看一致性得分，0~1，越大越适合成为介绍对象。 */
  score: number;
};
export type Command =
  { type: "focus"; id: string } | { type: "favorite"; id: string };
