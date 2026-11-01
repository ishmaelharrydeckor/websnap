import { describe, expect, it } from "vitest";
import type { Background, SceneSettings } from "../document/types";
import { cubeMesh, layoutScene, MESHES, scenePalette, shade, sceneFaces, sphereMesh, torusMesh } from "./scene3d";

const bg: Background = { kind: "gradient", angle: 0, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] };
const scene = (over: Partial<SceneSettings> = {}): SceneSettings => ({ kind: "mix", palette: "auto", seed: 3, size: 1, motion: 0.5, ...over });

describe("meshes", () => {
  it("have unit-length normals and valid face indexes", () => {
    for (const m of [sphereMesh(), torusMesh(), cubeMesh()]) {
      expect(m.normals).toHaveLength(m.verts.length);
      for (const n of m.normals) expect(Math.hypot(...n)).toBeCloseTo(1, 5);
      for (const f of m.faces) for (const i of f) expect(i).toBeLessThan(m.verts.length);
    }
  });
  it("sphere vertices lie on the unit sphere and its normals point outwards", () => {
    const m = sphereMesh();
    m.verts.forEach((v, i) => {
      expect(Math.hypot(...v)).toBeCloseTo(1, 5);
      expect(v[0] * m.normals[i][0] + v[1] * m.normals[i][1] + v[2] * m.normals[i][2]).toBeCloseTo(1, 5);
    });
  });
  it("torus normals point away from the tube's centre line", () => {
    const m = torusMesh(0.36);
    m.verts.forEach((v, i) => {
      const ring = Math.hypot(v[0], v[2]);
      const centre: [number, number, number] = [(v[0] / ring) * 1, 0, (v[2] / ring) * 1];
      const out = [v[0] - centre[0], v[1] - centre[1], v[2] - centre[2]];
      expect(out[0] * m.normals[i][0] + out[1] * m.normals[i][1] + out[2] * m.normals[i][2]).toBeGreaterThan(0.3);
    });
  });
  it("cube faces are flat quads with outward normals", () => {
    const m = cubeMesh();
    expect(m.faces).toHaveLength(6);
    m.faces.forEach((f) => {
      const c = f.reduce((a, i) => [a[0] + m.verts[i][0] / 4, a[1] + m.verts[i][1] / 4, a[2] + m.verts[i][2] / 4], [0, 0, 0]);
      const n = m.normals[f[0]];
      expect(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]).toBeCloseTo(1, 5);
    });
  });
  it("registry has all three shapes", () => expect(Object.keys(MESHES).sort()).toEqual(["cube", "sphere", "torus"]));
});

describe("layoutScene", () => {
  it("is empty for none and repeatable for a seed", () => {
    expect(layoutScene(scene({ kind: "none" }), bg, 1.78)).toEqual([]);
    expect(layoutScene(scene(), bg, 1.78)).toEqual(layoutScene(scene(), bg, 1.78));
    expect(layoutScene(scene({ seed: 4 }), bg, 1.78)).not.toEqual(layoutScene(scene({ seed: 3 }), bg, 1.78));
  });
  it("uses only the shapes of the chosen kind and keeps the middle clear", () => {
    const orbs = layoutScene(scene({ kind: "orbs" }), bg, 1.78);
    expect(orbs.every((s) => s.kind === "sphere")).toBe(true);
    expect(new Set(layoutScene(scene({ kind: "mix" }), bg, 1.78).map((s) => s.kind)).size).toBeGreaterThan(1);
    for (const s of layoutScene(scene({ kind: "mix", seed: 9 }), bg, 1.78)) expect(Math.abs(s.x) > 0.25 || Math.abs(s.y) > 0.22).toBe(true);
  });
  it("puts some shapes in front of the screens", () => {
    const shapes = layoutScene(scene({ kind: "mix" }), bg, 1.78);
    expect(shapes.some((s) => s.z > 0.5)).toBe(true);
    expect(shapes.some((s) => s.z <= 0.5)).toBe(true);
  });
  it("scales shapes with the size setting", () => {
    const a = layoutScene(scene({ size: 0.5 }), bg, 1.78).map((s) => s.r);
    const b = layoutScene(scene({ size: 1.5 }), bg, 1.78).map((s) => s.r);
    a.forEach((r, i) => expect(b[i]).toBeCloseTo(r * 3, 6));
  });
});

describe("scenePalette", () => {
  it("auto follows the background colours and falls back for wallpapers", () => {
    const auto = scenePalette("auto", bg);
    expect(auto.length).toBeGreaterThanOrEqual(3);
    expect(scenePalette("auto", { kind: "wallpaper", id: "x" }).length).toBeGreaterThan(0);
    expect(scenePalette("auto", { kind: "solid", color: "#336699" }).length).toBeGreaterThan(0);
  });
  it("named palettes ignore the background", () => {
    expect(scenePalette("ocean", bg)).toEqual(scenePalette("ocean", { kind: "solid", color: "#000000" }));
  });
});

