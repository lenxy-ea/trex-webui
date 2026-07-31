import { describe, expect, it, vi } from "vitest";

import {
  EDITOR_SURFACE_MOBILE_QUERY,
  scrollEditorSurfaceIntoView,
  selectTextAreaRange
} from "./workspaceViewport";

function surface() {
  return {
    scrollIntoView: vi.fn()
  };
}

describe("traffic profile workspace viewport helpers", () => {
  it("scrolls the selected editor surface on compact windows", () => {
    const builder = surface();
    const profile = surface();
    const matchMedia = vi.fn(() => ({ matches: true }));

    scrollEditorSurfaceIntoView("builder", { builder, profile }, { matchMedia });
    scrollEditorSurfaceIntoView("profile", { builder, profile }, { matchMedia });

    expect(matchMedia).toHaveBeenCalledWith(EDITOR_SURFACE_MOBILE_QUERY);
    expect(builder.scrollIntoView).toHaveBeenCalledWith({ block: "start", inline: "nearest" });
    expect(profile.scrollIntoView).toHaveBeenCalledWith({ block: "start", inline: "nearest" });
  });

  it("does not scroll on wide windows", () => {
    const builder = surface();
    const profile = surface();

    scrollEditorSurfaceIntoView("builder", { builder, profile }, {
      matchMedia: () => ({ matches: false })
    });

    expect(builder.scrollIntoView).not.toHaveBeenCalled();
    expect(profile.scrollIntoView).not.toHaveBeenCalled();
  });

  it("ignores missing editor surfaces", () => {
    expect(() =>
      scrollEditorSurfaceIntoView("profile", { builder: surface(), profile: null }, {
        matchMedia: () => ({ matches: true })
      })
    ).not.toThrow();
  });

  it("defers scrolling through animation frames when available", () => {
    const builder = surface();
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });

    scrollEditorSurfaceIntoView("builder", { builder, profile: surface() }, {
      matchMedia: () => ({ matches: true }),
      requestAnimationFrame
    });

    expect(builder.scrollIntoView).not.toHaveBeenCalled();
    callbacks.shift()?.(1);
    expect(builder.scrollIntoView).not.toHaveBeenCalled();
    callbacks.shift()?.(2);
    expect(builder.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("selects a text range immediately when animation frames are unavailable", () => {
    const textarea = {
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    };

    selectTextAreaRange(textarea, { start: 4, end: 8 }, {});

    expect(textarea.focus).toHaveBeenCalledTimes(1);
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(4, 8);
  });

  it("defers text range selection through animation frames when available", () => {
    const textarea = {
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    };
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });

    selectTextAreaRange(textarea, { start: 1, end: 3 }, { requestAnimationFrame });

    expect(textarea.focus).not.toHaveBeenCalled();
    callbacks.shift()?.(1);
    expect(textarea.focus).toHaveBeenCalledTimes(1);
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(1, 3);
  });

  it("ignores missing text range targets", () => {
    expect(() => selectTextAreaRange(null, { start: 0, end: 1 }, {})).not.toThrow();
  });
});
