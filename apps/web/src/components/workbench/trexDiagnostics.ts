import type { TrexResult } from "../../api";

export type TrexDiagnostic = {
  code: "capture_service_mode_flow_stats";
  title: string;
  summary: string;
  action: string;
};

const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

function stripAnsi(value: string) {
  return value.replace(ansiEscapePattern, "");
}

function resultText(result: Pick<TrexResult<unknown>, "blocker" | "error" | "ok"> | null | undefined) {
  if (!result || result.ok) {
    return "";
  }
  return stripAnsi(`${result.blocker ?? ""} ${result.error ?? ""}`).toLowerCase();
}

export function trexResultDiagnostic(
  result: Pick<TrexResult<unknown>, "blocker" | "error" | "ok"> | null | undefined
): TrexDiagnostic | null {
  const text = resultText(result);
  if (text.includes("under service mode") && text.includes("flow_stats")) {
    return {
      code: "capture_service_mode_flow_stats",
      title: "Capture service mode blocks flow stats",
      summary: "TRex cannot start a flow-stats stream while a capture has the peer port in service mode",
      action: "Stop the active capture recorder or disable RX Stats/Latency on the stream before starting traffic"
    };
  }
  return null;
}

export function trexResultDiagnosticMessage(
  result: Pick<TrexResult<unknown>, "blocker" | "error" | "ok"> | null | undefined
) {
  const diagnostic = trexResultDiagnostic(result);
  return diagnostic ? `${diagnostic.title}: ${diagnostic.action}` : null;
}
