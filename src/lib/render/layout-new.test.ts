import { describe, expect, it } from "vitest";
import { DEVICE_LIST, DEVICES, getDevice, ROTATABLE } from "../assets/devices";
import { createDefaultDocument } from "../document/defaults";
import type { DesignDocument, LayoutKind } from "../document/types";
import { computeLayout, SLOT_COUNT } from "./layout";
import { wrapLines } from "./render";

const IMG = { width: 1600, height: 1000 };
const doc = (over: (d: DesignDocument) => void = () => {}) => {
  const d = createDefaultDocument();
  over(d);
  return d;
};
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }, tol = 1e-6) =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.width <= outer.x + outer.width + tol && inner.y + inner.height <= outer.y + outer.height + tol;

describe("layout kinds", () => {
  it("each kind makes the right number of screens", () => {
    for (const kind of Object.keys(SLOT_COUNT) as LayoutKind[]) {
      const d = doc((x) => void (x.layout.kind = kind));
      expect(computeLayout(d, [IMG, IMG, IMG, IMG]).slots).toHaveLength(SLOT_COUNT[kind]);
    }
    expect(SLOT_COUNT.quad).toBe(4);
  });

  it("quad puts four screens in a 2 x 2 grid that doesn't overlap", () => {
    const d = doc((x) => void (x.layout.kind = "quad"));
    const { slots } = computeLayout(d, [IMG, IMG, IMG, IMG]);
    const [a, b, c, e] = slots.map((s) => s.cell);
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toBeCloseTo(b.y);
    expect(c.y).toBeGreaterThan(a.y);
    expect(c.x).toBeCloseTo(a.x);
    expect(e.x).toBeCloseTo(b.x);
    for (const s of slots) expect(inside(s.frame, s.cell)).toBe(true);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1e-6);
    expect(a.y + a.height).toBeLessThanOrEqual(c.y + 1e-6);
  });

  it("rise starts partway down and runs off the bottom of the canvas", () => {
    const d = doc((x) => {
      x.layout.kind = "rise";
      x.frame.style = "macbook";
    });
    const f = computeLayout(d, [IMG]).slots[0].frame;
    expect(f.y).toBeGreaterThan(0);
    expect(f.y).toBeLessThan(d.canvas.height * 0.5);
    expect(f.y + f.height).toBeGreaterThan(d.canvas.height); // cropped by the canvas
    expect(f.x).toBeGreaterThan(0);
    expect(f.x + f.width).toBeLessThanOrEqual(d.canvas.width);
    expect(f.x + f.width / 2).toBeCloseTo(d.canvas.width / 2);
  });

  it("bleed runs off the right edge, or off the left when the headline is on the right", () => {
    const right = doc((x) => {
      x.layout.kind = "bleed";
      x.frame.style = "browser";
    });
    expect(computeLayout(right, [IMG]).slots[0].frame.x + computeLayout(right, [IMG]).slots[0].frame.width).toBeGreaterThan(right.canvas.width);
    const left = doc((x) => {
      x.layout.kind = "bleed";
      x.frame.style = "browser";
      x.headline.show = true;
      x.headline.position = "right";
    });
    expect(computeLayout(left, [IMG]).slots[0].frame.x).toBeLessThan(0);
  });

  it("a left headline takes a column and the screens sit to its right", () => {
    const d = doc((x) => {
      x.headline.show = true;
      x.headline.position = "left";
    });
    const { slots, headline } = computeLayout(d, [IMG]);
    expect(headline!.x).toBeLessThan(slots[0].frame.x);
    expect(headline!.x + headline!.width).toBeLessThanOrEqual(slots[0].frame.x + 1e-6);
    expect(headline!.height).toBeGreaterThan(headline!.width * 0.5); // a tall column, not a band
  });

  it("a right headline puts the column on the right", () => {
    const d = doc((x) => {
      x.headline.show = true;
      x.headline.position = "right";
    });
    const { slots, headline } = computeLayout(d, [IMG]);
    expect(headline!.x).toBeGreaterThanOrEqual(slots[0].frame.x + slots[0].frame.width - 1e-6);
  });

  it("on a tall canvas a side headline moves above the screens instead of squeezing them", () => {
    const d = doc((x) => {
      x.canvas = { sizeId: "story", width: 1080, height: 1920 };
      x.headline.show = true;
      x.headline.position = "left";
    });
    const { slots, headline, headlineColumn } = computeLayout(d, [IMG]);
    expect(headlineColumn).toBe(false);
    expect(headline!.y + headline!.height).toBeLessThanOrEqual(slots[0].frame.y + 1e-6);
    d.headline.position = "right";
    const r = computeLayout(d, [IMG]);
    expect(r.headline!.y).toBeGreaterThanOrEqual(r.slots[0].frame.y + r.slots[0].frame.height - 1e-6); // right becomes below
  });

  it("reports a column only when the headline really is one", () => {
    const d = doc((x) => {
      x.headline.show = true;
      x.headline.position = "left";
    });
    expect(computeLayout(d, [IMG]).headlineColumn).toBe(true);
    d.headline.position = "top";
    expect(computeLayout(d, [IMG]).headlineColumn).toBe(false);
    d.headline.show = false;
    d.headline.position = "left";
    expect(computeLayout(d, [IMG]).headlineColumn).toBe(false);
  });

  it("with a side headline hidden, the layout ignores the column", () => {
    const d = doc((x) => {
      x.headline.show = false;
      x.headline.position = "left";
    });
    const { slots, headline } = computeLayout(d, [IMG]);
    expect(headline).toBeUndefined();
    expect(slots[0].frame.x + slots[0].frame.width / 2).toBeCloseTo(d.canvas.width / 2);
  });
});

