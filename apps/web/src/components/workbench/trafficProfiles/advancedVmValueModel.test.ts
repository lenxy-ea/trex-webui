import { describe, expect, it } from "vitest";

import {
  dhcpParameterRequestFirstValue,
  dhcpParameterRequestListLength,
  dnsNameWireLength,
  dnsQueryNameFirstLabelByte,
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix,
  ipv4Parts,
  macFieldEngineSuffix,
  macParts,
  parseHexWord
} from "./advancedVmValueModel";

describe("advancedVmValueModel", () => {
  it("parses bounded hex words", () => {
    expect(parseHexWord("0x12345")).toBe(0x2345);
    expect(parseHexWord("beef")).toBe(0xbeef);
    expect(parseHexWord("not-hex")).toBe(0);
  });

  it("derives IPv4 suffix size from the address range", () => {
    expect(ipv4Parts("192.0.2.250")).toEqual([192, 0, 2, 250]);
    expect(ipv4Parts("999.0.2.1")).toEqual([0, 0, 0, 0]);
    expect(ipv4FieldEngineSuffix("192.0.2.10", 4)).toEqual({ initValue: 10, size: 1 });
    expect(ipv4FieldEngineSuffix("192.0.2.250", 16)).toEqual({ initValue: 762, size: 2 });
    expect(ipv4FieldEngineSuffix("255.255.255.250", 16)).toEqual({ initValue: 4_294_967_290, size: 4 });
  });

  it("derives MAC suffix size from the address range", () => {
    expect(macParts("00:11:22:33:44:55")).toEqual([0, 17, 34, 51, 68, 85]);
    expect(macParts("00:11:22")).toEqual([0, 0, 0, 0, 0, 0]);
    expect(macFieldEngineSuffix("00:11:22:33:44:10", 4)).toEqual({ initValue: 0x10, size: 1 });
    expect(macFieldEngineSuffix("00:11:22:33:44:f0", 32)).toEqual({ initValue: 0x44f0, size: 2 });
    expect(macFieldEngineSuffix("00:11:22:ff:ff:f0", 32)).toEqual({ initValue: 0x22fffff0, size: 4 });
  });

  it("reports max values by FE write size", () => {
    expect(fieldEngineMaxForSize(1)).toBe(255);
    expect(fieldEngineMaxForSize(2)).toBe(65_535);
    expect(fieldEngineMaxForSize(4)).toBe(4_294_967_295);
  });

  it("derives DNS and DHCP helper values", () => {
    expect(dnsNameWireLength("example.com")).toBe(13);
    expect(dnsQueryNameFirstLabelByte(".example.com")).toBe("e".charCodeAt(0));
    expect(dnsQueryNameFirstLabelByte(".")).toBeNull();
    expect(dhcpParameterRequestListLength("1, 3, 6, 999, bad")).toBe(3);
    expect(dhcpParameterRequestFirstValue("bad, 55, 1")).toBe(55);
    expect(dhcpParameterRequestFirstValue("bad")).toBe(0);
  });
});