describe("shade", () => {
  it("is brightest facing the light and darker facing away, with a highlight", () => {
    const lum = (s: string) => s.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
    const lit = shade([200, 80, 80], [-0.4, -0.6, 0.7]);
    const dark = shade([200, 80, 80], [0.6, 0.6, 0.1]);
    expect(lum(lit)).toBeGreaterThan(lum(dark));
    expect(lum(shade([100, 100, 100], [-0.3, -0.45, 0.84]))).toBeGreaterThan(lum(shade([100, 100, 100], [0, 0, 1])));
  });
});

describe("sceneFaces", () => {
  const count = (f: ReturnType<typeof sceneFaces>) => [...f.back, ...f.front].reduce((n, i) => n + (i.kind === "poly" ? i.faces.length : 1), 0);
  it("is empty for none", () => {
    const f = sceneFaces(scene({ kind: "none" }), bg, 1600, 900, 0);
    expect(f.back).toHaveLength(0);
    expect(f.front).toHaveLength(0);
  });
  it("puts shapes behind and in front of the screens, far to near, all with finite coordinates", () => {
    const f = sceneFaces(scene(), bg, 1600, 900, 0);
    expect(f.back.length).toBeGreaterThan(2);
    expect(f.front.length).toBeGreaterThan(0);
    for (const list of [f.back, f.front]) for (let i = 1; i < list.length; i++) expect(list[i].depth).toBeGreaterThanOrEqual(list[i - 1].depth);
    for (const item of [...f.back, ...f.front]) {
      if (item.kind === "ball") expect([item.cx, item.cy, item.r].every(Number.isFinite) && item.r > 0).toBe(true);
      else for (const face of item.faces) for (const [x, y] of face.points) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
  });
  it("orbs are balls, cubes and rings are polygons", () => {
    expect(sceneFaces(scene({ kind: "orbs" }), bg, 1600, 900, 0).back.every((i) => i.kind === "ball")).toBe(true);
    const cubes = sceneFaces(scene({ kind: "cubes" }), bg, 1600, 900, 0);
    expect([...cubes.back, ...cubes.front].every((i) => i.kind === "poly" && i.faces.length >= 1 && i.faces.length <= 3)).toBe(true);
  });
  it("a ring shows about half of its faces (the ones turned towards us)", () => {
    const r = sceneFaces(scene({ kind: "rings" }), bg, 1600, 900, 0);
    const polys = [...r.back, ...r.front].filter((i) => i.kind === "poly");
    const total = polys.length * MESHES.torus.faces.length;
    const shown = polys.reduce((n, i) => n + (i.kind === "poly" ? i.faces.length : 0), 0);
    expect(shown).toBeLessThan(total * 0.7);
    expect(shown).toBeGreaterThan(total * 0.3);
  });
  it("keeps the amount of drawing small enough for smooth playback", () => {
    expect(count(sceneFaces(scene({ kind: "mix" }), bg, 1600, 900, 0))).toBeLessThan(1500);
    expect(count(sceneFaces(scene({ kind: "rings" }), bg, 1600, 900, 0))).toBeLessThan(2000);
  });
  it("moves with time when motion is on, and holds still when it is 0", () => {
    const sig = (f: ReturnType<typeof sceneFaces>) => JSON.stringify([...f.back, ...f.front].map((i) => (i.kind === "ball" ? [Math.round(i.cx), Math.round(i.cy)] : i.faces.slice(0, 5).map((x) => x.points[0].map(Math.round)))));
    expect(sig(sceneFaces(scene({ motion: 1 }), bg, 1600, 900, 0))).not.toBe(sig(sceneFaces(scene({ motion: 1 }), bg, 1600, 900, 2)));
    expect(sig(sceneFaces(scene({ motion: 0 }), bg, 1600, 900, 0))).toBe(sig(sceneFaces(scene({ motion: 0 }), bg, 1600, 900, 5)));
  });
  it("drift shifts back and front layers independently", () => {
    const first = (items: ReturnType<typeof sceneFaces>["back"]) => (items[0].kind === "ball" ? items[0].cx : items[0].faces[0].points[0][0]);
    const a = sceneFaces(scene(), bg, 1600, 900, 0);
    const b = sceneFaces(scene(), bg, 1600, 900, 0, { back: [10, 0], front: [0, 0] });
    expect(first(b.back)).toBeCloseTo(first(a.back) + 10, 6);
    expect(first(b.front)).toBeCloseTo(first(a.front), 6);
  });
});
