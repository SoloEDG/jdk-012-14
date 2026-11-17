/**
 * 关注判定场景集：不依赖浏览器，直接驱动空间层与作品模块的纯函数。
 *
 * 运行：npm run scenarios
 * 这些场景对应实际参观里最容易出错的操作，任何一项回归都说明
 * “切换次数 / 讲解对象 / 有效观看时长”的判定被破坏。
 */
import type { AttentionSnapshot } from "../features/catalog";
import { sampleVisibility } from "../features/space/lib/visibility";
import {
  initialAttention,
  stepAttention,
} from "../features/catalog/lib/attention";
import type { AttentionState } from "../features/catalog/lib/attention";
import { decideHandover } from "../features/narration/lib/handover";
import type {
  ArtworkSighting,
  AudioState,
  Point,
  TourState,
} from "../shared/types";
import { artworks, routes } from "../shared/catalog";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  :: " + detail : ""}`);
  if (!ok) failures++;
}

type Step = {
  now: number;
  dt: number;
  sightings: ArtworkSighting[];
  manual?: { id: string; at: number; hold?: boolean; traveling?: boolean } | null;
  traveling?: boolean;
};

type Run = {
  state: AttentionState;
  switches: string[];
  releases: string[];
  watched: Record<string, number>;
};

function run(steps: Step[], watch = true): Run {
  let state = initialAttention(0);
  const out: Run = { state, switches: [], releases: [], watched: {} };
  for (const step of steps) {
    const r = stepAttention(state, step);
    state = r.state;
    out.state = state;
    for (const e of r.events) {
      if (e.type === "switch") out.switches.push(`${e.from}→${e.to}/${e.reason}@${e.at}`);
      else out.releases.push(`${e.from}→—/${e.reason}@${e.at}`);
    }
    if (watch && state.selected && r.snapshot.selectedVisible) {
      out.watched[state.selected] = (out.watched[state.selected] || 0) + step.dt;
    }
  }
  return out;
}

function geometrySteps(
  posOf: (t: number) => Point,
  yawOf: (t: number) => number,
  seconds: number,
  stepMs = 100,
  manual?: Step["manual"],
  traveling = false,
): Step[] {
  const steps: Step[] = [];
  let first = true;
  for (let t = stepMs; t <= seconds * 1000; t += stepMs) {
    steps.push({
      now: t,
      dt: stepMs / 1000,
      sightings: sampleVisibility(posOf(t), yawOf(t)),
      manual: first ? (manual ?? null) : null,
      traveling,
    });
    first = false;
  }
  return steps;
}

function mk(id: string, score: number): ArtworkSighting {
  return {
    id,
    visible: true,
    inView: true,
    occluded: false,
    frontFacing: true,
    distance: 3,
    angle: 0.3,
    gaze: 0.9,
    score,
  };
}

// ---------- 1. 两幅相邻作品之间不来回闪动 ----------
{
  const steps: Step[] = [];
  let t = 0;
  for (let i = 0; i < 120; i++) {
    t += 100;
    const flip = Math.floor(i / 6) % 2 === 0;
    steps.push({
      now: t,
      dt: 0.1,
      sightings: [
        mk("a1", flip ? 0.52 : 0.49),
        mk("a2", flip ? 0.49 : 0.52),
        mk("a4", 0.1),
      ],
    });
  }
  const r = run(steps);
  check("抖动时只切换一次", r.switches.length === 1, r.switches.join(" "));
}

// ---------- 2. 正面较远胜于侧后方更近 ----------
{
  let found: { x: number; z: number; yaw: number; near: string; far: string } | null =
    null;
  for (let x = -4.4; x <= 4.4 && !found; x += 0.2) {
    for (let z = -6.4; z <= 6.4 && !found; z += 0.2) {
      for (let yaw = -Math.PI; yaw < Math.PI; yaw += 0.05) {
        const s = sampleVisibility({ x, z }, yaw)
          .filter((v) => v.visible && v.score >= 0.18)
          .sort((a, b) => a.distance - b.distance);
        if (s.length < 2) continue;
        const near = s[0];
        const far = s.find((v) => v.distance > near.distance + 0.6);
        if (far && far.score > near.score + 0.08)
          found = { x, z, yaw, near: near.id, far: far.id };
      }
    }
  }
  if (!found) {
    check("存在“正面较远胜出”的构型", false);
  } else {
    const r = run(geometrySteps(() => ({ x: found!.x, z: found!.z }), () => found!.yaw, 3));
    check(
      "正面较远的作品获得介绍",
      r.state.selected === found.far,
      `远=${found.far} 近=${found.near} 选中=${r.state.selected}`,
    );
  }
}

