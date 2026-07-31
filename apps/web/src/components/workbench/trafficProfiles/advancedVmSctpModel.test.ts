import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildSctpDataBeginningFragmentFlagVmBody,
  buildSctpDataReservedFlagsIncVmBody,
  buildSctpDestinationPortIncVmBody,
  buildSctpPayloadProtocolIdIncVmBody,
  buildSctpSourcePortIncVmBody,
  buildSctpTsnIncVmBody,
  buildSctpVerificationTagIncVmBody,
  isAdvancedOuterSctpDataStream,
  isAdvancedOuterSctpStream
} from "./advancedVmSctpModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

describe("advancedVmSctpModel", () => {
  const structuredSctpStream = stream({
    l4_dst_port: 1026,
    l4_dst_port_count: 4,
    l4_dst_port_step: 1,
    l4_src_port: 1025,
    l4_src_port_count: 4,
    l4_src_port_step: 1,
    packet_type: "Ethernet/IPv4/SCTP",
    sctp_data_flags: 3,
    sctp_data_flags_count: 4,
    sctp_data_flags_step: 1,
    sctp_payload_protocol_id: 287454020,
    sctp_payload_protocol_id_count: 4,
    sctp_payload_protocol_id_step: 1,
    sctp_tsn: 100,
    sctp_tsn_count: 4,
    sctp_tsn_step: 1,
    sctp_verification_tag: 270544960,
    sctp_verification_tag_count: 4,
    sctp_verification_tag_step: 1
  });

  const rawSctpStream = stream({
    ...structuredSctpStream,
    packet_binary_base64: "qrvM3e7/ABEiM0RVCABFAAA0EjRAAECEAAAKCgoBCgoKAgtZC1oQIDBAAAAAAAADABQAAABkAAcACREiM0Terb7v",
    packet_type: "Ethernet"
  });

  it("recognizes structured and raw SCTP streams", () => {
    expect(isAdvancedOuterSctpStream(structuredSctpStream)).toBe(true);
    expect(isAdvancedOuterSctpDataStream(structuredSctpStream)).toBe(true);
    expect(isAdvancedOuterSctpStream(rawSctpStream)).toBe(true);
    expect(isAdvancedOuterSctpDataStream(rawSctpStream)).toBe(true);
    expect(isAdvancedOuterSctpStream(stream({ packet_type: "Ethernet/IPv4/UDP" }))).toBe(false);
  });

  it("builds structured SCTP number and flag writes", () => {
    expect(buildSctpSourcePortIncVmBody(structuredSctpStream)).toEqual({
      instructions: [
        { init_value: 1025, max_value: 1028, min_value: 1025, name: "sctp_source_port", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "sctp_source_port", pkt_offset: 34, type: "write_flow_var" }
      ],
      split_by_var: "sctp_source_port"
    });
    expect(buildSctpDestinationPortIncVmBody(structuredSctpStream)).toMatchObject({
      instructions: [
        { init_value: 1026, name: "sctp_destination_port", size: 2 },
        { name: "sctp_destination_port", pkt_offset: 36 }
      ],
      split_by_var: "sctp_destination_port"
    });
    expect(buildSctpVerificationTagIncVmBody(structuredSctpStream)).toMatchObject({
      instructions: [
        { init_value: 270544960, name: "sctp_verification_tag", size: 4 },
        { name: "sctp_verification_tag", pkt_offset: 38 }
      ],
      split_by_var: "sctp_verification_tag"
    });
    expect(buildSctpTsnIncVmBody(structuredSctpStream)).toMatchObject({
      instructions: [
        { init_value: 100, name: "sctp_tsn", size: 4 },
        { name: "sctp_tsn", pkt_offset: 50 }
      ],
      split_by_var: "sctp_tsn"
    });
    expect(buildSctpPayloadProtocolIdIncVmBody(structuredSctpStream)).toMatchObject({
      instructions: [
        { init_value: 287454020, name: "sctp_payload_protocol_id", size: 4 },
        { name: "sctp_payload_protocol_id", pkt_offset: 58 }
      ],
      split_by_var: "sctp_payload_protocol_id"
    });
    expect(buildSctpDataBeginningFragmentFlagVmBody(structuredSctpStream)).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "sctp_data_beginning_fragment", op: "dec", size: 1, step: 1, type: "flow_var" },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 2,
          name: "sctp_data_beginning_fragment",
          pkt_cast_size: 1,
          pkt_offset: 47,
          shift: 1,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "sctp_data_beginning_fragment"
    });
    expect(buildSctpDataReservedFlagsIncVmBody(structuredSctpStream)).toMatchObject({
      instructions: [
        { init_value: 0, max_value: 3, name: "sctp_data_reserved_flags", op: "inc" },
        { mask: 240, pkt_offset: 47, shift: 4 }
      ],
      split_by_var: "sctp_data_reserved_flags"
    });
  });

  it("builds raw SCTP DATA writes from imported packet bytes", () => {
    expect(buildSctpSourcePortIncVmBody(rawSctpStream)).toMatchObject({
      instructions: [
        { init_value: 2905, max_value: 2908, name: "sctp_source_port", size: 2 },
        { name: "sctp_source_port", pkt_offset: 34 }
      ]
    });
    expect(buildSctpVerificationTagIncVmBody(rawSctpStream)).toMatchObject({
      instructions: [
        { init_value: 270544960, max_value: 270544963, name: "sctp_verification_tag", size: 4 },
        { name: "sctp_verification_tag", pkt_offset: 38 }
      ]
    });
    expect(buildSctpTsnIncVmBody(rawSctpStream)).toMatchObject({
      instructions: [
        { init_value: 100, max_value: 103, name: "sctp_tsn", size: 4 },
        { name: "sctp_tsn", pkt_offset: 50 }
      ]
    });
    expect(buildSctpDataReservedFlagsIncVmBody(rawSctpStream)).toMatchObject({
      instructions: [
        { init_value: 0, max_value: 3, name: "sctp_data_reserved_flags" },
        { mask: 240, pkt_offset: 47, shift: 4 }
      ]
    });
  });
});
