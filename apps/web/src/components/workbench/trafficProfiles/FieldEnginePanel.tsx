import { Check, Code2, Plus, RotateCcw } from "lucide-react";

export type FieldEngineTemplateOption = {
  disabled: boolean;
  label: string;
  name: string;
};

export type FieldEngineTargetRow = {
  blockedReason: string;
  checksumRepair: string;
  ready: boolean;
  template: {
    description: string;
    label: string;
    name: string;
  };
  variables: string;
  writeOffsets: string;
};

export type FieldEngineFlowVarRow = {
  init_value: number | string;
  max_value: number | string;
  min_value: number | string;
  name: string;
  op: string;
  step: number | string;
};

export type FieldEngineInputAttributes = {
  max?: number;
  min?: number;
  step?: number;
  title?: string;
};

type FieldEnginePanelProps = {
  applyError: string | null;
  draft: string;
  flowVarFields: readonly string[];
  flowVarOperations: readonly string[];
  flowVars: FieldEngineFlowVarRow[];
  getInputAttributes: (variableName: string, field: string) => FieldEngineInputAttributes;
  getParameterValue: (variableName: string, field: string, fallback: number | string) => string;
  isBusy: boolean;
  onAppendTemplate: () => void;
  onApplyDraft: () => void;
  onApplyTargetTemplate: (templateName: string) => void;
  onResetDraft: () => void;
  onResetTemplateParameters: () => void;
  onSeedTemplate: () => void;
  onTemplateChange: (templateName: string) => void;
  onUpdateDraft: (value: string) => void;
  onUpdateTemplateParameter: (variableName: string, field: string, value: string) => void;
  readyTargetCount: number;
  selectedTemplateCompatible: boolean;
  selectedTemplateHint: string;
  selectedTemplateName: string;
  statusText: string;
  targetRows: FieldEngineTargetRow[];
  templateOptions: FieldEngineTemplateOption[];
  templateParameterDirty: boolean;
  templateReady: boolean;
};

