import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { FloatingWindow } from "./FloatingWindow";

afterEach(() => {
  cleanup();
});

function FloatingWindowHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">Open diagnostics</button>
      {isOpen ? (
        <FloatingWindow title="Diagnostics" onClose={() => setIsOpen(false)}>
          <button type="button">Window action</button>
        </FloatingWindow>
      ) : null}
    </>
  );
}

describe("FloatingWindow", () => {
  it("uses its title heading as the accessible dialog name and receives focus when opened", () => {
    render(<FloatingWindowHarness />);
    const launcher = screen.getByRole("button", { name: "Open diagnostics" });
    launcher.focus();

    fireEvent.click(launcher);

    const dialog = screen.getByRole("dialog", { name: "Diagnostics" });
    const heading = within(dialog).getByRole("heading", { level: 2, name: "Diagnostics" });
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(dialog).toHaveFocus();
  });

  it("closes on Escape and restores focus to the launcher", () => {
    render(<FloatingWindowHarness />);
    const launcher = screen.getByRole("button", { name: "Open diagnostics" });
    launcher.focus();
    fireEvent.click(launcher);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Diagnostics" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("restores focus when the title-bar close button is used", () => {
    render(<FloatingWindowHarness />);
    const launcher = screen.getByRole("button", { name: "Open diagnostics" });
    launcher.focus();
    fireEvent.click(launcher);

    fireEvent.click(screen.getByRole("button", { name: "Close Diagnostics" }));

    expect(screen.queryByRole("dialog", { name: "Diagnostics" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });
});
