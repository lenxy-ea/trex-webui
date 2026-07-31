import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../api";
import type {
  BuildRunReportInput,
  RunReportCaptureFile,
  RunReportTrafficSession
} from "./runReport";
import {
  buildRunReportCsv,
  buildRunReportCsvFromArchiveContent,
  buildRunReportPdf,
  buildRunReportPdfFromArchiveContent,
  buildRunReportSnapshot,
  runReportCsvFileName,
  runReportPdfFileName
} from "./runReport";

export { describe, expect, it };
export type {
  BuildRunReportInput,
  ProfileWorkbenchStream,
  RunReportCaptureFile,
  RunReportTrafficSession
};
export {
  buildRunReportCsv,
  buildRunReportCsvFromArchiveContent,
  buildRunReportPdf,
  buildRunReportPdfFromArchiveContent,
  buildRunReportSnapshot,
  runReportCsvFileName,
  runReportPdfFileName
};

export function ipv4EnvelopeFields(protocol: string, totalLength: string) {
  return [
    { name: "Protocol", value: protocol },
    { name: "Header Length", value: "20" },
    { name: "Total Length", value: totalLength }
  ];
}

export function ipv6EnvelopeFields(nextHeader: string, payloadLength: string) {
  return [
    { name: "Next Header", value: nextHeader },
    { name: "Payload Length", value: payloadLength }
  ];
}
