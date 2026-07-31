import { describe, expect, it } from "vitest";

import type { TrexCaptureRecord } from "../../api";
import { capturePortSummary, capturePortSummaryFromStatus, capturePortSummaryLabel, captureRecordPorts } from "./capturePortSummary";

describe("capture port summary", () => {
  it("decodes TRex capture filter bitmasks per direction", () => {
    const record: TrexCaptureRecord = {
      id: 3,
      filter: {
        rx: 1,
        tx: 2
      }
    };

    expect(captureRecordPorts(record, "rx")).toEqual([0]);
    expect(captureRecordPorts(record, "tx")).toEqual([1]);
    expect(capturePortSummaryLabel(capturePortSummary([record], 0))).toBe("Rx #3");
    expect(capturePortSummaryLabel(capturePortSummary([record], 1))).toBe("Tx #3");
  });

  it("summarizes active recorders from list and string port filters", () => {
    const records: TrexCaptureRecord[] = [
      {
        id: "rx-a",
        filter: {
          rx: [0, "2"]
        }
      },
      {
        id: "tx-b",
        filter: {
          tx: "0 1"
        }
      }
    ];

    expect(capturePortSummaryLabel(capturePortSummary(records, 0))).toBe("Rx #rx-a / Tx #tx-b");
    expect(capturePortSummaryLabel(capturePortSummary(records, 2))).toBe("Rx #rx-a");
    expect(capturePortSummary(records, 3)).toBeNull();
  });

  it("prefers backend-normalized port usage when status includes it", () => {
    const summary = capturePortSummaryFromStatus(
      {
        captures: [
          {
            id: "raw",
            filter: {
              rx: 0,
              tx: 0
            }
          }
        ],
        port_usage: [
          {
            port: 1,
            rx_recorder_ids: [9],
            tx_recorder_ids: ["tx-a"]
          }
        ]
      },
      1
    );

    expect(capturePortSummaryLabel(summary)).toBe("Rx #9 / Tx #tx-a");
  });
});
