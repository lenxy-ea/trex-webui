export const EDITOR_SURFACE_MOBILE_QUERY = "(max-width: 1120px)";

export type EditorSurfaceTarget = "builder" | "profile";

export type EditorSurfaceElement = {
  scrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void;
} | null;

export type TextSelectionRange = {
  end: number;
  start: number;
};

export type TextRangeElement = {
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
} | null;

export type EditorSurfaceViewport = {
  matchMedia?: (query: string) => { matches: boolean };
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
};

export function scrollEditorSurfaceIntoView(
  target: EditorSurfaceTarget,
  surfaces: {
    builder: EditorSurfaceElement;
    profile: EditorSurfaceElement;
  },
  viewport: EditorSurfaceViewport | undefined = typeof window === "undefined" ? undefined : window
) {
  const runScroll = () => {
    if (!viewport?.matchMedia?.(EDITOR_SURFACE_MOBILE_QUERY).matches) {
      return;
    }
    const element = target === "builder" ? surfaces.builder : surfaces.profile;
    if (typeof element?.scrollIntoView !== "function") {
      return;
    }
    element.scrollIntoView({ block: "start", inline: "nearest" });
  };

  if (typeof viewport?.requestAnimationFrame === "function") {
    viewport.requestAnimationFrame(() => viewport.requestAnimationFrame?.(runScroll));
    return;
  }
  runScroll();
}

export function selectTextAreaRange(
  textarea: TextRangeElement,
  selection: TextSelectionRange,
  viewport: EditorSurfaceViewport | undefined = typeof window === "undefined" ? undefined : window
) {
  const selectRange = () => {
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
  };

  if (typeof viewport?.requestAnimationFrame === "function") {
    viewport.requestAnimationFrame(selectRange);
    return;
  }
  selectRange();
}
