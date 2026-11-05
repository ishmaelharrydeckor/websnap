import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsConfig } from "./config";
import { cleanProps, track, trackTemplate } from "./track";

describe("analyticsConfig", () => {
  it("is off by default", () => {
    expect(analyticsConfig({})).toBeNull();
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "" })).toBeNull();
  });

  it("configures Umami with a website id and defaults to the cloud script", () => {
    const c = analyticsConfig({ ANALYTICS_PROVIDER: "umami", UMAMI_WEBSITE_ID: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    expect(c?.provider).toBe("umami");
    expect(c?.src).toBe("https://cloud.umami.is/script.js");
    expect(c?.attrs["data-website-id"]).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(c?.attrs["data-do-not-track"]).toBe("true");
  });

  it("configures Plausible with a domain", () => {
    const c = analyticsConfig({ ANALYTICS_PROVIDER: "Plausible", PLAUSIBLE_DOMAIN: "websnap.example.com" });
    expect(c?.provider).toBe("plausible");
    expect(c?.attrs["data-domain"]).toBe("websnap.example.com");
  });

  it("needs the provider's required setting", () => {
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "umami" })).toBeNull();
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "plausible" })).toBeNull();
  });

  it("rejects unknown providers and malformed values", () => {
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "other", UMAMI_WEBSITE_ID: "a1b2c3d4-e5f6" })).toBeNull();
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "umami", UMAMI_WEBSITE_ID: "bad id!" })).toBeNull();
    expect(analyticsConfig({ ANALYTICS_PROVIDER: "plausible", PLAUSIBLE_DOMAIN: "not a domain" })).toBeNull();
  });

  it("only accepts https script addresses", () => {
    const base = { ANALYTICS_PROVIDER: "umami", UMAMI_WEBSITE_ID: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" };
    expect(analyticsConfig({ ...base, UMAMI_SCRIPT_URL: "http://example.com/s.js" })).toBeNull();
    expect(analyticsConfig({ ...base, UMAMI_SCRIPT_URL: "javascript:alert(1)" })).toBeNull();
    expect(analyticsConfig({ ...base, UMAMI_SCRIPT_URL: "https://stats.example.com/script.js" })?.src).toBe("https://stats.example.com/script.js");
  });
});

describe("cleanProps", () => {
  it("keeps simple values and drops anything structured", () => {
    expect(cleanProps({ format: "png", scale: 2, ok: true, nested: { a: 1 }, list: [1], nothing: undefined })).toEqual({ format: "png", scale: 2, ok: true });
  });

  it("caps long strings and returns nothing when empty", () => {
    expect(cleanProps({ note: "x".repeat(500) })?.note).toHaveLength(60);
    expect(cleanProps({})).toBeUndefined();
    expect(cleanProps(undefined)).toBeUndefined();
  });
});

describe("track", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing, and does not throw, when no provider is loaded", () => {
    vi.stubGlobal("window", {});
    expect(() => track("export", { format: "png" })).not.toThrow();
  });

  it("does nothing outside the browser", () => {
    expect(() => track("export")).not.toThrow();
  });

  it("sends to Umami", () => {
    const umami = { track: vi.fn() };
    vi.stubGlobal("window", { umami });
    track("export", { format: "png", scale: 2 });
    expect(umami.track).toHaveBeenCalledWith("export", { format: "png", scale: 2 });
  });

  it("sends to Plausible, with props only when there are some", () => {
    const plausible = vi.fn();
    vi.stubGlobal("window", { plausible });
    track("copy");
    track("export", { format: "webp" });
    expect(plausible).toHaveBeenNthCalledWith(1, "copy", undefined);
    expect(plausible).toHaveBeenNthCalledWith(2, "export", { props: { format: "webp" } });
  });

  it("swallows a failing provider", () => {
    vi.stubGlobal("window", { umami: { track: () => { throw new Error("boom"); } } });
    expect(() => track("export")).not.toThrow();
  });
});

describe("trackTemplate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names built-in and Launch Kit looks but keeps a person's own template names private", () => {
    const umami = { track: vi.fn() };
    vi.stubGlobal("window", { umami });
    trackTemplate({ id: "hero", name: "Hero" }, true);
    trackTemplate({ id: "kit-cloud", name: "Cloud" }, false);
    trackTemplate({ id: "custom-ab12", name: "Secret client look" }, false);
    expect(umami.track).toHaveBeenNthCalledWith(1, "template_applied", { template: "Hero", source: "builtin" });
    expect(umami.track).toHaveBeenNthCalledWith(2, "template_applied", { template: "Cloud", source: "kit" });
    expect(umami.track).toHaveBeenNthCalledWith(3, "template_applied", { source: "custom" });
  });
});
