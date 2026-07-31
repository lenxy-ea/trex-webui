import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  advancedVmDefaultBody,
  type AdvancedVmTemplate
} from "./model";
import {
  advancedVmNamedTargetTemplateDraft,
  advancedVmNamedTargetTemplateAction,
  advancedVmTemplateAppendAction,
  advancedVmTargetTemplateDraft,
  advancedVmTemplateDraftText,
  advancedVmTemplateSeedAction,
  advancedVmTemplateViewModel,
  appendedAdvancedVmTemplateDraftText,
  runAdvancedVmNamedTargetTemplate,
  runAdvancedVmTemplateAppend,
  runAdvancedVmTemplateDraftAction,
  runAdvancedVmTemplateSeed
} from "./advancedVmTemplateDraftModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

const templateCatalog: AdvancedVmTemplate[] = [
  {
    name: "empty",
    label: "Empty",
    description: "No instructions.",
    requires: "none",
    body: advancedVmDefaultBody
  },
  {
    name: "tcp-seq",
    label: "TCP sequence",
    description: "Vary TCP sequence.",
    requires: "Ethernet/IPv4/TCP",
    supports: (candidate) => candidate.packet_type === "Ethernet/IPv4/TCP",
    body: {
      instructions: [{
        type: "flow_var",
        name: "seq",
        op: "inc",
        size: 4,
        init_value: 1,
        min_value: 1,
        max_value: 4,
        step: 1
      }],
      split_by_var: "seq"
    }
  }
];

