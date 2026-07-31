import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataSctpHandlers } from "./workspaceProtocolDataSctpHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataSctpHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataSctpHandlers", () => {
  it("binds SCTP DATA header field edits", () => {
    const { handlers, patches } = collectHandlers({
      sctp_verification_tag_mode: "Fixed",
      sctp_data_flags_mode: "Fixed",
      sctp_tsn_mode: "Fixed",
      sctp_stream_id_mode: "Fixed",
      sctp_stream_sequence_mode: "Fixed",
      sctp_payload_protocol_id_mode: "Fixed"
    } as ProfileWorkbenchStream);

    expect(handlers.changeSctpNumber("verification-tag", 0x10203040)).toBe(true);
    expect(handlers.changeSctpMode("verification-tag", "Increment")).toBe(true);
    expect(handlers.changeSctpCount("verification-tag", 4)).toBe(true);
    expect(handlers.changeSctpStep("verification-tag", 1)).toBe(true);
    expect(handlers.changeSctpNumber("data-flags", 3)).toBe(true);
    expect(handlers.changeSctpMode("data-flags", "Decrement")).toBe(true);
    expect(handlers.changeSctpCount("data-flags", 5)).toBe(true);
    expect(handlers.changeSctpStep("data-flags", 2)).toBe(true);
    expect(handlers.changeSctpNumber("tsn", 100)).toBe(true);
    expect(handlers.changeSctpMode("tsn", "Random")).toBe(true);

    expect(patches).toEqual([
      { sctp_verification_tag: 0x10203040 },
      {
        sctp_checksum: "00000000",
        sctp_checksum_override: true,
        sctp_verification_tag_mode: "Increment"
      },
      { sctp_verification_tag_count: 4 },
      { sctp_verification_tag_step: 1 },
      { sctp_data_flags: 3 },
      {
        sctp_checksum: "00000000",
        sctp_checksum_override: true,
        sctp_data_flags_mode: "Decrement"
      },
      { sctp_data_flags_count: 5 },
      { sctp_data_flags_step: 2 },
      { sctp_tsn: 100 },
      {
        sctp_checksum: "00000000",
        sctp_checksum_override: true,
        sctp_tsn_mode: "Random"
      }
    ]);
  });

  it("binds SCTP DATA stream and payload protocol edits", () => {
    const { handlers, patches } = collectHandlers({
      sctp_checksum: "B3E3B3E3",
      sctp_checksum_override: false,
      sctp_stream_id_mode: "Fixed",
      sctp_stream_sequence_mode: "Fixed",
      sctp_payload_protocol_id_mode: "Fixed"
    } as ProfileWorkbenchStream);

    expect(handlers.changeSctpNumber("stream-id", 7)).toBe(true);
    expect(handlers.changeSctpMode("stream-id", "Increment")).toBe(true);
    expect(handlers.changeSctpCount("stream-id", 3)).toBe(true);
    expect(handlers.changeSctpStep("stream-id", 1)).toBe(true);
    expect(handlers.changeSctpNumber("stream-sequence", 9)).toBe(true);
    expect(handlers.changeSctpMode("stream-sequence", "Decrement")).toBe(true);
    expect(handlers.changeSctpNumber("payload-protocol-id", 132)).toBe(true);
    expect(handlers.changeSctpMode("payload-protocol-id", "Fixed")).toBe(true);

    expect(patches).toEqual([
      { sctp_stream_id: 7 },
      {
        sctp_checksum: "00000000",
        sctp_checksum_override: true,
        sctp_stream_id_mode: "Increment"
      },
      { sctp_stream_id_count: 3 },
      { sctp_stream_id_step: 1 },
      { sctp_stream_sequence: 9 },
      {
        sctp_checksum: "00000000",
        sctp_checksum_override: true,
        sctp_stream_sequence_mode: "Decrement"
      },
      { sctp_payload_protocol_id: 132 },
      {
        sctp_checksum: "B3E3B3E3",
        sctp_checksum_override: false,
        sctp_payload_protocol_id_mode: "Fixed"
      }
    ]);
  });

  it("binds SCTP checksum edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeSctpChecksumOverride(true)).toBe(true);
    expect(handlers.changeSctpChecksum("B3E3B3E3")).toBe(true);

    expect(patches).toEqual([
      { sctp_checksum_override: true },
      { sctp_checksum: "B3E3B3E3" }
    ]);
  });

  it("requires a selected stream only for checksum-coupled SCTP mode edits", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeSctpNumber("tsn", 100)).toBe(true);
    expect(handlers.changeSctpMode("tsn", "Increment")).toBe(false);
    expect(handlers.changeSctpCount("tsn", 4)).toBe(true);
    expect(handlers.changeSctpStep("tsn", 1)).toBe(true);
    expect(handlers.changeSctpChecksum("B3E3B3E3")).toBe(true);

    expect(patches).toEqual([
      { sctp_tsn: 100 },
      { sctp_tsn_count: 4 },
      { sctp_tsn_step: 1 },
      { sctp_checksum: "B3E3B3E3" }
    ]);
  });
});
