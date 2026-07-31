import type { RefObject } from "react";
import { Check, Code2, RotateCcw } from "lucide-react";

export type PacketEditorFieldFormat = "hex" | "ipv4" | "ipv6" | "mac" | "number";

export type PacketEditorFieldRow = {
  id: string;
  layer: string;
  field: string;
  offset: number;
  length: number;
  format: PacketEditorFieldFormat;
  value: string;
  mask?: number;
  shift?: number;
};

export type PacketEditorFieldDraft = Record<string, string>;

export type PacketEditorFieldStatus = {
  kind: "ok" | "error";
  text: string;
};

export type PacketEditorFieldEngineTarget = {
  template: {
    label: string;
  };
};

type PacketEditorPanelProps = {
  canLoadPreview: boolean;
  fieldDraft: PacketEditorFieldDraft;
  fieldRows: PacketEditorFieldRow[];
  fieldStatus: PacketEditorFieldStatus | null;
  findFieldEngineTarget: (row: PacketEditorFieldRow) => PacketEditorFieldEngineTarget | null;
  isBusy: boolean;
  onApplyFieldDraft: (row: PacketEditorFieldRow) => void;
  onApplyFieldEngineTarget: (row: PacketEditorFieldRow, target: PacketEditorFieldEngineTarget) => void;
  onApplyRawDraft: () => void;
  onClearRawOverride: () => void;
  onLocateField: (row: PacketEditorFieldRow) => void;
  onSeedRawDraftFromPreview: () => void;
  onUpdateFieldDraft: (rowId: string, value: string) => void;
  onUpdateRawDraft: (value: string) => void;
  rawDraft: string;
  rawDraftError: string | null;
  rawOverrideActive: boolean;
  rawParsedBytes: number[];
  rawStatusText: string;
  rawTextareaRef: RefObject<HTMLTextAreaElement | null>;
  selectedFieldId: string | null;
  validateField: (row: PacketEditorFieldRow, value: string, currentBytes: number[]) => string | null;
};