// ---------- 3. 手动选择拥有稳定查看期 ----------
{
  let pair:
    | { x: number; z: number; yaw: number; top: string; second: string }
    | null = null;
  for (let x = -4.6; x <= 4.6 && !pair; x += 0.2) {
    for (let z = -6.4; z <= 6.4 && !pair; z += 0.2) {
      for (let yaw = -Math.PI; yaw < Math.PI; yaw += 0.05) {
        const vis = sampleVisibility({ x, z }, yaw)
          .filter((v) => v.visible)
          .sort((a, b) => b.score - a.score);
        if (vis.length >= 2 && vis[0].score - vis[1].score > 0.2 && vis[1].score > 0.3)
          pair = { x, z, yaw, top: vis[0].id, second: vis[1].id };
      }
    }
  }
  if (!pair) {
    check("存在两件同时可见的作品", false);
  } else {
    const p = pair;
    let t = 0;
    const steps: Step[] = [];
    let manual: Step["manual"] = { id: p.second, at: 0, hold: true };
    for (let i = 0; i < 80; i++) {
      t += 100;
      steps.push({
        now: t,
        dt: 0.1,
        sightings: sampleVisibility({ x: p.x, z: p.z }, p.yaw),
        manual,
      });
      manual = null;
    }
    const r = run(steps);
    const auto = r.switches.filter((s) => s.includes("/attention"));
    check(
      "手动查看期内不被自动切换覆盖",
      r.switches[0].includes(p.second) && auto.length === 0,
      r.switches.join(" "),
    );
    check(
      "手动点击后立刻获得介绍",
      r.switches[0].includes(p.second),
      r.switches.join(" "),
    );
  }
}

// ---------- 4. 快速转身及时交还，且不保留背后的介绍 ----------
{
  const viewing = { x: -3.4, z: -4 };
  const steps = geometrySteps(
    () => viewing,
    (t) => (t < 1000 ? Math.PI / 2 : Math.PI / 2 + Math.PI),
    5,
    100,
    { id: "a1", at: 100, hold: true },
  );
  const r = run(steps);
  check(
    "转身后 3 秒内交出介绍",
    r.state.selected !== "a1",
    `选中=${r.state.selected} 释放=${r.releases.join(" ")}`,
  );
  check("背后作品不会一直被保留", r.releases.some((s) => s.startsWith("a1")), r.releases.join(" "));
}

// ---------- 5. 穿过展台遮挡不产生切换 ----------
{
  let state = initialAttention(0);
  let t = 0;
  let manual: Step["manual"] = { id: "a2", at: 0, hold: true };
  let x = 1.4;
  const switches: string[] = [];
  const releases: string[] = [];
  while (t < 4000) {
    t += 50;
    if (t > 500) x = Math.max(-1.4, 1.4 - ((t - 500) / 1000) * 2.5 * 0.55);
    const r = stepAttention(state, {
      now: t,
      dt: 0.05,
      sightings: sampleVisibility({ x, z: 0.7 }, 0),
      manual,
    });
    manual = null;
    state = r.state;
    for (const e of r.events) {
      if (e.type === "switch") switches.push(`${e.to}@${e.at}`);
      else releases.push(`${e.from}/${e.reason}@${e.at}`);
    }
  }
  check("穿行遮挡不切换也不释放", switches.length === 1 && releases.length === 0, `${switches} | ${releases}`);
  check("穿行后仍回到同一件作品", state.selected === "a2", String(state.selected));
}