export function FieldEnginePanel({
  applyError,
  draft,
  flowVarFields,
  flowVarOperations,
  flowVars,
  getInputAttributes,
  getParameterValue,
  isBusy,
  onAppendTemplate,
  onApplyDraft,
  onApplyTargetTemplate,
  onResetDraft,
  onResetTemplateParameters,
  onSeedTemplate,
  onTemplateChange,
  onUpdateDraft,
  onUpdateTemplateParameter,
  readyTargetCount,
  selectedTemplateCompatible,
  selectedTemplateHint,
  selectedTemplateName,
  statusText,
  targetRows,
  templateOptions,
  templateParameterDirty,
  templateReady
}: FieldEnginePanelProps) {
  return (
    <section className="field-engine-pane packet-raw-editor" aria-label="Field Engine editor">
      <div className="packet-expert-panel packet-vm-editor" aria-label="Advanced VM editor">
        <div className="packet-vm-toolbar">
          <strong>Field Engine VM</strong>
          <span className={applyError ? "packet-raw-status packet-raw-status--error" : "packet-raw-status"}>
            {applyError ?? statusText}
          </span>
          <select
            aria-label="Advanced VM template"
            onChange={(event) => onTemplateChange(event.target.value)}
            title={selectedTemplateHint}
            value={selectedTemplateName}
          >
            {templateOptions.map((template) => (
              <option disabled={template.disabled} key={template.name} value={template.name}>
                {template.label}
              </option>
            ))}
          </select>
          <button
            className="stream-command-button packet-raw-button"
            disabled={!templateReady || isBusy}
            onClick={onSeedTemplate}
            title={selectedTemplateHint}
            type="button"
          >
            <Code2 aria-hidden="true" size={14} />
            <span>Insert VM</span>
          </button>
          <button
            className="stream-command-button packet-raw-button"
            disabled={!templateReady || Boolean(applyError) || isBusy}
            onClick={onAppendTemplate}
            title={selectedTemplateHint}
            type="button"
          >
            <Plus aria-hidden="true" size={14} />
            <span>Append VM</span>
          </button>
          <button
            className="stream-command-button packet-raw-button"
            disabled={Boolean(applyError) || isBusy}
            onClick={onApplyDraft}
            type="button"
          >
            <Check aria-hidden="true" size={14} />
            <span>Apply VM</span>
          </button>
          <button
            className="stream-command-button packet-raw-button"
            disabled={!templateParameterDirty || isBusy}
            onClick={onResetTemplateParameters}
            title="Reset current template parameters"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            <span>Reset Params</span>
          </button>
          <button
            className="stream-command-button packet-raw-button"
            disabled={isBusy}
            onClick={onResetDraft}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            <span>Reset VM</span>
          </button>
        </div>
        <div
          className={
            templateReady
              ? "packet-vm-template-hint"
              : "packet-vm-template-hint packet-vm-template-hint--blocked"
          }
        >
          {selectedTemplateHint}
        </div>
        {targetRows.length > 0 ? (
          <div className="packet-vm-target-map" aria-label="Field Engine target map">
            <div className="packet-vm-target-map-header">
              <strong>Field targets</strong>
              <span>{readyTargetCount} ready / {targetRows.length} templates</span>
            </div>
            <div className="packet-vm-target-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Variables</th>
                    <th>Offset</th>
                    <th>Repair</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {targetRows.map((row) => (
                    <tr
                      className={
                        row.template.name === selectedTemplateName
                          ? "packet-vm-target-row packet-vm-target-row--selected"
                          : "packet-vm-target-row"
                      }
                      key={row.template.name}
                    >
                      <td>
                        <strong>{row.template.label}</strong>
                        <span>{row.template.description}</span>
                      </td>
                      <td>{row.variables}</td>
                      <td>{row.writeOffsets}</td>
                      <td>{row.checksumRepair}</td>
                      <td>
                        {row.ready ? (
                          <span className="packet-vm-target-status packet-vm-target-status--ready">Ready</span>
                        ) : (
                          <span className="packet-vm-target-status packet-vm-target-status--blocked">
                            {row.blockedReason}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          aria-label={`Use ${row.template.label} Field Engine target`}
                          className="stream-command-button packet-raw-button"
                          disabled={!row.ready || isBusy}
                          onClick={() => onApplyTargetTemplate(row.template.name)}
                          title={row.ready ? row.template.description : row.blockedReason}
                          type="button"
                        >
                          <Code2 aria-hidden="true" size={14} />
                          <span>Use</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {flowVars.length > 0 ? (
          <div className="packet-vm-parameter-grid" aria-label="Advanced VM template parameters">
            <span>Variable</span>
            <span>Op</span>
            <span>Init</span>
            <span>Min</span>
            <span>Max</span>
            <span>Step</span>
            {flowVars.map((flowVar) => (
              <div className="packet-vm-parameter-row" key={`${selectedTemplateName}:${flowVar.name}`}>
                <strong>{flowVar.name}</strong>
                <label>
                  <span className="visually-hidden">{flowVar.name} operation</span>
                  <select
                    aria-label={`VM ${flowVar.name} operation`}
                    disabled={!selectedTemplateCompatible}
                    onChange={(event) => onUpdateTemplateParameter(flowVar.name, "op", event.target.value)}
                    value={getParameterValue(flowVar.name, "op", flowVar.op)}
                  >
                    {flowVarOperations.map((operation) => (
                      <option key={operation} value={operation}>{operation}</option>
                    ))}
                  </select>
                </label>
                {flowVarFields.map((field) => {
                  const inputAttributes = getInputAttributes(flowVar.name, field);
                  return (
                    <label key={field}>
                      <span className="visually-hidden">{flowVar.name} {field}</span>
                      <input
                        aria-label={`VM ${flowVar.name} ${field.replace("_", " ")}`}
                        disabled={!selectedTemplateCompatible}
                        max={inputAttributes.max}
                        min={inputAttributes.min}
                        onChange={(event) => onUpdateTemplateParameter(flowVar.name, field, event.target.value)}
                        step={inputAttributes.step}
                        title={inputAttributes.title}
                        type="number"
                        value={getParameterValue(flowVar.name, field, flowVar[field as keyof FieldEngineFlowVarRow] ?? "")}
                      />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          aria-label="Advanced VM JSON"
          className="packet-raw-textarea packet-vm-textarea"
          onChange={(event) => onUpdateDraft(event.target.value)}
          spellCheck={false}
          value={draft}
        />
        {applyError ? (
          <div className="packet-raw-error" role="alert">{applyError}</div>
        ) : null}
      </div>
    </section>
  );
}