describe("devices", () => {
  it("every device has a usable screen inside its frame", () => {
    for (const dv of DEVICE_LIST) {
      const r = { x: 100, y: 50, width: 400 * dv.aspect, height: 400 };
      const s = dv.screen(r);
      expect(s.rect.width, dv.id).toBeGreaterThan(r.width * 0.3);
      expect(s.rect.height, dv.id).toBeGreaterThan(r.height * 0.3);
      expect(inside(s.rect, r, 1e-6), `${dv.id} screen inside frame`).toBe(true);
    }
  });

  it("new devices exist", () => {
    for (const id of ["watch", "imac", "tablet"] as const) expect(DEVICES[id].label.length).toBeGreaterThan(0);
  });

  it("rotating swaps the aspect ratio and keeps the screen inside the frame", () => {
    for (const id of ROTATABLE) {
      const normal = getDevice(id, false);
      const turned = getDevice(id, true);
      expect(turned.aspect).toBeCloseTo(1 / normal.aspect, 9);
      const r = { x: 10, y: 20, width: 500, height: 500 / turned.aspect };
      const s = turned.screen(r);
      expect(inside(s.rect, r, 1e-6), id).toBe(true);
      // The screen is rotated too: a phone's tall screen becomes wide.
      const sn = normal.screen({ x: 0, y: 0, width: 400 * normal.aspect, height: 400 });
      expect(s.rect.width / s.rect.height).toBeCloseTo(sn.rect.height / sn.rect.width, 5);
    }
  });

  it("rotation is a no-op for devices that don't rotate", () => {
    expect(getDevice("macbook", true)).toBe(DEVICES.macbook);
    expect(getDevice("watch", true)).toBe(DEVICES.watch);
    expect(getDevice("iphone", false)).toBe(DEVICES.iphone);
  });

  it("layout uses the rotated shape", () => {
    const d = doc((x) => {
      x.frame.style = "iphone";
      x.frame.landscape = true;
    });
    const f = computeLayout(d, [IMG]).slots[0].frame;
    expect(f.width).toBeGreaterThan(f.height);
    d.frame.landscape = false;
    const g = computeLayout(d, [IMG]).slots[0].frame;
    expect(g.height).toBeGreaterThan(g.width);
  });
});

describe("wrapLines", () => {
  const measure = (s: string) => s.length * 10;
  it("breaks at word boundaries within the width", () => {
    expect(wrapLines(measure, "ship pages people remember", 130)).toEqual(["ship pages", "people", "remember"]);
  });
  it("never breaks a single long word and handles empty text", () => {
    expect(wrapLines(measure, "extraordinarily long", 50)).toEqual(["extraordinarily", "long"]);
    expect(wrapLines(measure, "   ", 100)).toEqual([]);
  });
  it("keeps short text on one line", () => {
    expect(wrapLines(measure, "hello world", 500)).toEqual(["hello world"]);
  });
});
