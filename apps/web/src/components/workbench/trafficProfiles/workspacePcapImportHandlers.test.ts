import { describe, expect, it } from "vitest";

import type { ProfilePcapImportOptions } from "../../../api";
import { defaultPcapImportOptions } from "./pcapImportModel";
import { workspacePcapImportHandlers } from "./workspacePcapImportHandlers";

function collectHandlers(initial: ProfilePcapImportOptions = defaultPcapImportOptions) {
  let options = initial;
  const handlers = workspacePcapImportHandlers({
    changePcapImportOptions: (updater) => {
      options = updater(options);
    }
  });

  return {
    getOptions: () => options,
    handlers
  };
}

describe("workspacePcapImportHandlers", () => {
  it("binds IPv4 rewrite option updates", () => {
    const { getOptions, handlers } = collectHandlers();

    handlers.changeSourceRewrite(true);
    handlers.changeSourceAddress("10.0.0.1");
    handlers.changeSourceMode("Increment Host");
    handlers.changeSourceCount("3.9");
    handlers.changeDestinationRewrite(true);
    handlers.changeDestinationAddress("20.0.0.1");
    handlers.changeDestinationMode("Decrement Host");
    handlers.changeDestinationCount("0");

    expect(getOptions()).toMatchObject({
      rewrite_src_enabled: true,
      src_address: "10.0.0.1",
      src_mode: "Increment Host",
      src_count: 3,
      rewrite_dst_enabled: true,
      dst_address: "20.0.0.1",
      dst_mode: "Decrement Host",
      dst_count: 1
    });
  });

  it("binds rate and loop option updates with existing normalization", () => {
    const { getOptions, handlers } = collectHandlers();

    handlers.changeNamePrefix("capture-");
    handlers.changeRateMode("ipg");
    handlers.changeSpeedup("0");
    handlers.changeIpg("-1");
    handlers.changeLoopCount("-5");

    expect(getOptions()).toMatchObject({
      name_prefix: "capture-",
      rate_mode: "ipg",
      speedup: 0.000001,
      ipg: 0,
      loop_count: 0
    });
  });
});