export function PacketEditorPanel({
  canLoadPreview,
  fieldDraft,
  fieldRows,
  fieldStatus,
  findFieldEngineTarget,
  isBusy,
  onApplyFieldDraft,
  onApplyFieldEngineTarget,
  onApplyRawDraft,
  onClearRawOverride,
  onLocateField,
  onSeedRawDraftFromPreview,
  onUpdateFieldDraft,
  onUpdateRawDraft,
  rawDraft,
  rawDraftError,
  rawOverrideActive,
  rawParsedBytes,
  rawStatusText,
  rawTextareaRef,
  selectedFieldId,
  validateField
}: PacketEditorPanelProps) {
  return (
    <section className="packet-editor-pane packet-raw-editor" aria-label="Raw packet editor">
      <div className="packet-raw-toolbar">
        <strong>Packet Editor</strong>
        <span className={rawDraftError ? "packet-raw-status packet-raw-status--error" : "packet-raw-status"}>
          {rawDraftError ? rawDraftError : rawOverrideActive ? "Raw override active" : rawStatusText}
        </span>
        <button
          className="stream-command-button packet-raw-button"
          disabled={!canLoadPreview || isBusy}
          onClick={onSeedRawDraftFromPreview}
          title="Load preview bytes"
          type="button"
        >
          <Code2 aria-hidden="true" size={14} />
          <span>Load preview</span>
        </button>
        <button
          className="stream-command-button packet-raw-button"
          disabled={Boolean(rawDraftError) || isBusy}
          onClick={onApplyRawDraft}
          title="Apply raw packet"
          type="button"
        >
          <Check aria-hidden="true" size={14} />
          <span>Apply raw</span>
        </button>
        <button
          className="stream-command-button packet-raw-button"
          disabled={!rawOverrideActive || isBusy}
          onClick={onClearRawOverride}
          title="Clear raw override"
          type="button"
        >
          <RotateCcw aria-hidden="true" size={14} />
          <span>Structured</span>
        </button>
      </div>
      <div className="packet-expert-panel packet-editor-grid">
        <div className="packet-field-editor" aria-label="Packet field editor">
          <div className="packet-field-editor-header">
            <strong>Packet fields</strong>
            <span>{fieldRows.length} editable fields</span>
          </div>
          <div className="packet-field-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Field</th>
                  <th>Offset</th>
                  <th>Length</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {fieldRows.length > 0 ? (
                  fieldRows.map((row) => {
                    const fieldValue = fieldDraft[row.id] ?? row.value;
                    const fieldError = validateField(row, fieldValue, rawParsedBytes);
                    const fieldTarget = findFieldEngineTarget(row);
                    return (
                      <tr
                        className={
                          selectedFieldId === row.id
                            ? "packet-field-row packet-field-row--selected"
                            : "packet-field-row"
                        }
                        key={row.id}
                      >
                        <td>{row.layer}</td>
                        <td>{row.field}</td>
                        <td>{row.offset}</td>
                        <td>{row.length}</td>
                        <td>
                          <input
                            aria-label={`Raw field ${row.layer} ${row.field}`}
                            className={fieldError ? "packet-field-input packet-field-input--invalid" : "packet-field-input"}
                            onChange={(event) => onUpdateFieldDraft(row.id, event.target.value)}
                            title={fieldError ?? `${row.length} byte ${row.format} field`}
                            value={fieldValue}
                          />
                        </td>
                        <td>
                          <div className="packet-field-actions">
                            <button
                              aria-label={`Locate raw field ${row.layer} ${row.field}`}
                              className="stream-command-button packet-raw-button"
                              disabled={Boolean(rawDraftError)}
                              onClick={() => onLocateField(row)}
                              title={`Select bytes ${row.offset}-${row.offset + row.length - 1} in raw hex`}
                              type="button"
                            >
                              <Code2 aria-hidden="true" size={14} />
                              <span>Locate</span>
                            </button>
                            {fieldTarget ? (
                              <button
                                aria-label={`Use Field Engine target for raw field ${row.layer} ${row.field}`}
                                className="stream-command-button packet-raw-button"
                                disabled={isBusy}
                                onClick={() => onApplyFieldEngineTarget(row, fieldTarget)}
                                title={`Use ${fieldTarget.template.label}`}
                                type="button"
                              >
                                <Code2 aria-hidden="true" size={14} />
                                <span>Use FE</span>
                              </button>
                            ) : null}
                            <button
                              aria-label={`Apply raw field ${row.layer} ${row.field}`}
                              className="stream-command-button packet-raw-button"
                              disabled={Boolean(fieldError) || Boolean(rawDraftError) || isBusy}
                              onClick={() => onApplyFieldDraft(row)}
                              title={fieldError ?? "Patch raw hex draft"}
                              type="button"
                            >
                              <Check aria-hidden="true" size={14} />
                              <span>Set</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      {rawDraftError ? "Fix raw hex before editing fields" : "No decoded Ethernet/IPv4/TCP/UDP fields"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="packet-field-footer">
            <span>
              Field edits repair parsed IPv4, TCP, UDP, ICMP, ICMPv6, SCTP, and GRE checksums where the packet layout is supported.
            </span>
            {fieldStatus ? (
              <strong className={`packet-field-status packet-field-status--${fieldStatus.kind}`}>
                {fieldStatus.text}
              </strong>
            ) : null}
          </div>
        </div>
        <textarea
          aria-label="Raw packet hex"
          className="packet-raw-textarea"
          onChange={(event) => onUpdateRawDraft(event.target.value)}
          ref={rawTextareaRef}
          spellCheck={false}
          value={rawDraft}
        />
        {rawDraftError ? (
          <div className="packet-raw-error" role="alert">{rawDraftError}</div>
        ) : null}
      </div>
    </section>
  );
}