// ---------- 6. 低帧率跨过关注边界，判定仍按真实时间推进 ----------
{
  let state = initialAttention(0);
  let manual: Step["manual"] = { id: "a2", at: 0, hold: true };
  let t = 0;
  const switches: string[] = [];
  while (t < 4000) {
    t += 300; // 模拟 ~3fps
    const x = t < 1200 ? 1.4 : Math.max(-1.4, 1.4 - ((t - 1200) / 1000) * 2.5 * 0.55);
    const r = stepAttention(state, {
      now: t,
      dt: 0.3,
      sightings: sampleVisibility({ x, z: 0.7 }, 0),
      manual,
    });
    manual = null;
    state = r.state;
    for (const e of r.events) if (e.type === "switch") switches.push(`${e.to}@${e.at}`);
  }
  check("低帧率下不误切换", switches.length === 1, switches.join(" "));
  check("低帧率下关注仍指向 a2", state.selected === "a2", String(state.selected));
}

// ---------- 7. 刚经过的作品只算路过，不计有效观看 ----------
{
  // 以正常步速走过 a1：视线扫过，但既没有停下也没有转向它。
  const steps = geometrySteps(
    (t) => ({ x: -3.4, z: -6.5 + (t / 4000) * 2.4 }),
    () => Math.PI / 2,
    4,
  );
  const r = run(steps);
  const watched = r.watched;
  check(
    "路过时停留时间不足以构成有效观看",
    Object.values(watched).every((s) => s < 4),
    JSON.stringify(Object.fromEntries(Object.entries(watched).map(([k, v]) => [k, +v.toFixed(1)]))),
  );
}

// ---------- 8. 讲解与导览只在关注成立时交接 ----------
{
  const att = (o: Partial<AttentionSnapshot>) => ({
    active: null,
    nearby: null,
    selectedVisible: false,
    selectedOccluded: false,
    settled: false,
    stableMs: 0,
    visibleIds: [],
    ...o,
  });
  const nar = (o: Partial<AudioState>): AudioState => ({
    artworkId: null,
    elapsed: 0,
    playing: false,
    rate: 1,
    ...o,
  });
  const tour = (o: Partial<TourState>): TourState => ({
    routeId: "nature",
    step: 0,
    phase: "idle",
    ...o,
  });
  const cases: Array<[
    string,
    AttentionSnapshot,
    AudioState,
    TourState,
    string,
  ]> = [
    ["到站并看向本站时开始讲解", att({ active: "a1", settled: true, selectedVisible: true }), nar({}), tour({ phase: "listening" }), "start"],
    ["到站后离开视线时停下讲解", att({}), nar({ artworkId: "a1", playing: true, elapsed: 5 }), tour({ phase: "listening" }), "pause"],
    ["到站后转向别的作品时交接并让位", att({ active: "a2", settled: true, selectedVisible: true }), nar({ artworkId: "a1", playing: true, elapsed: 5 }), tour({ phase: "listening" }), "handover"],
    ["让位后看回本站时恢复", att({ active: "a1", settled: true, selectedVisible: true }), nar({ artworkId: "a1", elapsed: 5 }), tour({ phase: "paused", pausedFrom: "listening", pausedReason: "diverted" }), "resume"],
    ["自由探索时关注未稳定不交接", att({ active: "a2", settled: false }), nar({ artworkId: "a1", playing: true, elapsed: 5 }), tour({}), "none"],
    ["自由探索时视线离开则停讲", att({}), nar({ artworkId: "a1", playing: true, elapsed: 5 }), tour({}), "pause"],
    ["刚点开但未播放时不自动开口", att({ active: "a2", settled: true, selectedVisible: true }), nar({}), tour({}), "none"],
  ];
  for (const [name, a, n, t, expected] of cases) {
    const d = decideHandover(a, n, t, "a1");
    check(name, d.narration === expected, `${d.narration}/${d.tour}`);
  }
}

// ---------- 9. 作品与导览数据自洽 ----------
{
  for (const route of routes) {
    const ok = route.stops.every((id) => artworks.some((a) => a.id === id));
    check(`导览「${route.name}」站点均存在`, ok, route.stops.join(","));
  }
}

console.log(failures ? `\n${failures} 项未通过` : "\n全部通过");
if (failures) {
  // 让 npm run scenarios 以非零状态退出（避免引入 @types/node）。
  (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1;
}
