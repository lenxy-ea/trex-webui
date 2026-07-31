import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type FloatingWindowProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "default" | "wide" | "large" | "compact" | "connect";
  variant?: "default" | "about";
};

export function FloatingWindow({ title, children, onClose, size = "default", variant = "default" }: FloatingWindowProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = `${useId()}-title`;
  const className = [
    "floating-window",
    size === "wide" ? "floating-window--wide" : "",
    size === "large" ? "floating-window--large" : "",
    size === "compact" ? "floating-window--compact" : "",
    size === "connect" ? "floating-window--connect" : "",
    variant === "about" ? "floating-window--about" : ""
  ].filter(Boolean).join(" ");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }

      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      aria-labelledby={titleId}
      className={className}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="floating-window-title">
        <h2 className="floating-window-heading" id={titleId}>{title}</h2>
        <button aria-label={`Close ${title}`} onClick={onClose} title={`Close ${title}`} type="button">
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="floating-window-body">{children}</div>
      {size === "wide" || size === "large" ? (
        <span className="floating-window-resize-cue" aria-hidden="true" />
      ) : null}
    </div>
  );
}