describe("advancedVmTemplateViewModel", () => {
  it("selects the active template and derives ready state", () => {
    const view = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    );

    expect(view.selectedTemplate.name).toBe("tcp-seq");
    expect(view.compatible).toBe(true);
    expect(view.ready).toBe(true);
    expect(view.parameterError).toBeNull();
    expect(view.parameterDirty).toBe(false);
    expect(view.hint).toBe("Vary TCP sequence.");
    expect(view.flowVars.map((row) => row.name)).toEqual(["seq"]);
  });

  it("surfaces unsupported template requirements", () => {
    const view = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    );

    expect(view.compatible).toBe(false);
    expect(view.ready).toBe(false);
    expect(view.hint).toBe("Template requires Ethernet/IPv4/TCP.");
  });

  it("surfaces parameter errors and dirty state", () => {
    const view = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      { "tcp-seq:seq:step": "0" }
    );

    expect(view.parameterDirty).toBe(true);
    expect(view.ready).toBe(false);
    expect(view.parameterError).toBe("VM seq step must be greater than 0.");
    expect(view.hint).toBe("VM seq step must be greater than 0.");
  });

  it("builds and blocks template draft text from the template view", () => {
    const readyView = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    );
    const blockedView = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    );

    expect(advancedVmTemplateDraftText(readyView)).toMatchObject({
      ok: true,
      templateName: "tcp-seq"
    });
    expect(advancedVmTemplateDraftText(blockedView)).toEqual({ ok: false });
  });

  it("appends template instructions to the current Advanced VM body", () => {
    const view = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    );
    const appended = appendedAdvancedVmTemplateDraftText(
      { instructions: [{ type: "flow_var", name: "current" }], split_by_var: "current" },
      view
    );

    expect(appended.ok).toBe(true);
    if (appended.ok) {
      expect(appended.advancedVmDraft).toContain("\"name\": \"current\"");
      expect(appended.advancedVmDraft).toContain("\"name\": \"seq\"");
    }
    expect(appendedAdvancedVmTemplateDraftText(null, view)).toEqual({ ok: false });
  });

  it("builds target template draft text from a concrete template", () => {
    expect(advancedVmTargetTemplateDraft(
      templateCatalog[1],
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    )).toMatchObject({
      ok: true,
      templateName: "tcp-seq"
    });
    expect(advancedVmTargetTemplateDraft(
      templateCatalog[1],
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    )).toEqual({ ok: false });
    expect(advancedVmTargetTemplateDraft(null, stream({ packet_type: "Ethernet/IPv4/TCP" }), {})).toEqual({ ok: false });
  });

  it("builds target template draft text by template name", () => {
    expect(advancedVmNamedTargetTemplateDraft(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    )).toMatchObject({
      ok: true,
      templateName: "tcp-seq"
    });
    expect(advancedVmNamedTargetTemplateDraft(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    )).toEqual({ ok: false });
    expect(advancedVmNamedTargetTemplateDraft(
      templateCatalog,
      "missing",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    )).toEqual({ ok: false });
  });

  it("dispatches template draft actions through workspace callbacks", () => {
    const readyView = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    );
    const blockedView = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    );

    expect(advancedVmTemplateSeedAction(blockedView)).toEqual({ kind: "ignored" });
    expect(advancedVmTemplateAppendAction(null, readyView)).toEqual({ kind: "ignored" });
    expect(advancedVmNamedTargetTemplateAction(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    )).toEqual({ kind: "ignored" });

    const seedAction = advancedVmTemplateSeedAction(readyView);
    const appendAction = advancedVmTemplateAppendAction(
      { instructions: [{ type: "flow_var", name: "current" }], split_by_var: "current" },
      readyView
    );
    const targetAction = advancedVmNamedTargetTemplateAction(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    );

    const events: string[] = [];
    const handlers = {
      setTemplateName: (templateName: string) => events.push(`template:${templateName}`),
      updateDraft: (advancedVmDraft: string) => events.push(`draft:${advancedVmDraft}`)
    };

    expect(runAdvancedVmTemplateDraftAction({ kind: "ignored" }, handlers)).toBe(false);
    expect(runAdvancedVmTemplateDraftAction(seedAction, handlers)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("\"name\": \"seq\"");

    expect(runAdvancedVmTemplateDraftAction(appendAction, handlers)).toBe(true);
    expect(events[1]).toContain("\"name\": \"current\"");
    expect(events[1]).toContain("\"name\": \"seq\"");

    expect(runAdvancedVmTemplateDraftAction(targetAction, handlers)).toBe(true);
    expect(events[2]).toBe("template:tcp-seq");
    expect(events[3]).toContain("\"name\": \"seq\"");
  });

  it("runs template draft actions directly from workspace inputs", () => {
    const readyView = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {}
    );
    const blockedView = advancedVmTemplateViewModel(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {}
    );
    const events: string[] = [];
    const handlers = {
      setTemplateName: (templateName: string) => events.push(`template:${templateName}`),
      updateDraft: (advancedVmDraft: string) => events.push(`draft:${advancedVmDraft}`)
    };

    expect(runAdvancedVmTemplateSeed(blockedView, handlers)).toBe(false);
    expect(runAdvancedVmTemplateSeed(readyView, handlers)).toBe(true);
    expect(runAdvancedVmTemplateAppend(null, readyView, handlers)).toBe(false);
    expect(runAdvancedVmTemplateAppend(
      { instructions: [{ type: "flow_var", name: "current" }], split_by_var: "current" },
      readyView,
      handlers
    )).toBe(true);
    expect(runAdvancedVmNamedTargetTemplate(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/UDP" }),
      {},
      handlers
    )).toBe(false);
    expect(runAdvancedVmNamedTargetTemplate(
      templateCatalog,
      "tcp-seq",
      stream({ packet_type: "Ethernet/IPv4/TCP" }),
      {},
      handlers
    )).toBe(true);

    expect(events[0]).toContain("\"name\": \"seq\"");
    expect(events[1]).toContain("\"name\": \"current\"");
    expect(events[1]).toContain("\"name\": \"seq\"");
    expect(events[2]).toBe("template:tcp-seq");
    expect(events[3]).toContain("\"name\": \"seq\"");
  });
});
