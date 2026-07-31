import {
  App,
  describe,
  expect,
  expectRawIcmpChecksumValid,
  expectRawIpv4ChecksumValid,
  expectRawSctpChecksumValid,
  fireEvent,
  formatTestRawHex,
  installAppTestHooks,
  it,
  openProfilesForBuilder,
  openRawStreamFieldEngine,
  overview,
  packetBytesFromRawHex,
  profileCatalog,
  readAdvancedVmBody,
  render,
  screen,
  selectRawPacketFieldEngineTarget,
  stubFetch,
  vi,
  waitFor,
  within,
  workbenchStream
} from "./test/appTestHarness";

describe("Traffic Profiles / Raw Control Protocols", () => {
  installAppTestHooks();

  it("edits Packet Editor IPv4 SCTP DATA decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAA0EjRAAECEAAAKCgoBCgoKAgtZC1oQIDBAAAAAAAADABQAAABkAAcACREiM0Terb7v";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 34 12 34 40 00 40 84 00 00 0a 0a 0a 01 0a 0a 0a 02 0b 59 0b 5a 10 20 30 40 00 00 00 00 00 03 00 14 00 00 00 64 00 07 00 09 11 22 33 44 de ad be ef";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "sctp-stream",
                packet_type: "Ethernet/IPv4/SCTP",
                frame_length: 70,
                wire_length: 70,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.10.10.1", dst: "10.10.10.2", protocol: 132 } },
                  {
                    name: "SCTP",
                    fields: {
                      source_port: 2905,
                      destination_port: 2906,
                      verification_tag: 270544960,
                      checksum: "00000000"
                    }
                  },
                  {
                    name: "SCTP DATA",
                    fields: { flags: 3, length: 20, tsn: 100, stream_id: 7, stream_sequence: 9, payload_protocol_id: 287454020 }
                  }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field SCTP Source port")).toHaveValue("2905");
    expect(screen.getByLabelText("Raw field SCTP Destination port")).toHaveValue("2906");
    expect(screen.getByLabelText("Raw field SCTP Verification tag")).toHaveValue("270544960");
    expect(screen.getByLabelText("Raw field SCTP DATA Flags")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field SCTP DATA Reserved flags")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field SCTP DATA Immediate SACK")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field SCTP DATA Unordered")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field SCTP DATA Beginning fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field SCTP DATA Ending fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field SCTP DATA TSN")).toHaveValue("100");
    expect(screen.getByLabelText("Raw field SCTP DATA Stream ID")).toHaveValue("7");
    expect(screen.getByLabelText("Raw field SCTP DATA Stream sequence")).toHaveValue("9");
    expect(screen.getByLabelText("Raw field SCTP DATA Payload protocol ID")).toHaveValue("287454020");

    const expectRawSctpCommonFieldEngineTarget = async (
      fieldLabel: string,
      targetName: string,
      expected: { initValue: number; maxValue: number; name: string; offset: number; size: number }
    ) => {
      const body = await selectRawPacketFieldEngineTarget(`SCTP ${fieldLabel}`, targetName);
      expect(body).toEqual({
        instructions: [
          {
            init_value: expected.initValue,
            max_value: expected.maxValue,
            min_value: expected.initValue,
            name: expected.name,
            op: "inc",
            size: expected.size,
            step: 1,
            type: "flow_var"
          },
          {
            add_value: 0,
            is_big_endian: true,
            name: expected.name,
            pkt_offset: expected.offset,
            type: "write_flow_var"
          }
        ],
        split_by_var: expected.name
      });
      expect(body.instructions).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: expect.stringMatching(/checksum/) })])
      );
    };

    await expectRawSctpCommonFieldEngineTarget("Source port", "SCTP src port inc", {
      initValue: 2905,
      maxValue: 2920,
      name: "sctp_source_port",
      offset: 34,
      size: 2
    });
    await expectRawSctpCommonFieldEngineTarget("Destination port", "SCTP dst port inc", {
      initValue: 2906,
      maxValue: 2921,
      name: "sctp_destination_port",
      offset: 36,
      size: 2
    });
    await expectRawSctpCommonFieldEngineTarget("Verification tag", "SCTP verification tag inc", {
      initValue: 270544960,
      maxValue: 270544975,
      name: "sctp_verification_tag",
      offset: 38,
      size: 4
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));

    const sctpDataUnorderedField = await screen.findByLabelText("Raw field SCTP DATA Unordered");
    const applySctpDataUnordered = screen.getByRole("button", { name: "Apply raw field SCTP DATA Unordered" });
    await waitFor(() => expect(applySctpDataUnordered).not.toBeDisabled());
    fireEvent.change(sctpDataUnorderedField, { target: { value: "1" } });
    await waitFor(() => expect(sctpDataUnorderedField).toHaveValue("1"));
    fireEvent.click(applySctpDataUnordered);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "00 07 00 14 00 00 00 64"
    );

    fireEvent.change(sctpDataUnorderedField, { target: { value: "0" } });
    await waitFor(() => expect(sctpDataUnorderedField).toHaveValue("0"));
    fireEvent.click(applySctpDataUnordered);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "00 03 00 14 00 00 00 64"
    );

    fireEvent.change(screen.getByLabelText("Raw field SCTP Destination port"), { target: { value: "2907" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field SCTP Destination port" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain(
      "0b 59 0b 5b 10 20 30 40"
    );

    fireEvent.change(screen.getByLabelText("Raw field SCTP DATA TSN"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field SCTP DATA TSN" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "00 03 00 14 00 00 00 65 00 07"
    );

    fireEvent.change(screen.getByLabelText("Raw field SCTP DATA Payload protocol ID"), { target: { value: "287454021" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field SCTP DATA Payload protocol ID" }));
    const rawHexAfterSctpPayloadProtocolId = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterSctpPayloadProtocolId).toContain("00 07 00 09 11 22 33 45");
    expectRawIpv4ChecksumValid(rawHexAfterSctpPayloadProtocolId, 14);
    expectRawSctpChecksumValid(rawHexAfterSctpPayloadProtocolId, { sctpOffset: 34, length: 32 });

    const useRawSctpDataFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field SCTP DATA ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };
    const expectSctpDataMaskedTarget = (
      vm: unknown,
      expected: { name: string; initValue: number; mask: number; op: "inc" | "dec"; shift: number }
    ) => {
      expect(vm).toEqual(
        expect.objectContaining({
          split_by_var: expected.name,
          instructions: expect.arrayContaining([
            expect.objectContaining({
              init_value: expected.initValue,
              max_value: 1,
              min_value: 0,
              name: expected.name,
              op: expected.op,
              size: 1,
              step: 1,
              type: "flow_var"
            }),
            expect.objectContaining({
              mask: expected.mask,
              name: expected.name,
              pkt_cast_size: 1,
              pkt_offset: 47,
              shift: expected.shift,
              type: "write_mask_flow_var"
            })
          ])
        })
      );
    };

    const immediateSackRawFieldVm = await useRawSctpDataFieldEngineTarget("Immediate SACK");
    expectSctpDataMaskedTarget(immediateSackRawFieldVm, {
      initValue: 0,
      mask: 0x08,
      name: "sctp_data_immediate_sack",
      op: "inc",
      shift: 3
    });
    expect(JSON.stringify(immediateSackRawFieldVm)).not.toContain("sctp_data_beginning_fragment");

    const beginningFragmentRawFieldVm = await useRawSctpDataFieldEngineTarget("Beginning fragment");
    expectSctpDataMaskedTarget(beginningFragmentRawFieldVm, {
      initValue: 1,
      mask: 0x02,
      name: "sctp_data_beginning_fragment",
      op: "dec",
      shift: 1
    });
    expect(JSON.stringify(beginningFragmentRawFieldVm)).not.toContain("sctp_data_ending_fragment");
    expect(JSON.stringify(beginningFragmentRawFieldVm)).not.toContain("sctp_data_unordered");

    const endingFragmentRawFieldVm = await useRawSctpDataFieldEngineTarget("Ending fragment");
    expectSctpDataMaskedTarget(endingFragmentRawFieldVm, {
      initValue: 1,
      mask: 0x01,
      name: "sctp_data_ending_fragment",
      op: "dec",
      shift: 0
    });
    expect(JSON.stringify(endingFragmentRawFieldVm)).not.toContain("sctp_data_beginning_fragment");
  }, 30_000);

  it("edits Packet Editor IPv6 SCTP DATA decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAACQAQCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAAChAAAAAAAAAAEAQQCEjRWeAAAAAAAAwAQAAAAAQACAAMAAAAE";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 24 00 40 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 84 00 00 00 00 00 00 00 04 01 04 02 12 34 56 78 00 00 00 00 00 03 00 10 00 00 00 01 00 02 00 03 00 00 00 04";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "ipv6-sctp-stream",
                packet_type: "Ethernet/IPv6/SCTP",
                frame_length: 90,
                wire_length: 90,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 132 } },
                  { name: "IPv6 Hop-by-Hop", fields: { next_header: 132 } },
                  {
                    name: "SCTP",
                    fields: {
                      source_port: 1025,
                      destination_port: 1026,
                      verification_tag: 305419896,
                      checksum: "00000000"
                    }
                  },
                  {
                    name: "SCTP DATA",
                    fields: { flags: 3, length: 16, tsn: 1, stream_id: 2, stream_sequence: 3, payload_protocol_id: 4 }
                  }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field IPv6 Source")).toHaveValue("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(screen.getByLabelText("Raw field SCTP Source port")).toHaveValue("1025");
    expect(screen.getByLabelText("Raw field SCTP Verification tag")).toHaveValue("305419896");
    expect(screen.getByLabelText("Raw field SCTP DATA Unordered")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field SCTP DATA Beginning fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field SCTP DATA Ending fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field SCTP DATA Stream sequence")).toHaveValue("3");

    const expectRawIpv6SctpCommonFieldEngineTarget = async (
      fieldLabel: string,
      targetName: string,
      expected: { initValue: number; maxValue: number; name: string; offset: number; size: number }
    ) => {
      const body = await selectRawPacketFieldEngineTarget(`SCTP ${fieldLabel}`, targetName);
      expect(body).toEqual({
        instructions: [
          {
            init_value: expected.initValue,
            max_value: expected.maxValue,
            min_value: expected.initValue,
            name: expected.name,
            op: "inc",
            size: expected.size,
            step: 1,
            type: "flow_var"
          },
          {
            add_value: 0,
            is_big_endian: true,
            name: expected.name,
            pkt_offset: expected.offset,
            type: "write_flow_var"
          }
        ],
        split_by_var: expected.name
      });
      expect(body.instructions).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: expect.stringMatching(/checksum/) })])
      );
    };

    await expectRawIpv6SctpCommonFieldEngineTarget("Source port", "SCTP src port inc", {
      initValue: 1025,
      maxValue: 1040,
      name: "sctp_source_port",
      offset: 62,
      size: 2
    });
    await expectRawIpv6SctpCommonFieldEngineTarget("Destination port", "SCTP dst port inc", {
      initValue: 1026,
      maxValue: 1041,
      name: "sctp_destination_port",
      offset: 64,
      size: 2
    });
    await expectRawIpv6SctpCommonFieldEngineTarget("Verification tag", "SCTP verification tag inc", {
      initValue: 305419896,
      maxValue: 305419911,
      name: "sctp_verification_tag",
      offset: 66,
      size: 4
    });

    const unorderedRawFieldVm = await selectRawPacketFieldEngineTarget(
      "SCTP DATA Unordered",
      "SCTP DATA Unordered flag vary"
    );
    expect(unorderedRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "sctp_data_unordered",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x04,
          name: "sctp_data_unordered",
          pkt_cast_size: 1,
          pkt_offset: 75,
          shift: 2,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "sctp_data_unordered"
    });

    const tsnRawFieldVm = await selectRawPacketFieldEngineTarget("SCTP DATA TSN", "SCTP TSN inc");
    expect(tsnRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 16,
          min_value: 1,
          name: "sctp_tsn",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "sctp_tsn",
          pkt_offset: 78,
          type: "write_flow_var"
        }
      ],
      split_by_var: "sctp_tsn"
    });

    const payloadProtocolRawFieldVm = await selectRawPacketFieldEngineTarget(
      "SCTP DATA Payload protocol ID",
      "SCTP payload protocol ID inc"
    );
    expect(payloadProtocolRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 4,
          max_value: 19,
          min_value: 4,
          name: "sctp_payload_protocol_id",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "sctp_payload_protocol_id",
          pkt_offset: 86,
          type: "write_flow_var"
        }
      ],
      split_by_var: "sctp_payload_protocol_id"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const sctpTargetMap = screen.getByLabelText("Field Engine target map");
    const selectSctpTarget = async (name: string) => {
      const targetButton = within(sctpTargetMap).getByRole("button", { name });
      await waitFor(() => expect(targetButton).not.toBeDisabled());
      fireEvent.click(targetButton);
      return JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    };

    let selectedTarget = await selectSctpTarget("Use SCTP src port inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_source_port", init_value: 1025, size: 2 }),
        expect.objectContaining({ name: "sctp_source_port", type: "write_flow_var", pkt_offset: 62 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    selectedTarget = await selectSctpTarget("Use SCTP dst port inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_destination_port", init_value: 1026, size: 2 }),
        expect.objectContaining({ name: "sctp_destination_port", type: "write_flow_var", pkt_offset: 64 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    selectedTarget = await selectSctpTarget("Use SCTP verification tag inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_verification_tag", init_value: 305419896, max_value: 305419911 }),
        expect.objectContaining({ name: "sctp_verification_tag", type: "write_flow_var", pkt_offset: 66 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    selectedTarget = await selectSctpTarget("Use SCTP DATA flags inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_flags", init_value: 3, max_value: 18 }),
        expect.objectContaining({ name: "sctp_data_flags", type: "write_flow_var", pkt_offset: 75 })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP DATA reserved flags inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_reserved_flags", init_value: 0, max_value: 3, size: 1 }),
        expect.objectContaining({
          mask: 0xf0,
          name: "sctp_data_reserved_flags",
          pkt_offset: 75,
          shift: 4,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP DATA Immediate SACK flag vary Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_immediate_sack", init_value: 0, max_value: 1, op: "inc" }),
        expect.objectContaining({
          mask: 0x08,
          name: "sctp_data_immediate_sack",
          pkt_offset: 75,
          shift: 3,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP DATA Unordered flag vary Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_unordered", init_value: 0, max_value: 1, op: "inc" }),
        expect.objectContaining({
          mask: 0x04,
          name: "sctp_data_unordered",
          pkt_offset: 75,
          shift: 2,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP DATA Beginning fragment flag vary Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_beginning_fragment", init_value: 1, max_value: 1, op: "dec" }),
        expect.objectContaining({
          mask: 0x02,
          name: "sctp_data_beginning_fragment",
          pkt_offset: 75,
          shift: 1,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP DATA Ending fragment flag vary Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_ending_fragment", init_value: 1, max_value: 1, op: "dec" }),
        expect.objectContaining({
          mask: 0x01,
          name: "sctp_data_ending_fragment",
          pkt_offset: 75,
          shift: 0,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP TSN inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_tsn", init_value: 1, max_value: 16 }),
        expect.objectContaining({ name: "sctp_tsn", type: "write_flow_var", pkt_offset: 78 })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP stream ID inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_stream_id", init_value: 2, max_value: 17 }),
        expect.objectContaining({ name: "sctp_stream_id", type: "write_flow_var", pkt_offset: 82 })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP stream sequence inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_stream_sequence", init_value: 3, max_value: 18 }),
        expect.objectContaining({ name: "sctp_stream_sequence", type: "write_flow_var", pkt_offset: 84 })
      ])
    );

    selectedTarget = await selectSctpTarget("Use SCTP payload protocol ID inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_payload_protocol_id", init_value: 4, max_value: 19 }),
        expect.objectContaining({ name: "sctp_payload_protocol_id", type: "write_flow_var", pkt_offset: 86 })
      ])
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyVerificationTag = screen.getByRole("button", { name: "Apply raw field SCTP Verification tag" });
    fireEvent.change(screen.getByLabelText("Raw field SCTP Verification tag"), { target: { value: "305419897" } });
    await waitFor(() => expect(applyVerificationTag).not.toBeDisabled());
    fireEvent.click(applyVerificationTag);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "04 01 04 02 12 34 56 79"
    );

    const applyStreamSequence = screen.getByRole("button", { name: "Apply raw field SCTP DATA Stream sequence" });
    fireEvent.change(screen.getByLabelText("Raw field SCTP DATA Stream sequence"), { target: { value: "4" } });
    await waitFor(() => expect(applyStreamSequence).not.toBeDisabled());
    fireEvent.click(applyStreamSequence);
    const rawHexAfterIpv6Sctp = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterIpv6Sctp.replace(/\s+/g, " ")).toContain(
      "00 00 00 01 00 02 00 04 00 00 00 04"
    );
    expectRawSctpChecksumValid(rawHexAfterIpv6Sctp, { sctpOffset: 62, length: 28 });
  }, 60_000);

  it("edits Packet Editor ARP decoded fields into the raw packet draft", async () => {
    const packetBinary = "////////ABEiM0RVCAYAAQgABgQAAQARIjNEVRAAAAFmVUQzIhEwAAAB";
    const packetHex =
      "ff ff ff ff ff ff 00 11 22 33 44 55 08 06 00 01 08 00 06 04 00 01 00 11 22 33 44 55 10 00 00 01 66 55 44 33 22 11 30 00 00 01";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "arp-stream",
                packet_type: "Ethernet/ARP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU....." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0806" } },
                  { name: "ARP", fields: { operation: 1, sender_ip: "16.0.0.1", target_ip: "48.0.0.1" } }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field ARP Sender IP")).toHaveValue("16.0.0.1");
    expect(screen.getByLabelText("Raw field ARP Operation")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ARP Target MAC")).toHaveValue("66:55:44:33:22:11");

    fireEvent.change(screen.getByLabelText("Raw field ARP Sender IP"), { target: { value: "16.0.0.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field ARP Sender IP" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain(
      "00 11 22 33 44 55 10 00 00 09"
    );

    fireEvent.change(screen.getByLabelText("Raw field ARP Operation"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field ARP Operation" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("08 00 06 04 00 02");
  });

  it("uses ARP Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = packetBytesFromRawHex(
      "ff ff ff ff ff ff 00 11 22 33 44 55 08 06 00 01 08 00 06 04 00 01 00 11 22 33 44 55 10 00 00 0a 66 55 44 33 22 10 30 00 00 14"
    );

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet/ARP"
      }),
      "Ethernet/ARP",
      [
        { name: "Ethernet", fields: { type: "0x0806" } },
        {
          name: "ARP",
          fields: {
            operation: 1,
            sender_ip: "16.0.0.10",
            sender_mac: "00:11:22:33:44:55",
            target_ip: "48.0.0.20",
            target_mac: "66:55:44:33:22:10"
          }
        }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field ARP Operation")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ARP Sender MAC")).toHaveValue("00:11:22:33:44:55");
    expect(screen.getByLabelText("Raw field ARP Sender IP")).toHaveValue("16.0.0.10");
    expect(screen.getByLabelText("Raw field ARP Target MAC")).toHaveValue("66:55:44:33:22:10");
    expect(screen.getByLabelText("Raw field ARP Target IP")).toHaveValue("48.0.0.20");

    const useRawArpFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field ARP ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    expect(await useRawArpFieldEngineTarget("Operation")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "arp_operation", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_operation", pkt_offset: 20, type: "write_flow_var" }
      ],
      split_by_var: "arp_operation"
    });

    expect(await useRawArpFieldEngineTarget("Sender IP")).toEqual({
      instructions: [
        { init_value: 10, max_value: 25, min_value: 10, name: "arp_sender_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_sender_ip", pkt_offset: 31, type: "write_flow_var" }
      ],
      split_by_var: "arp_sender_ip"
    });

    expect(await useRawArpFieldEngineTarget("Target IP")).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "arp_target_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_target_ip", pkt_offset: 41, type: "write_flow_var" }
      ],
      split_by_var: "arp_target_ip"
    });

    expect(await useRawArpFieldEngineTarget("Sender MAC")).toEqual({
      instructions: [
        { init_value: 85, max_value: 100, min_value: 85, name: "arp_sender_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_sender_mac", pkt_offset: 27, type: "write_flow_var" }
      ],
      split_by_var: "arp_sender_mac"
    });

    expect(await useRawArpFieldEngineTarget("Target MAC")).toEqual({
      instructions: [
        { init_value: 16, max_value: 31, min_value: 16, name: "arp_target_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_target_mac", pkt_offset: 37, type: "write_flow_var" }
      ],
      split_by_var: "arp_target_mac"
    });
  }, 30_000);

  it("uses VLAN ARP Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 81 00 00 64 08 06"
      + "00 01 08 00 06 04 00 02 00 11 22 33 44 50 0a 00 00 0a"
      + "66 55 44 33 22 10 0a 00 00 14"
    );

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/VLAN/ARP",
      [
        { name: "Ethernet", fields: { type: "0x8100" } },
        { name: "802.1Q VLAN", fields: { vlan: 100 } },
        {
          name: "ARP",
          fields: {
            operation: 2,
            sender_ip: "10.0.0.10",
            sender_mac: "00:11:22:33:44:50",
            target_ip: "10.0.0.20",
            target_mac: "66:55:44:33:22:10"
          }
        }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field ARP Operation")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field ARP Sender MAC")).toHaveValue("00:11:22:33:44:50");
    expect(screen.getByLabelText("Raw field ARP Sender IP")).toHaveValue("10.0.0.10");
    expect(screen.getByLabelText("Raw field ARP Target MAC")).toHaveValue("66:55:44:33:22:10");
    expect(screen.getByLabelText("Raw field ARP Target IP")).toHaveValue("10.0.0.20");

    expect(await selectRawPacketFieldEngineTarget("ARP Operation", "ARP operation inc")).toEqual({
      instructions: [
        { init_value: 2, max_value: 5, min_value: 2, name: "arp_operation", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_operation", pkt_offset: 24, type: "write_flow_var" }
      ],
      split_by_var: "arp_operation"
    });

    expect(await selectRawPacketFieldEngineTarget("ARP Sender IP", "ARP sender IP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 25, min_value: 10, name: "arp_sender_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_sender_ip", pkt_offset: 35, type: "write_flow_var" }
      ],
      split_by_var: "arp_sender_ip"
    });

    expect(await selectRawPacketFieldEngineTarget("ARP Target IP", "ARP target IP inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "arp_target_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_target_ip", pkt_offset: 45, type: "write_flow_var" }
      ],
      split_by_var: "arp_target_ip"
    });

    expect(await selectRawPacketFieldEngineTarget("ARP Sender MAC", "ARP sender MAC inc")).toEqual({
      instructions: [
        { init_value: 80, max_value: 95, min_value: 80, name: "arp_sender_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_sender_mac", pkt_offset: 31, type: "write_flow_var" }
      ],
      split_by_var: "arp_sender_mac"
    });

    expect(await selectRawPacketFieldEngineTarget("ARP Target MAC", "ARP target MAC inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 31, min_value: 16, name: "arp_target_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_target_mac", pkt_offset: 41, type: "write_flow_var" }
      ],
      split_by_var: "arp_target_mac"
    });
  }, 30_000);

  it("edits Packet Editor IPv4 and ICMP decoded fields into the raw packet draft", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c, 0x12, 0x34, 0x40, 0x00, 0x40, 0x01, 0x00, 0x00, 0xc0, 0x00,
      0x02, 0x01, 0xc0, 0x00, 0x02, 0x02, 0x08, 0x00, 0xbe, 0xef, 0x12, 0x34, 0x00, 0x07
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const packetHex = formatTestRawHex(rawPacket);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "icmp-stream",
                packet_type: "Ethernet/IPv4/ICMP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { source: "192.0.2.1", destination: "192.0.2.2", protocol: 1 } },
                  { name: "ICMP", fields: { type: 8, code: 0, identifier: 4660, sequence: 7 } }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field IPv4 Source")).toHaveValue("192.0.2.1");
    expect(screen.getByLabelText("Raw field ICMP Type")).toHaveValue("8");
    expect(screen.getByLabelText("Raw field ICMP Code")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field ICMP Identifier")).toHaveValue("4660");
    expect(screen.getByLabelText("Raw field ICMP Sequence")).toHaveValue("7");
    for (const field of ["Type", "Code", "Identifier", "Sequence"]) {
      const row = screen.getByLabelText(`Raw field ICMP ${field}`).closest("tr");
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).queryByRole("button", {
        name: `Use Field Engine target for raw field ICMP ${field}`
      })).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText("Raw field IPv4 Source"), { target: { value: "192.0.2.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 Source" }));
    const rawHexAfterIpv4Source = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterIpv4Source.replace(/\s+/g, " ")).toContain("c0 00 02 09 c0 00 02 02");
    expectRawIpv4ChecksumValid(rawHexAfterIpv4Source, 14);
    expectRawIcmpChecksumValid(rawHexAfterIpv4Source, { ipOffset: 14, ipVersion: 4, icmpOffset: 34 });

    fireEvent.change(screen.getByLabelText("Raw field ICMP Sequence"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field ICMP Sequence" }));
    const rawHexAfterIcmp = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    const rawBytesAfterIcmp = packetBytesFromRawHex(rawHexAfterIcmp);
    expect(rawHexAfterIcmp.replace(/\s+/g, " ")).toContain("12 34 00 08");
    expect(rawBytesAfterIcmp[34]).toBe(8);
    expect(rawBytesAfterIcmp[35]).toBe(0);
    expectRawIpv4ChecksumValid(rawHexAfterIcmp, 14);
    expectRawIcmpChecksumValid(rawHexAfterIcmp, { ipOffset: 14, ipVersion: 4, icmpOffset: 34 });
  });

  it("edits Packet Editor IPv6 and ICMPv6 decoded fields into the raw packet draft", async () => {
    const packetBinary = "MzMAAAABABEiM0RVht1gAAAAAAg6QCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACgAASNBI0AAc=";
    const packetHex =
      "33 33 00 00 00 01 00 11 22 33 44 55 86 dd 60 00 00 00 00 08 3a 40 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 80 00 12 34 12 34 00 07";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "icmpv6-stream",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 66,
                wire_length: 66,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "33.......3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 58 } },
                  { name: "ICMPv6", fields: { type: 128, code: 0, identifier: 4660, sequence: 7 } }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field IPv6 Version")).toHaveValue("6");
    expect(screen.getByLabelText("Raw field IPv6 Traffic class")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Flow label")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Payload length")).toHaveValue("8");
    expect(screen.getByLabelText("Raw field IPv6 Next header")).toHaveValue("58");
    expect(screen.getByLabelText("Raw field IPv6 Hop limit")).toHaveValue("64");
    expect(screen.getByLabelText("Raw field IPv6 Source")).toHaveValue("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(screen.getByLabelText("Raw field IPv6 Destination")).toHaveValue("2001:0db8:0000:0000:0000:0000:0000:0002");
    expect(screen.getByLabelText("Raw field ICMPv6 Type")).toHaveValue("128");
    expect(screen.getByLabelText("Raw field ICMPv6 Code")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field ICMPv6 Identifier")).toHaveValue("4660");
    expect(screen.getByLabelText("Raw field ICMPv6 Sequence")).toHaveValue("7");

    const icmpv6TypeVm = await selectRawPacketFieldEngineTarget("ICMPv6 Type", "ICMPv6 type inc");
    expect(icmpv6TypeVm).toEqual({
      instructions: [
        { init_value: 128, max_value: 143, min_value: 128, name: "icmp_type", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_type", pkt_offset: 54, type: "write_flow_var" },
        { l2_len: 14, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_type"
    });

    const icmpv6CodeVm = await selectRawPacketFieldEngineTarget("ICMPv6 Code", "ICMPv6 code inc");
    expect(icmpv6CodeVm).toEqual({
      instructions: [
        { init_value: 0, max_value: 15, min_value: 0, name: "icmp_code", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_code", pkt_offset: 55, type: "write_flow_var" },
        { l2_len: 14, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_code"
    });

    const icmpv6IdentifierVm = await selectRawPacketFieldEngineTarget("ICMPv6 Identifier", "ICMPv6 identifier inc");
    expect(icmpv6IdentifierVm).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4675, min_value: 4660, name: "icmp_identifier", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_identifier", pkt_offset: 58, type: "write_flow_var" },
        { l2_len: 14, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_identifier"
    });

    const icmpv6SequenceVm = await selectRawPacketFieldEngineTarget("ICMPv6 Sequence", "ICMPv6 sequence inc");
    expect(icmpv6SequenceVm).toEqual({
      instructions: [
        { init_value: 7, max_value: 22, min_value: 7, name: "icmp_sequence", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_sequence", pkt_offset: 60, type: "write_flow_var" },
        { l2_len: 14, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_sequence"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Packet Editor" })).toHaveAttribute("aria-selected", "true"));

    fireEvent.change(screen.getByLabelText("Raw field IPv6 Traffic class"), { target: { value: "171" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv6 Traffic class" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
        "86 dd 6a b0 00 00 00 08 3a 40"
      )
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv6 Flow label"), { target: { value: "74565" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv6 Flow label" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
        "86 dd 6a b1 23 45 00 08 3a 40"
      )
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv6 Destination"), { target: { value: "2001:db8::99" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv6 Destination" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
        "20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 99"
      )
    );

    fireEvent.change(screen.getByLabelText("Raw field ICMPv6 Sequence"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field ICMPv6 Sequence" }));
    const rawHexAfterIcmpv6 = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    const rawBytesAfterIcmpv6 = packetBytesFromRawHex(rawHexAfterIcmpv6);
    expect(rawHexAfterIcmpv6.replace(/\s+/g, " ")).toContain("12 34 00 09");
    expect(rawBytesAfterIcmpv6[54]).toBe(128);
    expect(rawBytesAfterIcmpv6[55]).toBe(0);
    expectRawIcmpChecksumValid(rawHexAfterIcmpv6, { ipOffset: 14, ipVersion: 6, icmpOffset: 54 });
  }, 20_000);

  it("exposes Packet Editor ICMPv6 ND target address as a Field Engine target", async () => {
    const packetBinary = "MzP/AACZABEiM0RVht1gAAAAACA6/yABDbgAAAAAAAAAAAAAAAH/AgAAAAAAAAAAAAH/AACZhwASNAAAAAAgAQ24AAAAAAAAAAAAAACZAQEAESIzRFU=";
    const packetHex =
      "33 33 ff 00 00 99 00 11 22 33 44 55 86 dd 60 00 00 00 00 20 3a ff 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 ff 02 00 00 00 00 00 00 00 00 00 01 ff 00 00 99 87 00 12 34 00 00 00 00 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 99 01 01 00 11 22 33 44 55";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "icmpv6-nd-stream",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 86,
                wire_length: 86,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "33.......3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "ff02::1:ff00:99", next_header: 58 } },
                  { name: "ICMPv6", fields: { type: 135, code: 0, message: "Neighbor Solicitation", target: "2001:db8::99" } }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field ICMPv6 Target address")).toHaveValue(
      "2001:0db8:0000:0000:0000:0000:0000:0099"
    );
    expect(screen.getByLabelText("Raw field ICMPv6 Source Link-Layer Option Link-layer address")).toHaveValue(
      "00:11:22:33:44:55"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const routerFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 NA router flag vary Field Engine target"
    });
    expect(routerFlagTarget).toBeDisabled();
    const ndTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 ND target inc Field Engine target"
    });
    expect(ndTarget).not.toBeDisabled();
    fireEvent.click(ndTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 153,
          max_value: 156,
          min_value: 153,
          name: "icmpv6_nd_target",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_nd_target",
          pkt_offset: 77,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_nd_target"
    });

    const linkLayerMacTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 link-layer MAC inc Field Engine target"
    });
    expect(linkLayerMacTarget).not.toBeDisabled();
    fireEvent.click(linkLayerMacTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 85,
          max_value: 88,
          min_value: 85,
          name: "icmpv6_slla_mac",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_slla_mac",
          pkt_offset: 85,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_slla_mac"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyTarget = screen.getByRole("button", { name: "Apply raw field ICMPv6 Target address" });
    fireEvent.change(screen.getByLabelText("Raw field ICMPv6 Target address"), { target: { value: "2001:db8::9a" } });
    await waitFor(() => expect(applyTarget).not.toBeDisabled());
    fireEvent.click(applyTarget);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 9a 01 01"
    );

    const applyLinkLayer = screen.getByRole("button", {
      name: "Apply raw field ICMPv6 Source Link-Layer Option Link-layer address"
    });
    fireEvent.change(screen.getByLabelText("Raw field ICMPv6 Source Link-Layer Option Link-layer address"), {
      target: { value: "00:11:22:33:44:56" }
    });
    await waitFor(() => expect(applyLinkLayer).not.toBeDisabled());
    fireEvent.click(applyLinkLayer);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "01 01 00 11 22 33 44 56"
    );
  }, 20_000);

  it("exposes Packet Editor ICMPv6 Neighbor Advertisement flags as masked Field Engine targets", async () => {
    const packetBinary = "MzMAAAABABEiM0RVht1gAAAAACA6/yABDbgAAAAAAAAAAAAAAJn/AgAAAAAAAAAAAAAAAAABiAASNGAAAAAgAQ24AAAAAAAAAAAAAACZAgEAESIzRFU=";
    const packetHex =
      "33 33 00 00 00 01 00 11 22 33 44 55 86 dd 60 00 00 00 00 20 3a ff 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 99 ff 02 00 00 00 00 00 00 00 00 00 00 00 00 00 01 88 00 12 34 60 00 00 00 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 99 02 01 00 11 22 33 44 55";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "icmpv6-na-stream",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 86,
                wire_length: 86,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "33.......3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::99", destination: "ff02::1", next_header: 58 } },
                  {
                    name: "ICMPv6",
                    fields: {
                      type: 136,
                      code: 0,
                      message: "Neighbor Advertisement",
                      override: true,
                      router: false,
                      solicited: true,
                      target: "2001:db8::99"
                    }
                  }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field ICMPv6 Router flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field ICMPv6 Solicited flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ICMPv6 Override flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ICMPv6 Target address")).toHaveValue(
      "2001:0db8:0000:0000:0000:0000:0000:0099"
    );
    expect(screen.getByLabelText("Raw field ICMPv6 Target Link-Layer Option Link-layer address")).toHaveValue(
      "00:11:22:33:44:55"
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Use Field Engine target for raw field ICMPv6 Solicited flag"
    }));
    await screen.findByLabelText("Advanced VM JSON");
    const solicitedRawFieldVm = readAdvancedVmBody();
    expect(solicitedRawFieldVm).toEqual(
      expect.objectContaining({
        split_by_var: "icmpv6_na_solicited",
        instructions: expect.arrayContaining([
          expect.objectContaining({
            init_value: 1,
            max_value: 1,
            min_value: 0,
            name: "icmpv6_na_solicited",
            op: "dec",
            size: 1,
            step: 1,
            type: "flow_var"
          }),
          expect.objectContaining({
            mask: 1073741824,
            name: "icmpv6_na_solicited",
            pkt_cast_size: 4,
            pkt_offset: 58,
            shift: 30,
            type: "write_mask_flow_var"
          })
        ])
      })
    );
    expect(JSON.stringify(solicitedRawFieldVm)).not.toContain("icmpv6_na_router");
    expect(JSON.stringify(solicitedRawFieldVm)).not.toContain("icmpv6_na_override");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const routerFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 NA router flag vary Field Engine target"
    });
    expect(routerFlagTarget).not.toBeDisabled();
    fireEvent.click(routerFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_na_router",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 2147483648,
          name: "icmpv6_na_router",
          pkt_cast_size: 4,
          pkt_offset: 58,
          shift: 31,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_na_router"
    });

    const solicitedFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 NA solicited flag vary Field Engine target"
    });
    expect(solicitedFlagTarget).not.toBeDisabled();
    fireEvent.click(solicitedFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_na_solicited",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 1073741824,
          name: "icmpv6_na_solicited",
          pkt_cast_size: 4,
          pkt_offset: 58,
          shift: 30,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_na_solicited"
    });
    expect(screen.getByLabelText("VM icmpv6_na_solicited operation")).toHaveValue("dec");
    expect(screen.getByRole("button", { name: "Reset Params" })).toBeDisabled();
    const solicitedInitInput = screen.getByLabelText("VM icmpv6_na_solicited init value") as HTMLInputElement;
    const solicitedMinInput = screen.getByLabelText("VM icmpv6_na_solicited min value") as HTMLInputElement;
    const solicitedMaxInput = screen.getByLabelText("VM icmpv6_na_solicited max value") as HTMLInputElement;
    const solicitedStepInput = screen.getByLabelText("VM icmpv6_na_solicited step") as HTMLInputElement;
    expect(solicitedInitInput).toHaveAttribute("min", "0");
    expect(solicitedInitInput).toHaveAttribute("max", "1");
    expect(solicitedInitInput).toHaveAttribute("step", "1");
    expect(solicitedInitInput).toHaveAttribute("title", "VM icmpv6_na_solicited init value range: 0..1.");
    expect(solicitedMinInput).toHaveAttribute("min", "0");
    expect(solicitedMinInput).toHaveAttribute("max", "1");
    expect(solicitedMaxInput).toHaveAttribute("min", "0");
    expect(solicitedMaxInput).toHaveAttribute("max", "1");
    expect(solicitedStepInput).toHaveAttribute("min", "1");
    expect(solicitedStepInput).toHaveAttribute("step", "1");
    expect(solicitedMinInput.value).toBe("0");
    expect(solicitedMaxInput.value).toBe("1");
    fireEvent.change(screen.getByLabelText("VM icmpv6_na_solicited operation"), { target: { value: "inc" } });
    expect(solicitedMinInput.value).toBe("1");
    expect(solicitedMaxInput.value).toBe("1");
    fireEvent.change(screen.getByLabelText("VM icmpv6_na_solicited operation"), { target: { value: "random" } });
    expect(solicitedMinInput.value).toBe("0");
    expect(solicitedMaxInput.value).toBe("1");
    fireEvent.change(screen.getByLabelText("VM icmpv6_na_solicited init value"), { target: { value: "2" } });
    expect(screen.getAllByText("VM icmpv6_na_solicited init value must be between 0 and 1.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Insert VM" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Append VM" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", {
      name: "Use ICMPv6 NA solicited flag vary Field Engine target"
    })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Params" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset Params" }));
    expect(screen.queryByText("VM icmpv6_na_solicited init value must be between 0 and 1.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("VM icmpv6_na_solicited operation")).toHaveValue("dec");
    expect(solicitedInitInput.value).toBe("1");
    expect(solicitedMinInput.value).toBe("0");
    expect(solicitedMaxInput.value).toBe("1");
    expect(screen.getByRole("button", { name: "Insert VM" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", {
      name: "Use ICMPv6 NA solicited flag vary Field Engine target"
    })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Params" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    expect(readAdvancedVmBody()).toEqual(
      expect.objectContaining({
        instructions: expect.arrayContaining([
          expect.objectContaining({
            init_value: 1,
            max_value: 1,
            min_value: 0,
            name: "icmpv6_na_solicited",
            op: "dec",
            type: "flow_var"
          })
        ])
      })
    );

    const overrideFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 NA override flag vary Field Engine target"
    });
    expect(overrideFlagTarget).not.toBeDisabled();
    fireEvent.click(overrideFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_na_override",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 536870912,
          name: "icmpv6_na_override",
          pkt_cast_size: 4,
          pkt_offset: 58,
          shift: 29,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_na_override"
    });
  }, 20_000);

  it("edits Packet Editor ICMPv6 Router Advertisement decoded fields into the raw packet draft", async () => {
    const packetBinary =
      "MzMAAAABABEiM0RVht1gAAAAADg6/yABDbgAAAAAAAAAAAAAAAH/AgAAAAAAAAAAAAAAAAABhgASNEDAA4QAAATSAAAWLgEBABEiM0RVAwRAwAAADhAAAAcIAAAAACABDbgBAAAAAAAAAAAAAAA=";
    const packetHex =
      "33 33 00 00 00 01 00 11 22 33 44 55 86 dd 60 00 00 00 00 38 3a ff 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 ff 02 00 00 00 00 00 00 00 00 00 00 00 00 00 01 86 00 12 34 40 c0 03 84 00 00 04 d2 00 00 16 2e 01 01 00 11 22 33 44 55 03 04 40 c0 00 00 0e 10 00 00 07 08 00 00 00 00 20 01 0d b8 01 00 00 00 00 00 00 00 00 00 00 00";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "icmpv6-ra-stream",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 114,
                wire_length: 114,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "33.......3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "ff02::1", next_header: 58 } },
                  {
                    name: "ICMPv6",
                    fields: {
                      type: 134,
                      code: 0,
                      message: "Router Advertisement",
                      current_hop_limit: 64,
                      managed: true,
                      other: true,
                      router_lifetime: 900
                    }
                  }
                ]
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field ICMPv6 Current hop limit")).toHaveValue("64");
    expect(screen.getByLabelText("Raw field ICMPv6 Managed flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ICMPv6 Other flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ICMPv6 Router lifetime")).toHaveValue("900");
    expect(screen.getByLabelText("Raw field ICMPv6 Reachable time")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field ICMPv6 Retrans timer")).toHaveValue("5678");
    expect(screen.getByLabelText("Raw field ICMPv6 Source Link-Layer Option Link-layer address")).toHaveValue(
      "00:11:22:33:44:55"
    );
    expect(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option Prefix length")).toHaveValue("64");
    expect(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option On-link flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option Autonomous flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option Valid lifetime")).toHaveValue("3600");
    expect(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option Preferred lifetime")).toHaveValue("1800");
    expect(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option Prefix")).toHaveValue(
      "2001:0db8:0100:0000:0000:0000:0000:0000"
    );

    const prefixOnLinkRawFieldTargetName =
      "Use Field Engine target for raw field ICMPv6 Prefix Information Option On-link flag";
    await waitFor(() => expect(screen.getByRole("button", { name: prefixOnLinkRawFieldTargetName })).not.toBeDisabled());
    const usePrefixOnLinkRawFieldTarget = screen.getByRole("button", { name: prefixOnLinkRawFieldTargetName });
    fireEvent.click(usePrefixOnLinkRawFieldTarget);
    await screen.findByLabelText("Advanced VM JSON");
    const prefixOnLinkRawFieldVm = readAdvancedVmBody();
    expect(prefixOnLinkRawFieldVm).toEqual(
      expect.objectContaining({
        split_by_var: "icmpv6_ra_prefix_on_link",
        instructions: expect.arrayContaining([
          expect.objectContaining({
            init_value: 1,
            max_value: 1,
            min_value: 0,
            name: "icmpv6_ra_prefix_on_link",
            op: "dec",
            size: 1,
            step: 1,
            type: "flow_var"
          }),
          expect.objectContaining({
            mask: 128,
            name: "icmpv6_ra_prefix_on_link",
            pkt_cast_size: 1,
            pkt_offset: 81,
            shift: 7,
            type: "write_mask_flow_var"
          })
        ])
      })
    );
    expect(JSON.stringify(prefixOnLinkRawFieldVm)).not.toContain("icmpv6_ra_prefix_autonomous");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const managedFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA managed flag vary Field Engine target"
    });
    expect(managedFlagTarget).not.toBeDisabled();
    fireEvent.click(managedFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_ra_managed",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 128,
          name: "icmpv6_ra_managed",
          pkt_cast_size: 1,
          pkt_offset: 59,
          shift: 7,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_managed"
    });

    const otherFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA other flag vary Field Engine target"
    });
    expect(otherFlagTarget).not.toBeDisabled();
    fireEvent.click(otherFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_ra_other",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 64,
          name: "icmpv6_ra_other",
          pkt_cast_size: 1,
          pkt_offset: 59,
          shift: 6,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_other"
    });

    const sourceLinkLayerTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 link-layer MAC inc Field Engine target"
    });
    expect(sourceLinkLayerTarget).not.toBeDisabled();
    fireEvent.click(sourceLinkLayerTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 85,
          max_value: 88,
          min_value: 85,
          name: "icmpv6_slla_mac",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_slla_mac",
          pkt_offset: 77,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_slla_mac"
    });

    const routerLifetimeTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA router lifetime inc Field Engine target"
    });
    expect(routerLifetimeTarget).not.toBeDisabled();
    fireEvent.click(routerLifetimeTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 900,
          max_value: 903,
          min_value: 900,
          name: "icmpv6_ra_router_lifetime",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_router_lifetime",
          pkt_offset: 60,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_router_lifetime"
    });

    const currentHopLimitTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA current hop limit inc Field Engine target"
    });
    expect(currentHopLimitTarget).not.toBeDisabled();
    fireEvent.click(currentHopLimitTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 64,
          max_value: 67,
          min_value: 64,
          name: "icmpv6_ra_current_hop_limit",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_current_hop_limit",
          pkt_offset: 58,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_current_hop_limit"
    });

    const reachableTimeTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA reachable time inc Field Engine target"
    });
    expect(reachableTimeTarget).not.toBeDisabled();
    fireEvent.click(reachableTimeTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1234,
          max_value: 1237,
          min_value: 1234,
          name: "icmpv6_ra_reachable_time",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_reachable_time",
          pkt_offset: 62,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_reachable_time"
    });

    const retransTimerTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA retrans timer inc Field Engine target"
    });
    expect(retransTimerTarget).not.toBeDisabled();
    fireEvent.click(retransTimerTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 5678,
          max_value: 5681,
          min_value: 5678,
          name: "icmpv6_ra_retrans_timer",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_retrans_timer",
          pkt_offset: 66,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_retrans_timer"
    });

    const prefixOnLinkFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA prefix on-link flag vary Field Engine target"
    });
    expect(prefixOnLinkFlagTarget).not.toBeDisabled();
    fireEvent.click(prefixOnLinkFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_ra_prefix_on_link",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 128,
          name: "icmpv6_ra_prefix_on_link",
          pkt_cast_size: 1,
          pkt_offset: 81,
          shift: 7,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_prefix_on_link"
    });

    const prefixAutonomousFlagTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA prefix autonomous flag vary Field Engine target"
    });
    expect(prefixAutonomousFlagTarget).not.toBeDisabled();
    fireEvent.click(prefixAutonomousFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "icmpv6_ra_prefix_autonomous",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 64,
          name: "icmpv6_ra_prefix_autonomous",
          pkt_cast_size: 1,
          pkt_offset: 81,
          shift: 6,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_prefix_autonomous"
    });

    const prefixLengthTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA prefix length inc Field Engine target"
    });
    expect(prefixLengthTarget).not.toBeDisabled();
    fireEvent.click(prefixLengthTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 64,
          max_value: 67,
          min_value: 64,
          name: "icmpv6_ra_prefix_length",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_prefix_length",
          pkt_offset: 80,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_prefix_length"
    });

    const prefixValidLifetimeTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA prefix valid lifetime inc Field Engine target"
    });
    expect(prefixValidLifetimeTarget).not.toBeDisabled();
    fireEvent.click(prefixValidLifetimeTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 3600,
          max_value: 3603,
          min_value: 3600,
          name: "icmpv6_ra_prefix_valid_lifetime",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_prefix_valid_lifetime",
          pkt_offset: 82,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_prefix_valid_lifetime"
    });

    const prefixPreferredLifetimeTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA prefix preferred lifetime inc Field Engine target"
    });
    expect(prefixPreferredLifetimeTarget).not.toBeDisabled();
    fireEvent.click(prefixPreferredLifetimeTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1800,
          max_value: 1803,
          min_value: 1800,
          name: "icmpv6_ra_prefix_preferred_lifetime",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_prefix_preferred_lifetime",
          pkt_offset: 86,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_prefix_preferred_lifetime"
    });

    const prefixTarget = within(targetMap).getByRole("button", {
      name: "Use ICMPv6 RA prefix inc Field Engine target"
    });
    expect(prefixTarget).not.toBeDisabled();
    fireEvent.click(prefixTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "icmpv6_ra_prefix",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "icmpv6_ra_prefix",
          pkt_offset: 109,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          type: "fix_checksum_icmpv6"
        }
      ],
      split_by_var: "icmpv6_ra_prefix"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyOtherFlag = screen.getByRole("button", { name: "Apply raw field ICMPv6 Other flag" });
    fireEvent.change(screen.getByLabelText("Raw field ICMPv6 Other flag"), { target: { value: "0" } });
    await waitFor(() => expect(applyOtherFlag).not.toBeDisabled());
    fireEvent.click(applyOtherFlag);
    const rawHexAfterOtherFlag = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    const rawBytesAfterOtherFlag = packetBytesFromRawHex(rawHexAfterOtherFlag);
    expect(rawBytesAfterOtherFlag[54]).toBe(134);
    expect(rawBytesAfterOtherFlag[55]).toBe(0);
    expect(rawBytesAfterOtherFlag[58]).toBe(64);
    expect(rawBytesAfterOtherFlag[59]).toBe(0x80);
    expect(rawBytesAfterOtherFlag[60]).toBe(0x03);
    expect(rawBytesAfterOtherFlag[61]).toBe(0x84);
    expectRawIcmpChecksumValid(rawHexAfterOtherFlag, { ipOffset: 14, ipVersion: 6, icmpOffset: 54 });

    const applySourceLinkLayer = screen.getByRole("button", {
      name: "Apply raw field ICMPv6 Source Link-Layer Option Link-layer address"
    });
    fireEvent.change(screen.getByLabelText("Raw field ICMPv6 Source Link-Layer Option Link-layer address"), {
      target: { value: "00:aa:bb:cc:dd:ee" }
    });
    await waitFor(() => expect(applySourceLinkLayer).not.toBeDisabled());
    fireEvent.click(applySourceLinkLayer);
    const rawHexAfterSourceLinkLayer = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterSourceLinkLayer.replace(/\s+/g, " ")).toContain("01 01 00 aa bb cc dd ee");
    expectRawIcmpChecksumValid(rawHexAfterSourceLinkLayer, { ipOffset: 14, ipVersion: 6, icmpOffset: 54 });

    const applyPrefix = screen.getByRole("button", { name: "Apply raw field ICMPv6 Prefix Information Option Prefix" });
    fireEvent.change(screen.getByLabelText("Raw field ICMPv6 Prefix Information Option Prefix"), {
      target: { value: "2001:db8:200::" }
    });
    await waitFor(() => expect(applyPrefix).not.toBeDisabled());
    fireEvent.click(applyPrefix);
    const rawHexAfterPrefix = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterPrefix.replace(/\s+/g, " ")).toContain(
      "20 01 0d b8 02 00 00 00 00 00 00 00 00 00 00 00"
    );
    expectRawIcmpChecksumValid(rawHexAfterPrefix, { ipOffset: 14, ipVersion: 6, icmpOffset: 54 });
  }, 30_000);
});
