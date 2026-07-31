import {
  App,
  describe,
  expect,
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

describe("Traffic Profiles / Raw DNS DHCP", () => {
  installAppTestHooks();

  it("edits Packet Editor DNS decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAA9EjRAAEARAAAQAAABMAAAATA5ADUAKQAAEjQBAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 3d 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 30 39 00 35 00 29 00 00 12 34 01 00 00 01 00 00 00 00 00 00 03 77 77 77 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01";
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
                name: "dns-stream",
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 75,
                wire_length: 75,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 12345, dst: 53, length: 41 } },
                  { name: "DNS", fields: { transaction_id: 0x1234, qdcount: 1, query_name: "www.example.com" } }
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

    expect(await screen.findByLabelText("Raw field DNS Transaction ID")).toHaveValue("4660");
    expect(screen.getByLabelText("Raw field DNS Flags")).toHaveValue("0100");
    expect(screen.getByLabelText("Raw field DNS Response")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Opcode")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Authoritative answer")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Truncated")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Recursion desired")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Recursion available")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Reserved flags")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Response code")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Questions")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Question Name")).toHaveValue("03777777076578616d706c6503636f6d00");
    expect(screen.getByLabelText("Raw field DNS Question Type")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Question Class")).toHaveValue("1");

    fireEvent.change(screen.getByLabelText("Raw field DNS Recursion desired"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DNS Recursion desired" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "12 34 00 00 00 01"
    );

    fireEvent.change(screen.getByLabelText("Raw field DNS Recursion desired"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DNS Recursion desired" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "12 34 01 00 00 01"
    );

    fireEvent.change(screen.getByLabelText("Raw field DNS Transaction ID"), { target: { value: "4661" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DNS Transaction ID" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "12 35 01 00 00 01"
    );

    fireEvent.change(screen.getByLabelText("Raw field DNS Question Type"), { target: { value: "28" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DNS Question Type" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "03 77 77 77 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 1c 00 01"
    );

    const responseCodeRow = screen.getByLabelText("Raw field DNS Response code").closest("tr");
    expect(responseCodeRow).not.toBeNull();
    fireEvent.click(within(responseCodeRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field DNS Response code"
    }));

    const targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use DNS response code inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    const vmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ mask: 0x000f, name: "dns_rcode", pkt_offset: 44, shift: 0, type: "write_mask_flow_var" })
    ]));
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dns_flags" })
    ]));
  }, 10_000);

  it("uses DNS Packet Editor rows as Field Engine targets", async () => {
    const packetBytes = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00"
      + "45 00 00 4d 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01"
      + "30 39 00 35 00 39 00 00"
      + "12 34 81 80 00 01 00 01 00 00 00 00"
      + "03 77 77 77 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01"
      + "c0 0c 00 01 00 01 00 00 00 3c 00 04 c0 00 02 0a"
    );
    const packetBinary = btoa(String.fromCharCode(...packetBytes));
    const packetHex = formatTestRawHex(packetBytes);
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
                name: "dns-answer-stream",
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: packetBytes.length,
                wire_length: packetBytes.length,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 12345, dst: 53, length: 57 } },
                  {
                    name: "DNS",
                    fields: {
                      answer_ipv4: "192.0.2.10",
                      answer_ttl: 60,
                      ancount: 1,
                      flags: "0x8180",
                      qdcount: 1,
                      query_name: "www.example.com",
                      transaction_id: 0x1234
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

    expect(await screen.findByLabelText("Raw field DNS Transaction ID")).toHaveValue("4660");
    expect(screen.getByLabelText("Raw field DNS Flags")).toHaveValue("8180");
    expect(screen.getByLabelText("Raw field DNS Response")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Recursion desired")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Recursion available")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Questions")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Answers")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Authority RRs")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Additional RRs")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DNS Question Name")).toHaveValue("03777777076578616d706c6503636f6d00");
    expect(screen.getByLabelText("Raw field DNS Question Type")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Question Class")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Answer TTL")).toHaveValue("60");
    expect(screen.getByLabelText("Raw field DNS Answer IPv4")).toHaveValue("192.0.2.10");

    const useRawDnsFieldEngineTarget = async (
      layer: string,
      field: string,
      targetLabel: string
    ) => {
      const targetButtonName = `Use Field Engine target for raw field ${layer} ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const flagsVm = await useRawDnsFieldEngineTarget("DNS", "Flags", "DNS flags inc");
    expect(flagsVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0x8180,
        name: "dns_flags",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_flags",
        pkt_offset: 44,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(flagsVm.split_by_var).toBe("dns_flags");
    expect(flagsVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dns_response" })
    ]));
    expect(flagsVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dns_rd" })
    ]));
    expect(flagsVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dns_ra" })
    ]));

    const questionsVm = await useRawDnsFieldEngineTarget("DNS", "Questions", "DNS questions inc");
    expect(questionsVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 4,
        min_value: 1,
        name: "dns_questions",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_questions",
        pkt_offset: 46,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(questionsVm.split_by_var).toBe("dns_questions");

    const answersVm = await useRawDnsFieldEngineTarget("DNS", "Answers", "DNS answers inc");
    expect(answersVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 4,
        min_value: 1,
        name: "dns_answers",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_answers",
        pkt_offset: 48,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(answersVm.split_by_var).toBe("dns_answers");

    const authorityVm = await useRawDnsFieldEngineTarget("DNS", "Authority RRs", "DNS authority RRs inc");
    expect(authorityVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0,
        max_value: 3,
        min_value: 0,
        name: "dns_authority_rrs",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_authority_rrs",
        pkt_offset: 50,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(authorityVm.split_by_var).toBe("dns_authority_rrs");

    const additionalVm = await useRawDnsFieldEngineTarget("DNS", "Additional RRs", "DNS additional RRs inc");
    expect(additionalVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0,
        max_value: 3,
        min_value: 0,
        name: "dns_additional_rrs",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_additional_rrs",
        pkt_offset: 52,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(additionalVm.split_by_var).toBe("dns_additional_rrs");

    const transactionIdVm = await useRawDnsFieldEngineTarget("DNS", "Transaction ID", "DNS transaction ID inc");
    expect(transactionIdVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0x1234,
        name: "dns_transaction_id",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_transaction_id",
        pkt_offset: 42,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(transactionIdVm.split_by_var).toBe("dns_transaction_id");

    const recursionDesiredVm = await useRawDnsFieldEngineTarget("DNS", "Recursion desired", "DNS recursion desired flag vary");
    expect(recursionDesiredVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 1,
        min_value: 0,
        name: "dns_rd",
        op: "dec",
        type: "flow_var"
      }),
      expect.objectContaining({
        mask: 0x0100,
        name: "dns_rd",
        pkt_cast_size: 2,
        pkt_offset: 44,
        shift: 8,
        type: "write_mask_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(recursionDesiredVm.split_by_var).toBe("dns_rd");
    expect(recursionDesiredVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dns_flags" })
    ]));

    const recursionAvailableVm = await useRawDnsFieldEngineTarget(
      "DNS",
      "Recursion available",
      "DNS recursion available flag vary"
    );
    expect(recursionAvailableVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 1,
        min_value: 0,
        name: "dns_ra",
        op: "dec",
        type: "flow_var"
      }),
      expect.objectContaining({
        mask: 0x0080,
        name: "dns_ra",
        pkt_cast_size: 2,
        pkt_offset: 44,
        shift: 7,
        type: "write_mask_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(recursionAvailableVm.split_by_var).toBe("dns_ra");
    expect(recursionAvailableVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dns_flags" })
    ]));

    const queryNameVm = await useRawDnsFieldEngineTarget("DNS Question", "Name", "DNS query name first byte inc");
    expect(queryNameVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0x77,
        name: "dns_query_name_byte",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_query_name_byte",
        pkt_offset: 55,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(queryNameVm.split_by_var).toBe("dns_query_name_byte");

    const queryTypeVm = await useRawDnsFieldEngineTarget("DNS Question", "Type", "DNS query type inc");
    expect(queryTypeVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        name: "dns_query_type",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_query_type",
        pkt_offset: 71,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(queryTypeVm.split_by_var).toBe("dns_query_type");

    const queryClassVm = await useRawDnsFieldEngineTarget("DNS Question", "Class", "DNS query class inc");
    expect(queryClassVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        name: "dns_query_class",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_query_class",
        pkt_offset: 73,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(queryClassVm.split_by_var).toBe("dns_query_class");

    const answerTypeVm = await useRawDnsFieldEngineTarget("DNS Answer", "Type", "DNS answer type inc");
    expect(answerTypeVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        name: "dns_answer_type",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_answer_type",
        pkt_offset: 77,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(answerTypeVm.split_by_var).toBe("dns_answer_type");

    const answerClassVm = await useRawDnsFieldEngineTarget("DNS Answer", "Class", "DNS answer class inc");
    expect(answerClassVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        name: "dns_answer_class",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_answer_class",
        pkt_offset: 79,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(answerClassVm.split_by_var).toBe("dns_answer_class");

    const answerTtlVm = await useRawDnsFieldEngineTarget("DNS Answer", "TTL", "DNS answer TTL inc");
    expect(answerTtlVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 60,
        name: "dns_answer_ttl",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_answer_ttl",
        pkt_offset: 81,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(answerTtlVm.split_by_var).toBe("dns_answer_ttl");

    const answerIpv4Vm = await useRawDnsFieldEngineTarget("DNS Answer", "IPv4", "DNS answer IPv4 inc");
    expect(answerIpv4Vm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 10,
        name: "dns_answer_ipv4",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dns_answer_ipv4",
        pkt_offset: 90,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(answerIpv4Vm.split_by_var).toBe("dns_answer_ipv4");
  }, 60_000);

  it("uses DNS flag Packet Editor rows as Field Engine targets", async () => {
    const packetBytes = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00"
      + "45 00 00 3d 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01"
      + "30 39 00 35 00 29 00 00"
      + "12 34 af a3 00 01 00 00 00 00 00 00"
      + "03 77 77 77 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01"
    );

    await openRawStreamFieldEngine(
      packetBytes,
      workbenchStream({ advanced_mode: true, packet_type: "Ethernet" }),
      "Ethernet/IPv4/UDP/DNS",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 12345, destination_port: 53, length: 41 } },
        {
          name: "DNS",
          fields: {
            flags: "0xafa3",
            qdcount: 1,
            query_name: "www.example.com",
            transaction_id: 0x1234
          }
        }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field DNS Response")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Opcode")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field DNS Authoritative answer")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Truncated")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DNS Reserved flags")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field DNS Response code")).toHaveValue("3");

    const expectDnsFlagRawTarget = async (
      fieldLabel: string,
      targetLabel: string,
      variableName: string,
      initValue: number,
      mask: number,
      shift: number
    ) => {
      const body = await selectRawPacketFieldEngineTarget(`DNS ${fieldLabel}`, targetLabel);
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          init_value: initValue,
          name: variableName,
          type: "flow_var"
        }),
        expect.objectContaining({
          mask,
          name: variableName,
          pkt_cast_size: 2,
          pkt_offset: 44,
          shift,
          type: "write_mask_flow_var"
        }),
        expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
      ]));
      expect(body.split_by_var).toBe(variableName);
      expect(body.instructions).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "dns_flags", type: "write_flow_var" })
      ]));
    };

    await expectDnsFlagRawTarget("Response", "DNS response flag vary", "dns_response", 1, 0x8000, 15);
    await expectDnsFlagRawTarget("Opcode", "DNS opcode inc", "dns_opcode", 5, 0x7800, 11);
    await expectDnsFlagRawTarget(
      "Authoritative answer",
      "DNS authoritative answer flag vary",
      "dns_aa",
      1,
      0x0400,
      10
    );
    await expectDnsFlagRawTarget("Truncated", "DNS truncated flag vary", "dns_tc", 1, 0x0200, 9);
    await expectDnsFlagRawTarget("Reserved flags", "DNS reserved flags inc", "dns_reserved", 2, 0x0070, 4);
    await expectDnsFlagRawTarget("Response code", "DNS response code inc", "dns_rcode", 3, 0x000f, 0);
  }, 40_000);

  it("edits Packet Editor DHCP decoded fields into the raw packet draft", async () => {
    let packetBinary =
      "qrvM3e7/ABEiM0RVCABFAAEiEjRAAEARAAAQAAAB/////wBEAEMBDgAAAQEGABI0VngAAIAAAAAAAAAAAAAAAAAAAAAAAAARIjNEVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjglNjNQEBMgTAqAFkNgTAqAEBDAR0cmV4/w==";
    let packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 01 22 12 34 40 00 40 11 00 00 10 00 00 01 ff ff ff ff 00 44 00 43 01 0e 00 00 01 01 06 00 12 34 56 78 00 00 80 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 11 22 33 44 55 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 63 82 53 63 35 01 01 32 04 c0 a8 01 64 36 04 c0 a8 01 01 0c 04 74 72 65 78 ff";
    const packetBytes = Array.from(atob(packetBinary), (character) => character.charCodeAt(0));
    packetBytes[16] = 0x01;
    packetBytes[17] = 0x43;
    packetBytes[38] = 0x01;
    packetBytes[39] = 0x2f;
    packetBytes[45] = 0x01;
    packetBytes[50] = 0x00;
    packetBytes[51] = 0x0a;
    packetBytes.splice(54, 16, 10, 10, 0, 10, 10, 10, 0, 20, 10, 10, 0, 30, 10, 10, 0, 40);
    packetBytes.splice(285, 0, 0x37, 0x04, 0x01, 0x03, 0x06, 0x0f);
    packetBytes.splice(291, 0, 0x3d, 0x07, 0x01, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55);
    packetBytes.splice(
      packetBytes.lastIndexOf(0xff),
      0,
      0x33, 0x04, 0x00, 0x00, 0x0e, 0x10,
      0x3a, 0x04, 0x00, 0x00, 0x07, 0x08,
      0x3b, 0x04, 0x00, 0x00, 0x0c, 0x4e
    );
    packetBinary = btoa(String.fromCharCode(...packetBytes));
    packetHex = packetBytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
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
                name: "dhcp-stream",
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 337,
                wire_length: 337,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "255.255.255.255", protocol: 17 } },
                  { name: "UDP", fields: { src: 68, dst: 67, length: 303 } },
                  { name: "DHCP", fields: { xid: "0x12345678", message_type: 1, requested_ip: "192.168.1.100" } }
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

    expect(await screen.findByLabelText("Raw field DHCP Operation")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DHCP Hops")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DHCP XID")).toHaveValue("12345678");
    expect(screen.getByLabelText("Raw field DHCP Seconds")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field DHCP Flags")).toHaveValue("8000");
    expect(screen.getByLabelText("Raw field DHCP Broadcast flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DHCP Reserved flags")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field DHCP Client IP")).toHaveValue("10.10.0.10");
    expect(screen.getByLabelText("Raw field DHCP Your IP")).toHaveValue("10.10.0.20");
    expect(screen.getByLabelText("Raw field DHCP Server IP")).toHaveValue("10.10.0.30");
    expect(screen.getByLabelText("Raw field DHCP Relay IP")).toHaveValue("10.10.0.40");
    expect(screen.getByLabelText("Raw field DHCP Client MAC")).toHaveValue("00:11:22:33:44:55");
    expect(screen.getByLabelText("Raw field DHCP Magic cookie")).toHaveValue("63825363");
    expect(screen.getByLabelText("Raw field DHCP Option 53 Message type")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field DHCP Option 55 Parameter request list")).toHaveValue("0103060f");
    expect(screen.getByLabelText("Raw field DHCP Option 61 Client identifier")).toHaveValue("01001122334455");
    expect(screen.getByLabelText("Raw field DHCP Option 50 Requested IP")).toHaveValue("192.168.1.100");
    expect(screen.getByLabelText("Raw field DHCP Option 54 Server identifier")).toHaveValue("192.168.1.1");
    expect(screen.getByLabelText("Raw field DHCP Option 12 Hostname")).toHaveValue("74726578");
    expect(screen.getByLabelText("Raw field DHCP Option 51 Lease time")).toHaveValue("3600");
    expect(screen.getByLabelText("Raw field DHCP Option 58 Renewal time")).toHaveValue("1800");
    expect(screen.getByLabelText("Raw field DHCP Option 59 Rebinding time")).toHaveValue("3150");

    fireEvent.change(screen.getByLabelText("Raw field DHCP XID"), { target: { value: "12345679" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP XID" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "01 01 06 01 12 34 56 79 00 0a 80 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field DHCP Broadcast flag"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP Broadcast flag" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "01 01 06 01 12 34 56 79 00 0a 00 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field DHCP Reserved flags"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP Reserved flags" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "01 01 06 01 12 34 56 79 00 0a 00 03"
    );

    fireEvent.change(screen.getByLabelText("Raw field DHCP Option 53 Message type"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP Option 53 Message type" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "63 82 53 63 35 01 03"
    );

    fireEvent.change(screen.getByLabelText("Raw field DHCP Option 55 Parameter request list"), { target: { value: "03060f1c" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP Option 55 Parameter request list" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "35 01 03 37 04 03 06 0f 1c 3d 07"
    );

    fireEvent.change(screen.getByLabelText("Raw field DHCP Option 61 Client identifier"), { target: { value: "01001122334456" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP Option 61 Client identifier" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "3d 07 01 00 11 22 33 44 56 32 04"
    );

    fireEvent.change(screen.getByLabelText("Raw field DHCP Option 50 Requested IP"), { target: { value: "192.168.1.101" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field DHCP Option 50 Requested IP" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "32 04 c0 a8 01 65 36 04"
    );

    const useRawDhcpFieldEngineTarget = async (field: string, targetLabel: string) => {
      const targetButtonName = `Use Field Engine target for raw field DHCP ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const flagsRawFieldVm = await useRawDhcpFieldEngineTarget("Flags", "DHCP flags inc");
    expect(flagsRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3,
        name: "dhcp_flags",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_flags",
        pkt_offset: 52,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(flagsRawFieldVm.split_by_var).toBe("dhcp_flags");
    expect(flagsRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dhcp_broadcast" })
    ]));
    expect(flagsRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dhcp_reserved_flags" })
    ]));

    const xidRawFieldVm = await useRawDhcpFieldEngineTarget("XID", "DHCP XID inc");
    expect(xidRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0x12345679,
        name: "dhcp_xid",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_xid",
        pkt_offset: 46,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(xidRawFieldVm.split_by_var).toBe("dhcp_xid");

    const messageTypeRawFieldVm = await useRawDhcpFieldEngineTarget("Option 53 Message type", "DHCP message type inc");
    expect(messageTypeRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3,
        name: "dhcp_message_type",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_message_type",
        pkt_offset: 284,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(messageTypeRawFieldVm.split_by_var).toBe("dhcp_message_type");

    const parameterRequestRawFieldVm = await useRawDhcpFieldEngineTarget(
      "Option 55 Parameter request list",
      "DHCP parameter request option inc"
    );
    expect(parameterRequestRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3,
        name: "dhcp_parameter_request",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_parameter_request",
        pkt_offset: 287,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(parameterRequestRawFieldVm.split_by_var).toBe("dhcp_parameter_request");

    const clientIdentifierRawFieldVm = await useRawDhcpFieldEngineTarget(
      "Option 61 Client identifier",
      "DHCP client identifier first byte inc"
    );
    expect(clientIdentifierRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        name: "dhcp_client_identifier",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_client_identifier",
        pkt_offset: 293,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(clientIdentifierRawFieldVm.split_by_var).toBe("dhcp_client_identifier");

    const requestedIpRawFieldVm = await useRawDhcpFieldEngineTarget("Option 50 Requested IP", "DHCP requested IP inc");
    expect(requestedIpRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 101,
        name: "dhcp_requested_ip",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_requested_ip",
        pkt_offset: 305,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(requestedIpRawFieldVm.split_by_var).toBe("dhcp_requested_ip");

    const serverIdRawFieldVm = await useRawDhcpFieldEngineTarget("Option 54 Server identifier", "DHCP server ID inc");
    expect(serverIdRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        name: "dhcp_server_id",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_server_id",
        pkt_offset: 311,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(serverIdRawFieldVm.split_by_var).toBe("dhcp_server_id");

    const hostnameRawFieldVm = await useRawDhcpFieldEngineTarget("Option 12 Hostname", "DHCP hostname first byte inc");
    expect(hostnameRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 116,
        name: "dhcp_hostname_byte",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_hostname_byte",
        pkt_offset: 314,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(hostnameRawFieldVm.split_by_var).toBe("dhcp_hostname_byte");

    const clientMacRawFieldVm = await useRawDhcpFieldEngineTarget("Client MAC", "DHCP client MAC inc");
    expect(clientMacRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0x55,
        name: "dhcp_client_mac",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_client_mac",
        pkt_offset: 75,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(clientMacRawFieldVm.split_by_var).toBe("dhcp_client_mac");

    const broadcastFlagRawFieldVm = await useRawDhcpFieldEngineTarget("Broadcast flag", "DHCP broadcast flag vary");
    expect(broadcastFlagRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 0,
        max_value: 1,
        min_value: 0,
        name: "dhcp_broadcast",
        op: "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        mask: 0x8000,
        name: "dhcp_broadcast",
        pkt_cast_size: 2,
        pkt_offset: 52,
        shift: 15,
        type: "write_mask_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(broadcastFlagRawFieldVm.split_by_var).toBe("dhcp_broadcast");
    expect(broadcastFlagRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dhcp_flags" })
    ]));

    const reservedFlagsRawFieldVm = await useRawDhcpFieldEngineTarget("Reserved flags", "DHCP reserved flags inc");
    expect(reservedFlagsRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3,
        max_value: 6,
        min_value: 3,
        name: "dhcp_reserved_flags",
        op: "inc",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        mask: 0x7fff,
        name: "dhcp_reserved_flags",
        pkt_cast_size: 2,
        pkt_offset: 52,
        shift: 0,
        type: "write_mask_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(reservedFlagsRawFieldVm.split_by_var).toBe("dhcp_reserved_flags");
    expect(reservedFlagsRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dhcp_flags" })
    ]));
  }, 60_000);

  it("uses DHCP BOOTP Packet Editor rows as Field Engine targets", async () => {
    const writeBytes = (target: number[], offset: number, values: number[]) => {
      values.forEach((value, index) => {
        target[offset + index] = value;
      });
    };
    const bootp = new Array<number>(240).fill(0);
    bootp[0] = 1;
    bootp[1] = 1;
    bootp[2] = 6;
    bootp[3] = 1;
    writeBytes(bootp, 4, [0x39, 0x03, 0xf3, 0x26]);
    writeBytes(bootp, 8, [0x00, 0x0a]);
    writeBytes(bootp, 10, [0x80, 0x00]);
    writeBytes(bootp, 12, [10, 10, 0, 10]);
    writeBytes(bootp, 16, [10, 10, 0, 20]);
    writeBytes(bootp, 20, [10, 10, 0, 30]);
    writeBytes(bootp, 24, [10, 10, 0, 40]);
    writeBytes(bootp, 28, [0x00, 0x11, 0x22, 0x33, 0x44, 0x10]);
    writeBytes(bootp, 236, [0x63, 0x82, 0x53, 0x63]);
    const options = [53, 1, 1, 255];
    const udpLength = 8 + bootp.length + options.length;
    const ipLength = 20 + udpLength;
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00,
      (ipLength >> 8) & 0xff, ipLength & 0xff,
      0x12, 0x34,
      0x00, 0x00,
      0x40,
      0x11,
      0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xff, 0xff, 0xff,
      0x00, 0x44,
      0x00, 0x43,
      (udpLength >> 8) & 0xff, udpLength & 0xff,
      0xbe, 0xef,
      ...bootp,
      ...options
    ];

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet",
        dhcp_client_ip_count: 4,
        dhcp_hops_count: 4,
        dhcp_operation_count: 2,
        dhcp_relay_ip_count: 4,
        dhcp_seconds_count: 4,
        dhcp_seconds_step: 10,
        dhcp_server_ip_count: 4,
        dhcp_your_ip_count: 4
      }),
      "Ethernet/IPv4/UDP/DHCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { source: "0.0.0.0", destination: "255.255.255.255", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 68, destination_port: 67, length: udpLength } },
        {
          name: "Dynamic Host Configuration Protocol",
          fields: {
            client_ip: "10.10.0.10",
            hops: 1,
            message_type: 1,
            operation: 1,
            relay_ip: "10.10.0.40",
            seconds: 10,
            server_ip: "10.10.0.30",
            your_ip: "10.10.0.20"
          }
        }
      ]
    );

    const expectDhcpBootpRawTarget = async (
      fieldLabel: string,
      targetLabel: string,
      variableName: string,
      initValue: number,
      pktOffset: number
    ) => {
      const body = await selectRawPacketFieldEngineTarget(`DHCP ${fieldLabel}`, targetLabel);
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          init_value: initValue,
          name: variableName,
          type: "flow_var"
        }),
        expect.objectContaining({
          name: variableName,
          pkt_offset: pktOffset,
          type: "write_flow_var"
        }),
        expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
      ]));
      expect(body.split_by_var).toBe(variableName);
    };

    await expectDhcpBootpRawTarget("Operation", "DHCP operation inc", "dhcp_operation", 1, 42);
    await expectDhcpBootpRawTarget("Hops", "DHCP hops inc", "dhcp_hops", 1, 45);
    await expectDhcpBootpRawTarget("Seconds", "DHCP seconds inc", "dhcp_seconds", 10, 50);
    await expectDhcpBootpRawTarget("Client IP", "DHCP client IP inc", "dhcp_client_ip", 10, 57);
    await expectDhcpBootpRawTarget("Your IP", "DHCP your IP inc", "dhcp_your_ip", 20, 61);
    await expectDhcpBootpRawTarget("Server IP", "DHCP server IP inc", "dhcp_server_ip", 30, 65);
    await expectDhcpBootpRawTarget("Relay IP", "DHCP relay IP inc", "dhcp_relay_ip", 40, 69);
  }, 40_000);

  it("uses DHCP timer Packet Editor rows as Field Engine targets", async () => {
    const packetBinary =
      "qrvM3e7/ABEiM0RVCABFAAEiEjRAAEARAAAQAAAB/////wBEAEMBDgAAAQEGABI0VngAAIAAAAAAAAAAAAAAAAAAAAAAAAARIjNEVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjglNjNQEBMgTAqAFkNgTAqAEBDAR0cmV4/w==";
    const packetBytes = Array.from(atob(packetBinary), (character) => character.charCodeAt(0));
    packetBytes[16] = 0x01;
    packetBytes[17] = 0x43;
    packetBytes[38] = 0x01;
    packetBytes[39] = 0x2f;
    packetBytes.splice(285, 0, 0x37, 0x04, 0x01, 0x03, 0x06, 0x0f);
    packetBytes.splice(291, 0, 0x3d, 0x07, 0x01, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55);
    packetBytes.splice(
      packetBytes.lastIndexOf(0xff),
      0,
      0x33, 0x04, 0x00, 0x00, 0x0e, 0x10,
      0x3a, 0x04, 0x00, 0x00, 0x07, 0x08,
      0x3b, 0x04, 0x00, 0x00, 0x0c, 0x4e
    );

    await openRawStreamFieldEngine(
      packetBytes,
      workbenchStream({ advanced_mode: true, packet_type: "Ethernet" }),
      "Ethernet/IPv4/UDP/DHCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { source: "16.0.0.1", destination: "255.255.255.255", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 68, destination_port: 67, length: 303 } },
        {
          name: "Dynamic Host Configuration Protocol",
          fields: {
            flags: "0x8000",
            lease_time: 3600,
            message_type: 1,
            rebinding_time: 3150,
            renewal_time: 1800,
            requested_ip: "192.168.1.100",
            server_id: "192.168.1.1",
            xid: "0x12345678"
          }
        }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field DHCP Option 51 Lease time")).toHaveValue("3600");
    expect(screen.getByLabelText("Raw field DHCP Option 58 Renewal time")).toHaveValue("1800");
    expect(screen.getByLabelText("Raw field DHCP Option 59 Rebinding time")).toHaveValue("3150");

    const useRawDhcpTimerFieldEngineTarget = async (field: string, targetLabel: string) => {
      const targetButtonName = `Use Field Engine target for raw field DHCP ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const leaseTimeRawFieldVm = await useRawDhcpTimerFieldEngineTarget("Option 51 Lease time", "DHCP lease time inc");
    expect(leaseTimeRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3600,
        name: "dhcp_lease_time",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_lease_time",
        pkt_offset: 320,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(leaseTimeRawFieldVm.split_by_var).toBe("dhcp_lease_time");

    const renewalTimeRawFieldVm = await useRawDhcpTimerFieldEngineTarget("Option 58 Renewal time", "DHCP renewal time inc");
    expect(renewalTimeRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1800,
        name: "dhcp_renewal_time",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_renewal_time",
        pkt_offset: 326,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(renewalTimeRawFieldVm.split_by_var).toBe("dhcp_renewal_time");

    const rebindingTimeRawFieldVm = await useRawDhcpTimerFieldEngineTarget("Option 59 Rebinding time", "DHCP rebinding time inc");
    expect(rebindingTimeRawFieldVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3150,
        name: "dhcp_rebinding_time",
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "dhcp_rebinding_time",
        pkt_offset: 332,
        type: "write_flow_var"
      }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(rebindingTimeRawFieldVm.split_by_var).toBe("dhcp_rebinding_time");
  }, 40_000);
});
