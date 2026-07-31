import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Copy, Download, FileText, GitCompare, Lock, Play, Plug, Plus, Power, RefreshCcw, RotateCcw, Save, Square, Trash2, Unlock, Upload } from "lucide-react";
import { parse, stringify } from "yaml";

import type {
  DaemonConfigAudit,
  DaemonConfigVersionDiffResult,
  DaemonConfigVersions,
  DaemonDefaultConfig,
  DaemonOverview,
  DaemonTrexReservationResult,
  DaemonTrexResult,
  EnvironmentReadiness
} from "../../api";

type TrexDaemonDialogProps = {
  environment: EnvironmentReadiness | null;
  daemonOverview: DaemonOverview | null;
  daemonConnectionMessage: string | null;
  daemonConfigAudit: DaemonConfigAudit | null;
  daemonConfigOverride: { content: string; label: string } | null;
  daemonConfigVersions: DaemonConfigVersions | null;
  daemonConfigVersionDiff: DaemonConfigVersionDiffResult | null;
  daemonConfigVersionMessage: string | null;
  daemonDefaultConfig: DaemonDefaultConfig | null;
  daemonResult: DaemonTrexResult | null;
  daemonReservationResult: DaemonTrexReservationResult | null;
  daemonError: string | null;
  isDaemonLoading: boolean;
  isDaemonBusy: boolean;
  isDaemonReservationBusy: boolean;
  isConfigLoading: boolean;
  isConfigVersionBusy: boolean;
  startTimeout: string;
  onStartTimeoutChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLoadDefaultConfig: () => void;
  onRefreshConfigVersions: () => void;
  onSaveConfigVersion: (content: string) => void;
  onLoadConfigVersion: (name: string) => void;
  onRestoreConfigVersion: (name: string) => void;
  onDiffConfigVersion: (name: string, content: string) => void;
  onDaemonAction: (action: "start" | "stop") => void;
  onDaemonReservationAction: (action: "reserve" | "cancel") => void;
  onConfigContentChange: (content: string, valid: boolean) => void;
};

type MetadataField = {
  name?: unknown;
  id?: unknown;
  type?: unknown;
  default?: unknown;
  description?: unknown;
  mandatory?: unknown;
  mandatory_if_not_set?: unknown;
  values?: unknown;
  attributes?: unknown;
  item?: unknown;
};

type ConfigPrimitive = string | number | boolean | null;
type ConfigValue = ConfigPrimitive | ConfigObject | ConfigValue[];
type MetadataEnumValue = string | number | boolean;

type ConfigObject = {
  [key: string]: ConfigValue | undefined;
};

type DeviceChoice = {
  slot: string;
  label: string;
  details: string;
};

type DaemonDialogTab = "config" | "versions" | "audit" | "log";

const daemonDialogTabs: Array<{ id: DaemonDialogTab; label: string }> = [
  { id: "config", label: "Config" },
  { id: "versions", label: "Versions" },
  { id: "audit", label: "Audit" },
  { id: "log", label: "Log" }
];

const NON_DIGIT_PATTERN = /\D/g;
const JAVA_INTEGER_MIN = -2147483648;
const JAVA_INTEGER_MAX = 2147483647;
const INTEGER_TEXT_PATTERN = /^[+-]?\d+$/;
const FLOAT_TEXT_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const IPV4_OCTET_PATTERN = /^(?:0|[1-9]\d{0,2})$/;
const IPV6_HEXTET_PATTERN = /^[0-9a-fA-F]{1,4}$/;
const METADATA_FIELD_TYPES = new Set(["BOOLEAN", "ENUM", "FLOAT", "IP", "LIST", "MAC", "NUMBER", "OBJECT", "STRING"]);

type ReadOnlyCodeViewProps = {
  label: string;
  value: string;
  variant: "log" | "yaml";
};

function ReadOnlyCodeView({ label, value, variant }: ReadOnlyCodeViewProps) {
  const lines = variant === "log" ? value.split("\n") : null;

  return (
    <pre
      aria-label={label}
      className={`daemon-readonly-code daemon-readonly-code--${variant}`}
      role="region"
      tabIndex={0}
    >
      <code className="daemon-readonly-code-content">
        {lines
          ? lines.map((line, index) => (
              <span key={`${index}:${line}`}>
                {line}
                {index < lines.length - 1 ? "\n" : null}
              </span>
            ))
          : value}
      </code>
    </pre>
  );
}

function digitsOnly(value: string) {
  return value.replace(NON_DIGIT_PATTERN, "");
}

function isMetadataObject(value: unknown): value is MetadataField {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isCleanMetadataString(value: unknown): value is string {
  return isNonBlankString(value) && value === value.trim() && !value.includes("\0");
}

function isJsonScalar(value: unknown) {
  return (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  );
}

function isMetadataEnumValue(value: unknown): value is MetadataEnumValue {
  if (typeof value === "string") {
    return isCleanMetadataString(value);
  }
  return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function deviceChoicesFromInfo(value: unknown): DeviceChoice[] {
  if (!isMetadataObject(value)) {
    return [];
  }
  return Object.entries(value)
    .map(([key, device]) => {
      if (!isMetadataObject(device)) {
        return null;
      }
      const deviceRecord = device as Record<string, unknown>;
      const slot = isCleanMetadataString(deviceRecord.Slot_str)
        ? deviceRecord.Slot_str
        : isCleanMetadataString(key)
          ? key
          : null;
      if (!slot) {
        return null;
      }
      const driver = isCleanMetadataString(deviceRecord.Driver_str) ? deviceRecord.Driver_str : "";
      const linuxInterface = isCleanMetadataString(deviceRecord.Interface) ? deviceRecord.Interface : "";
      const active = isCleanMetadataString(deviceRecord.Active) ? deviceRecord.Active : "";
      const labelParts = [slot, driver, linuxInterface, active].filter(Boolean);
      const details = Object.entries(deviceRecord)
        .filter(([detailKey, detailValue]) => isCleanMetadataString(detailKey) && isJsonScalar(detailValue))
        .map(([detailKey, detailValue]) => `${detailKey}: ${String(detailValue)}`)
        .join(" | ");
      return {
        slot,
        label: labelParts.join(" / "),
        details
      };
    })
    .filter((choice): choice is DeviceChoice => choice !== null);
}

function canParseFloatField(value: string) {
  const text = value.trim();
  return FLOAT_TEXT_PATTERN.test(text) && Number.isFinite(Number(text));
}

function canParseNumberField(value: string) {
  if (!INTEGER_TEXT_PATTERN.test(value)) {
    return false;
  }
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= JAVA_INTEGER_MIN && numberValue <= JAVA_INTEGER_MAX;
}

function canParseIpv4Field(value: string) {
  const octets = value.split(".");
  return octets.length === 4 && octets.every((octet) => {
    if (!IPV4_OCTET_PATTERN.test(octet)) {
      return false;
    }
    const octetValue = Number(octet);
    return octetValue >= 0 && octetValue <= 255;
  });
}

function canParseIpv6Field(value: string) {
  if (!value.includes(":") || /\s/.test(value)) {
    return false;
  }

  const doubleColonParts = value.split("::");
  if (doubleColonParts.length > 2) {
    return false;
  }

  const parseSide = (side: string) => {
    if (side === "") {
      return { ok: true, count: 0 };
    }
    const segments = side.split(":");
    let count = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment === "") {
        return { ok: false, count: 0 };
      }
      if (segment.includes(".")) {
        if (index !== segments.length - 1 || !canParseIpv4Field(segment)) {
          return { ok: false, count: 0 };
        }
        count += 2;
        continue;
      }
      if (!IPV6_HEXTET_PATTERN.test(segment)) {
        return { ok: false, count: 0 };
      }
      count += 1;
    }
    return { ok: true, count };
  };

  const left = parseSide(doubleColonParts[0] ?? "");
  const right = parseSide(doubleColonParts[1] ?? "");
  if (!left.ok || !right.ok) {
    return false;
  }

  const segmentCount = left.count + right.count;
  return doubleColonParts.length === 2 ? segmentCount < 8 : segmentCount === 8;
}

function canParseIpField(value: string) {
  return canParseIpv4Field(value) || canParseIpv6Field(value);
}

function isMetadataField(value: unknown, requireId = true): value is MetadataField {
  if (!isMetadataObject(value)) {
    return false;
  }
  if (requireId && !isCleanMetadataString(value.id)) {
    return false;
  }
  if (!requireId && value.id !== undefined && value.id !== null && !isCleanMetadataString(value.id)) {
    return false;
  }
  if (!isCleanMetadataString(value.name) || !isCleanMetadataString(value.type) || !METADATA_FIELD_TYPES.has(value.type)) {
    return false;
  }
  if ("description" in value && value.description !== undefined && value.description !== null && typeof value.description !== "string") {
    return false;
  }
  if ("default" in value && value.default !== undefined && !isJsonScalar(value.default)) {
    return false;
  }
  if ("mandatory" in value && value.mandatory !== undefined && typeof value.mandatory !== "boolean") {
    return false;
  }
  if (
    "mandatory_if_not_set" in value
    && value.mandatory_if_not_set !== undefined
    && value.mandatory_if_not_set !== null
    && !isCleanMetadataString(value.mandatory_if_not_set)
  ) {
    return false;
  }
  if (value.type === "OBJECT" && !Array.isArray(value.attributes)) {
    return false;
  }
  if (value.attributes !== undefined && value.attributes !== null) {
    if (!Array.isArray(value.attributes)) {
      return false;
    }
    if (asMetadataFields(value.attributes).length !== value.attributes.length) {
      return false;
    }
  }
  if (value.type === "LIST" && !asMetadataItem(value.item)) {
    return false;
  }
  if (value.item !== undefined && value.item !== null && !asMetadataItem(value.item)) {
    return false;
  }
  if (value.type === "ENUM") {
    if (!Array.isArray(value.values) || value.values.length === 0) {
      return false;
    }
    if (!value.values.every(isMetadataEnumValue)) {
      return false;
    }
  }
  return true;
}

function asMetadataFields(value: unknown): MetadataField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is MetadataField => isMetadataField(item));
}

function asMetadataItem(value: unknown): MetadataField | null {
  return isMetadataField(value, false) ? value : null;
}

function isConfigObject(value: unknown): value is ConfigObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function fieldId(field: MetadataField) {
  if (typeof field.id === "string" && field.id !== "") {
    return field.id;
  }
  if (typeof field.name === "string" && field.name !== "") {
    return field.name;
  }
  return "field";
}

function fieldLabel(field: MetadataField) {
  const name = typeof field.name === "string" ? field.name : null;
  const type = typeof field.type === "string" ? field.type : null;
  return {
    name: name || fieldId(field),
    type
  };
}

function emptyListItemValue(field: MetadataField): ConfigValue | undefined {
  if (field.type === "OBJECT") {
    return {};
  }
  if (field.type === "LIST") {
    return [];
  }
  return undefined;
}

function extractConfigObjectFromYaml(content: string): { config: ConfigObject; error: string | null } {
  if (content.trim() === "") {
    return { config: {}, error: null };
  }
  try {
    const parsed = parse(content);
    const root = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!isConfigObject(root)) {
      return { config: {}, error: "YAML root must be an object or a list with an object entry" };
    }
    return { config: root, error: null };
  } catch (caught) {
    return { config: {}, error: errorMessage(caught) };
  }
}

function isSchemaPlaceholderValue(field: MetadataField, value: unknown) {
  if (typeof value !== "string" || typeof field.type !== "string") {
    return false;
  }
  const text = value.trim().toUpperCase();
  if (text === "") {
    return false;
  }
  if (field.type === "FLOAT") {
    return text === "FLOAT" || text === "DECIMAL";
  }
  return text === field.type;
}

function normalizeConfigValueForField(field: MetadataField, value: ConfigValue | undefined): ConfigValue | undefined {
  if (value === undefined || isSchemaPlaceholderValue(field, value)) {
    return undefined;
  }

  if (field.type === "OBJECT") {
    if (!isConfigObject(value)) {
      return value;
    }
    const normalized: ConfigObject = {};
    for (const child of asMetadataFields(field.attributes)) {
      const childValue = normalizeConfigValueForField(child, value[fieldId(child)]);
      if (!isEmptyConfigValue(childValue)) {
        normalized[fieldId(child)] = childValue;
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  if (field.type === "LIST") {
    if (!Array.isArray(value)) {
      return value;
    }
    const item = asMetadataItem(field.item);
    if (!item) {
      return value;
    }
    const normalizedList = value
      .map((entry) => normalizeConfigValueForField(item, entry))
      .filter((entry): entry is ConfigValue => !isEmptyConfigValue(entry));
    return normalizedList.length > 0 ? normalizedList : undefined;
  }

  return value;
}

function initialConfigFromMetadata(fields: MetadataField[], rawYaml: string) {
  const parsed = extractConfigObjectFromYaml(rawYaml);
  const result: ConfigObject = {};
  for (const field of fields) {
    const id = fieldId(field);
    const parsedValue = parsed.config[id];
    if (parsedValue !== undefined) {
      const normalizedValue = normalizeConfigValueForField(field, parsedValue as ConfigValue);
      if (!isEmptyConfigValue(normalizedValue)) {
        result[id] = normalizedValue;
      }
    }
  }
  return { model: result, error: parsed.error };
}

function isEmptyConfigValue(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function coerceScalarForYaml(field: MetadataField, value: ConfigValue | undefined) {
  if (isEmptyConfigValue(value)) {
    return null;
  }
  if (field.type === "NUMBER") {
    return Number.parseInt(String(value), 10);
  }
  if (field.type === "FLOAT") {
    return Number(String(value).trim());
  }
  if (field.type === "BOOLEAN") {
    return Boolean(value);
  }
  return value as ConfigPrimitive;
}

function valueForYaml(field: MetadataField, value: ConfigValue | undefined): ConfigValue | null {
  if (field.type === "OBJECT") {
    const source = isConfigObject(value) ? value : {};
    const objectValue: ConfigObject = {};
    for (const child of asMetadataFields(field.attributes)) {
      const childValue = valueForYaml(child, source[fieldId(child)]);
      if (!isEmptyConfigValue(childValue)) {
        objectValue[fieldId(child)] = childValue;
      }
    }
    return Object.keys(objectValue).length > 0 ? objectValue : null;
  }

  if (field.type === "LIST") {
    const item = asMetadataItem(field.item);
    if (!item || !Array.isArray(value)) {
      return null;
    }
    const listValue = value
      .map((entry) => valueForYaml(item, entry))
      .filter((entry) => !isEmptyConfigValue(entry));
    return listValue.length > 0 ? listValue : null;
  }

  return coerceScalarForYaml(field, value);
}

function mandatoryForField(field: MetadataField, parentValue: ConfigObject | null) {
  if (typeof field.mandatory_if_not_set === "string" && parentValue) {
    return isEmptyConfigValue(parentValue[field.mandatory_if_not_set]);
  }
  return field.mandatory === true;
}

function validateField(
  field: MetadataField,
  value: ConfigValue | undefined,
  parentValue: ConfigObject | null,
  path: string,
  errors: string[]
) {
  const label = fieldLabel(field);
  if (isEmptyConfigValue(value)) {
    if (mandatoryForField(field, parentValue)) {
      errors.push(`Field ${label.name} (${path}) is mandatory, it must be specified`);
    }
    return;
  }

  if (field.type === "OBJECT") {
    const source = isConfigObject(value) ? value : {};
    const beforeChildErrors = errors.length;
    for (const child of asMetadataFields(field.attributes)) {
      validateField(child, source[fieldId(child)], source, `${path}.${fieldId(child)}`, errors);
    }
    const hasChildValue = Object.values(source).some((childValue) => !isEmptyConfigValue(childValue));
    if (!hasChildValue && beforeChildErrors === errors.length && mandatoryForField(field, parentValue)) {
      errors.push(`Field ${label.name} (${path}) is mandatory, it must be specified`);
    }
    return;
  }

  if (field.type === "LIST") {
    const item = asMetadataItem(field.item);
    if (!item || !Array.isArray(value)) {
      errors.push(`Field ${label.name} (${path}) equals "${String(value)}", and cannot be parsed as LIST`);
      return;
    }
    value.forEach((entry, index) => validateField(item, entry, null, `${path}[${index}]`, errors));
    return;
  }

  const text = String(value);
  if (field.type === "NUMBER" && !canParseNumberField(text)) {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as NUMBER`);
  }
  if (field.type === "STRING" && typeof value !== "string") {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as STRING`);
  }
  if (field.type === "FLOAT" && !canParseFloatField(text)) {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as FLOAT`);
  }
  if (field.type === "BOOLEAN" && typeof value !== "boolean") {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as BOOLEAN`);
  }
  if (field.type === "IP" && !canParseIpField(text)) {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as IP`);
  }
  if (field.type === "MAC" && !/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(text)) {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as MAC`);
  }
  const enumValues = Array.isArray(field.values) ? field.values.filter(isMetadataEnumValue) : [];
  if (field.type === "ENUM" && !enumValues.some((option) => Object.is(option, value))) {
    errors.push(`Field ${label.name} (${path}) equals "${text}", and cannot be parsed as ENUM`);
  }
}

function buildYamlPreview(fields: MetadataField[], value: ConfigObject) {
  const errors: string[] = [];
  const config: ConfigObject = {};
  for (const field of fields) {
    const id = fieldId(field);
    validateField(field, value[id], value, id, errors);
    const yamlValue = valueForYaml(field, value[id]);
    if (!isEmptyConfigValue(yamlValue)) {
      config[id] = yamlValue;
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      content: `### errors in config:\n# ${errors.join("\n# ")}`
    };
  }

  return {
    valid: true,
    content: `### Config file generated by TRex Stateless GUI ###\n\n${stringify([config], {
      defaultKeyType: "PLAIN",
      defaultStringType: "QUOTE_SINGLE"
    })}`
  };
}

function configErrorLinesFromPreview(content: string) {
  if (!content.startsWith("### errors in config:")) {
    return [];
  }
  return content
    .split("\n")
    .slice(1)
    .map((line) => line.replace(/^#\s?/, "").trim())
    .filter(Boolean);
}

function configErrorFieldPaths(errors: string[]) {
  return new Set(
    errors
      .map((error) => /\(([^)]+)\)/.exec(error)?.[1]?.trim() ?? "")
      .filter(Boolean)
  );
}

function hasConfigPathError(invalidPaths: Set<string>, path: string) {
  if (!path) {
    return false;
  }
  if (invalidPaths.has(path)) {
    return true;
  }
  for (const invalidPath of invalidPaths) {
    if (invalidPath.startsWith(`${path}.`) || invalidPath.startsWith(`${path}[`)) {
      return true;
    }
  }
  return false;
}

function scalarInputType(field: MetadataField) {
  if (field.type === "NUMBER" || field.type === "FLOAT") {
    return "text";
  }
  return "text";
}

function metadataTypeBadge(type: string | null) {
  switch (type) {
    case "BOOLEAN":
      return "bool";
    case "ENUM":
      return "enum";
    case "FLOAT":
      return "float";
    case "IP":
      return "ip";
    case "LIST":
      return "list";
    case "MAC":
      return "mac";
    case "NUMBER":
      return "num";
    case "OBJECT":
      return "obj";
    case "STRING":
      return "str";
    default:
      return type?.toLowerCase() ?? "-";
  }
}

function defaultText(field: MetadataField) {
  const hasRealDefault = field.default !== undefined
    && field.default !== null
    && field.default !== ""
    && !isSchemaPlaceholderValue(field, field.default);

  if (hasRealDefault) {
    return String(field.default);
  }

  switch (field.type) {
    case "NUMBER":
      return field.mandatory === true ? "required number" : "number";
    case "FLOAT":
      return field.mandatory === true ? "required decimal" : "decimal";
    case "IP":
      return field.mandatory === true ? "required IP" : "0.0.0.0";
    case "MAC":
      return "00:00:00:00:00:00";
    case "STRING":
      return field.mandatory === true ? "required text" : "text";
    default:
      return "";
  }
}

function configIndentStyle(depth: number) {
  return { "--daemon-config-indent": `${Math.max(depth, 0) * 14}px` } as CSSProperties;
}

function fieldTitleFromId(value: string | null | undefined) {
  if (!value) {
    return "Item";
  }
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function listIndexFromPath(path: string) {
  const match = /\[(\d+)\]$/.exec(path);
  return match ? Number(match[1]) : null;
}

function isGenericFieldName(name: string, type: string | null) {
  const normalized = name.trim().toLowerCase();
  return normalized === "object" || normalized === "item" || normalized === (type ?? "").toLowerCase();
}

function displayFieldName(field: MetadataField, parentFieldId: string | null | undefined, path: string, removable: boolean) {
  const label = fieldLabel(field);
  const index = removable ? listIndexFromPath(path) : null;
  if (index !== null) {
    const base = isGenericFieldName(label.name, label.type) ? fieldTitleFromId(parentFieldId) : label.name;
    return `${base} #${index + 1}`;
  }
  return label.name;
}

function fieldPathHint(path: string) {
  if (path.length <= 54) {
    return path;
  }
  return `...${path.slice(-51)}`;
}

function pathSegmentLabel(segment: string) {
  const listMatch = /^(.+)\[(\d+)\]$/.exec(segment);
  if (!listMatch) {
    return fieldTitleFromId(segment);
  }
  return `${fieldTitleFromId(listMatch[1])} #${Number(listMatch[2]) + 1}`;
}

function fieldContextHint(path: string) {
  const segments = path.split(".").filter(Boolean);
  if (segments.length <= 1) {
    return path;
  }
  return segments.slice(0, -1).map(pathSegmentLabel).join(" / ");
}

function MetadataBranch({
  field,
  depth,
  value,
  parentValue,
  onChange,
  onRemove,
  parentFieldId,
  deviceChoices,
  invalidPaths,
  path
}: {
  field: MetadataField;
  depth: number;
  value: ConfigValue | undefined;
  parentValue: ConfigObject | null;
  onChange: (nextValue: ConfigValue | undefined) => void;
  onRemove?: () => void;
  parentFieldId?: string | null;
  deviceChoices: DeviceChoice[];
  invalidPaths: Set<string>;
  path: string;
}) {
  const label = fieldLabel(field);
  const displayName = displayFieldName(field, parentFieldId, path, Boolean(onRemove));
  const pathHint = fieldPathHint(path);
  const contextHint = fieldContextHint(path);
  const children = asMetadataFields(field.attributes);
  const mandatory = mandatoryForField(field, parentValue);
  const hasError = hasConfigPathError(invalidPaths, path);
  const nodeClass = `${mandatory ? "daemon-config-node--mandatory" : ""} ${hasError ? "daemon-config-node--error" : ""}`;

  if (field.type === "OBJECT") {
    const objectValue = isConfigObject(value) ? value : {};
    return (
      <li>
        <div className={`daemon-config-node daemon-config-node--group ${nodeClass}`} style={configIndentStyle(depth)}>
          <span className="daemon-config-expander">{children.length > 0 ? "v" : ""}</span>
          <span className="daemon-config-label" title={typeof field.description === "string" ? field.description : pathHint}>
            <strong>{displayName}</strong>
            <em>{pathHint}</em>
          </span>
          {label.type ? <small className="daemon-config-type-badge" data-type={label.type.toLowerCase()}>{metadataTypeBadge(label.type)}</small> : <small />}
          <span className="daemon-config-muted-value">{children.length} field{children.length === 1 ? "" : "s"}</span>
          {onRemove ? (
            <button aria-label={`Remove ${label.name}`} className="daemon-config-remove" onClick={onRemove} title={`Remove ${label.name}`} type="button">
              <Trash2 aria-hidden="true" size={13} />
            </button>
          ) : <span />}
        </div>
        <ul>
          {children.map((child, index) => {
            const id = fieldId(child);
            return (
              <MetadataBranch
                depth={depth + 1}
                field={child}
                key={`${id}:${index}`}
                parentValue={objectValue}
                value={objectValue[id]}
                parentFieldId={fieldId(field)}
                deviceChoices={deviceChoices}
                invalidPaths={invalidPaths}
                path={`${path}.${id}`}
                onChange={(nextValue) => onChange({ ...objectValue, [id]: nextValue })}
              />
            );
          })}
        </ul>
      </li>
    );
  }

  if (field.type === "LIST") {
    const item = asMetadataItem(field.item);
    const listValue = Array.isArray(value) ? value : [];
    return (
      <li>
        <div className={`daemon-config-node daemon-config-node--group ${nodeClass}`} style={configIndentStyle(depth)}>
          <span className="daemon-config-expander">{item ? "v" : ""}</span>
          <span className="daemon-config-label" title={typeof field.description === "string" ? field.description : pathHint}>
            <strong>{displayName}</strong>
            <em>{pathHint}</em>
          </span>
          {label.type ? <small className="daemon-config-type-badge" data-type={label.type.toLowerCase()}>{metadataTypeBadge(label.type)}</small> : <small />}
          <span className="daemon-config-muted-value">{listValue.length} item{listValue.length === 1 ? "" : "s"}</span>
          {item ? (
            <button
              aria-label={`Add ${label.name}`}
              className="daemon-config-add"
              onClick={() => onChange([...listValue, emptyListItemValue(item) ?? ""])}
              title={`Add ${label.name}`}
              type="button"
            >
              <Plus aria-hidden="true" size={14} />
            </button>
          ) : <span />}
        </div>
        {item ? (
          <ul>
            {listValue.map((entry, index) => (
              <MetadataBranch
                depth={depth + 1}
                field={item}
                key={`${fieldId(item)}:${index}`}
                parentValue={null}
                value={entry}
                parentFieldId={fieldId(field)}
                deviceChoices={deviceChoices}
                invalidPaths={invalidPaths}
                path={`${path}[${index}]`}
                onChange={(nextValue) => {
                  const nextList = [...listValue];
                  nextList[index] = nextValue ?? {};
                  onChange(nextList);
                }}
                onRemove={() => onChange(listValue.filter((_, itemIndex) => itemIndex !== index))}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const selectValues = Array.isArray(field.values) ? field.values.filter(isMetadataEnumValue) : [];
  const selectedIndex = selectValues.findIndex((option) => Object.is(option, value));
  const selectedDevice = typeof value === "string" && deviceChoices.some((choice) => choice.slot === value) ? value : "";
  const useInterfaceSelector = parentFieldId === "interfaces" && field.type === "STRING" && deviceChoices.length > 0;

  return (
    <li>
      <div className={`daemon-config-node daemon-config-node--input ${nodeClass}`} style={configIndentStyle(depth)}>
        <span className="daemon-config-expander" />
        <span className="daemon-config-label" title={typeof field.description === "string" ? field.description : pathHint}>
          <strong>{displayName}</strong>
          <em>{contextHint}</em>
        </span>
        {label.type ? <small className="daemon-config-type-badge" data-type={label.type.toLowerCase()}>{metadataTypeBadge(label.type)}</small> : <small />}
        {field.type === "BOOLEAN" ? (
          <span className="daemon-boolean-control">
            <label className={!isEmptyConfigValue(value) ? "daemon-boolean-toggle daemon-boolean-toggle--active" : "daemon-boolean-toggle"}>
              <input
                aria-label={`Include ${label.name}`}
                checked={!isEmptyConfigValue(value)}
                onChange={(event) => {
                  if (!event.target.checked) {
                    onChange(undefined);
                    return;
                  }
                  onChange(String(field.default).toLowerCase() === "true");
                }}
                type="checkbox"
              />
              <span>Include</span>
            </label>
            <label className={value ? "daemon-boolean-toggle daemon-boolean-toggle--active" : "daemon-boolean-toggle"}>
              <input
                aria-label={`Enabled value for ${label.name}`}
                checked={Boolean(value)}
                disabled={isEmptyConfigValue(value)}
                onChange={(event) => onChange(event.target.checked)}
                type="checkbox"
              />
              <span>Enabled</span>
            </label>
          </span>
        ) : useInterfaceSelector ? (
          <span className="daemon-interface-control">
            <input
              aria-label={label.name}
              onChange={(event) => onChange(event.target.value)}
              placeholder={defaultText(field)}
              type="text"
              value={String(value ?? "")}
            />
            <select
              aria-label={`Select ${label.name}`}
              title={selectedDevice ? deviceChoices.find((choice) => choice.slot === selectedDevice)?.details : undefined}
              value={selectedDevice}
              onChange={(event) => {
                if (event.target.value !== "") {
                  onChange(event.target.value);
                }
              }}
            >
              <option value="">Select</option>
              {deviceChoices.map((choice) => (
                <option key={choice.slot} title={choice.details} value={choice.slot}>{choice.label}</option>
              ))}
            </select>
          </span>
        ) : field.type === "ENUM" && selectValues.length > 0 ? (
          <select
            aria-label={label.name}
            value={selectedIndex >= 0 ? String(selectedIndex) : ""}
            onChange={(event) => {
              if (event.target.value === "") {
                onChange(undefined);
                return;
              }
              onChange(selectValues[Number(event.target.value)]);
            }}
          >
            <option value="">Not selected</option>
            {selectValues.map((option, index) => (
              <option key={`${index}:${String(option)}`} value={String(index)}>{String(option)}</option>
            ))}
          </select>
        ) : (
          <input
            aria-label={label.name}
            onChange={(event) => onChange(event.target.value)}
            placeholder={defaultText(field)}
            type={scalarInputType(field)}
            value={String(value ?? "")}
          />
        )}
        {onRemove ? (
          <button aria-label={`Remove ${label.name}`} className="daemon-config-remove" onClick={onRemove} title={`Remove ${label.name}`} type="button">
            <Trash2 aria-hidden="true" size={13} />
          </button>
        ) : <span />}
      </div>
    </li>
  );
}

function daemonActionMessage(result: DaemonTrexResult | null) {
  if (!result) {
    return "";
  }
  const action = result.action;
  const lines: string[] = [];
  if (!result.ok) {
    if (action === "start" && result.config_uploaded) {
      lines.push("Config was uploaded successfully");
    }
    if (action === "start") {
      if (result.blocker === "daemon_config_upload_failed" || result.blocker === "daemon_config_upload_result_invalid") {
        lines.push(`Config upload to TRex host failed: ${result.error || result.blocker}`);
        return lines.join("\n");
      }
      lines.push(`Unable to start TRex: ${result.error || result.blocker || "command failed"}`);
      return lines.join("\n");
    }
    if (action === "stop") {
      return `Unable to stop TRex: ${result.error || result.blocker || "command failed"}`;
    }
    return `${result.blocker ?? "daemon_blocked"} ${result.error ?? ""}`.trim();
  }
  if (action === "start") {
    if (result.config_uploaded) {
      lines.push("Config was uploaded successfully");
    }
    if (typeof result.timeout_seconds === "number") {
      lines.push(`Starting TRex... (timeout is ${result.timeout_seconds} sec)`);
    }
    if (typeof result.sequence === "number") {
      lines.push(`TRex run sequence: ${result.sequence}`);
    }
    if (result.audit_written === false && result.audit_record) {
      lines.push(`Config audit was not written: ${result.error || "audit write failed"}`);
    }
    lines.push("TRex was started successfully");
    return lines.join("\n");
  }
  if (action === "stop") {
    return result.stopped ? "TRex stopped successfully" : "TRex is not running";
  }
  return "TRex daemon command completed";
}

function daemonReservationMessage(result: DaemonTrexReservationResult | null) {
  if (!result) {
    return "";
  }
  if (!result.ok) {
    const action = result.action === "reserve" ? "reserve TRex" : "cancel TRex reservation";
    return `Unable to ${action}: ${result.error || result.blocker || "request failed"}`;
  }
  if (result.action === "reserve") {
    return "TRex reservation was acquired successfully";
  }
  return result.canceled ? "TRex reservation was canceled successfully" : "TRex is not reserved";
}

function statusVerbose(status: unknown) {
  if (!isMetadataObject(status)) {
    return "";
  }
  const verbose = (status as Record<string, unknown>).verbose;
  return isCleanMetadataString(verbose) ? verbose : "";
}

export function daemonRuntimeStatusLog(daemonOverview: DaemonOverview | null) {
  if (!daemonOverview?.rpc?.connected) {
    return "";
  }
  const runtimeStatus = daemonOverview.trex;
  if (!runtimeStatus.ok) {
    return `Unable to get TRex runtime status: ${runtimeStatus.error ?? runtimeStatus.blocker ?? "request failed"}`;
  }
  const verbose = statusVerbose(runtimeStatus.status);
  if (verbose) {
    return `TRex status: ${verbose}`;
  }
  if (runtimeStatus.running !== null && runtimeStatus.running !== undefined) {
    return `TRex status: ${runtimeStatus.running ? "Running" : "Idle"}`;
  }
  return "";
}

export function daemonMetadataStatusLog(error: string | null | undefined, hasUsableMetadata: boolean) {
  if (!error) {
    return "";
  }
  if (hasUsableMetadata) {
    return `Unable to get TRex devices info from TRex Daemon: ${error}`;
  }
  return `Unable to get TRex config Metadata, custom config usage will not be available: ${error}`;
}

function defaultConfigError(defaultConfig: DaemonDefaultConfig | null) {
  if (!defaultConfig || defaultConfig.ok) {
    return "";
  }
  return `Unable to get default config from TRex Daemon: ${defaultConfig.error ?? defaultConfig.blocker ?? "request failed"}`;
}

export function formatHostForUrl(host: string) {
  if (host.includes(":") && /^[0-9A-Fa-f:]+$/.test(host)) {
    return `[${host}]`;
  }
  return host;
}

function configPreviewFileName(result: DaemonTrexResult | null) {
  const name = result?.config_filename;
  return typeof name === "string" && name.trim() !== ""
    ? `${name.trim().replace(/[^A-Za-z0-9_.-]/g, "_")}.yaml`
    : "trex-daemon-preview.yaml";
}

function downloadConfigPreview(fileName: string, content: string) {
  const blob = new Blob([content], { type: "application/x-yaml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatVersionTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || "-";
  }
  return new Date(timestamp).toLocaleString();
}

function formatVersionSha(value: string) {
  return value ? value.slice(0, 12) : "-";
}

function formatVersionName(value: string) {
  return value ? value.replace(/\.yaml$/, "").slice(0, 24) : "-";
}

function formatAuditAction(value: string) {
  if (value === "restore") {
    return "Restore";
  }
  if (value === "start") {
    return "Start";
  }
  return value || "-";
}

function auditVersionName(record: DaemonConfigAudit["records"][number]) {
  return record.version_name ?? record.restored_name ?? "";
}

function auditVersionSha(record: DaemonConfigAudit["records"][number]) {
  return record.version_sha256 ?? record.restored_sha256 ?? "";
}

function auditBackupOrSequence(record: DaemonConfigAudit["records"][number]) {
  if (record.action === "start" && typeof record.sequence === "number") {
    return `seq ${record.sequence}`;
  }
  return record.before_name ? formatVersionName(record.before_name) : "-";
}

function formatVersionBytes(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${value} B`;
}

export function TrexDaemonDialog({
  environment,
  daemonOverview,
  daemonConnectionMessage,
  daemonConfigAudit,
  daemonConfigOverride,
  daemonConfigVersions,
  daemonConfigVersionDiff,
  daemonConfigVersionMessage,
  daemonDefaultConfig,
  daemonResult,
  daemonReservationResult,
  daemonError,
  isDaemonLoading,
  isDaemonBusy,
  isDaemonReservationBusy,
  isConfigLoading,
  isConfigVersionBusy,
  startTimeout,
  onStartTimeoutChange,
  onConnect,
  onDisconnect,
  onLoadDefaultConfig,
  onRefreshConfigVersions,
  onSaveConfigVersion,
  onLoadConfigVersion,
  onRestoreConfigVersion,
  onDiffConfigVersion,
  onDaemonAction,
  onDaemonReservationAction,
  onConfigContentChange
}: TrexDaemonDialogProps) {
  const [activeTab, setActiveTab] = useState<DaemonDialogTab>("config");
  const tabRefs = useRef<Partial<Record<DaemonDialogTab, HTMLButtonElement | null>>>({});
  const activeEnvironment = daemonOverview?.environment ?? environment;
  const config = daemonOverview?.config ?? null;
  const log = daemonOverview?.log ?? null;
  const connected = daemonOverview?.rpc?.connected ?? false;
  const daemonUrl = activeEnvironment
    ? `http://${formatHostForUrl(activeEnvironment.host)}:${activeEnvironment.daemon_port}`
    : "";
  const connectionLog = daemonOverview
    ? connected
      ? `Connection to ${daemonUrl} established`
      : `Unable to access ${daemonUrl} requested host and port`
    : daemonConnectionMessage ?? "";
  const metadataFields = useMemo(
    () => asMetadataFields(daemonOverview?.metadata?.metadata),
    [daemonOverview?.metadata?.metadata]
  );
  const hasConfigMetadata = metadataFields.length > 0;
  const deviceChoices = useMemo(
    () => deviceChoicesFromInfo(daemonOverview?.metadata?.devices_info),
    [daemonOverview?.metadata?.devices_info]
  );
  const metadataLog = daemonMetadataStatusLog(daemonOverview?.metadata?.error, hasConfigMetadata);
  const runtimeStatusLog = daemonRuntimeStatusLog(daemonOverview);
  const daemonLogError = log?.error ? `Unable to get TRex Daemon log: ${log.error}` : "";
  const reservation = daemonOverview?.trex_reservation ?? null;
  const reservationLabel = reservation?.reserved === true
    ? "Reserved"
    : reservation?.reserved === false
      ? "Free"
      : "Unknown";
  const reservationClass = reservation?.reserved === true
    ? "daemon-reservation-state--reserved"
    : reservation?.reserved === false
      ? "daemon-reservation-state--free"
      : "daemon-reservation-state--unknown";
  const rawYamlPreview = daemonConfigOverride?.content ?? (daemonDefaultConfig?.ok ? daemonDefaultConfig.content : config?.content || "");
  const configSourceKey = useMemo(
    () => `${daemonConfigOverride?.label ?? "live"}\n${JSON.stringify(metadataFields)}\n${rawYamlPreview}`,
    [daemonConfigOverride?.label, metadataFields, rawYamlPreview]
  );
  const initialConfigState = useMemo(
    () => initialConfigFromMetadata(metadataFields, rawYamlPreview),
    [metadataFields, rawYamlPreview]
  );
  const initialConfigModel = initialConfigState.model;
  const defaultConfigParseError = daemonDefaultConfig?.ok && initialConfigState.error
    ? `Unable to parse received default config YAML: ${initialConfigState.error}`
    : "";
  const [configEditState, setConfigEditState] = useState<{ sourceKey: string; model: ConfigObject }>(() => ({
    sourceKey: configSourceKey,
    model: initialConfigModel
  }));
  const [configPreviewStatus, setConfigPreviewStatus] = useState("");
  const [selectedVersionName, setSelectedVersionName] = useState("");
  const configModel = configEditState.sourceKey === configSourceKey ? configEditState.model : initialConfigModel;
  const configVersions = useMemo(() => daemonConfigVersions?.versions ?? [], [daemonConfigVersions?.versions]);
  const effectiveSelectedVersionName = selectedVersionName && configVersions.some((version) => version.name === selectedVersionName)
    ? selectedVersionName
    : configVersions[0]?.name ?? "";
  const selectedVersion = configVersions.find((version) => version.name === effectiveSelectedVersionName) ?? null;
  const auditRecords = daemonConfigAudit?.records ?? [];
  const generatedConfig = useMemo(
    () => {
      if (defaultConfigParseError) {
        return { valid: false, content: `### errors in config:\n# ${defaultConfigParseError}` };
      }
      return hasConfigMetadata
        ? buildYamlPreview(metadataFields, configModel)
        : { valid: true, content: rawYamlPreview };
    },
    [configModel, defaultConfigParseError, hasConfigMetadata, metadataFields, rawYamlPreview]
  );
  const configErrors = useMemo(() => configErrorLinesFromPreview(generatedConfig.content), [generatedConfig.content]);
  const invalidConfigPaths = useMemo(() => configErrorFieldPaths(configErrors), [configErrors]);
  const startDisabled = !connected || isDaemonBusy || !generatedConfig.valid;
  const startDisabledReason = !connected
    ? "Start disabled: TRex Daemon is not connected"
    : isDaemonBusy
      ? "Start disabled: daemon command is running"
      : !generatedConfig.valid
        ? "Start disabled: fix invalid config preview"
        : "";
  const configPreviewBytes = new TextEncoder().encode(generatedConfig.content).length;
  const uploadTarget = daemonResult?.files_path && daemonResult.config_filename
    ? `${daemonResult.files_path}/${daemonResult.config_filename}`
    : activeEnvironment?.config_path ?? "-";
  const logContent = [
    connectionLog,
    runtimeStatusLog,
    metadataLog,
    log?.content?.trimEnd(),
    daemonLogError,
    defaultConfigError(daemonDefaultConfig),
    defaultConfigParseError,
    daemonActionMessage(daemonResult),
    daemonReservationMessage(daemonReservationResult),
    daemonError
  ].filter(Boolean).join("\n");

  useLayoutEffect(() => {
    onConfigContentChange(generatedConfig.content, generatedConfig.valid);
  }, [generatedConfig.content, generatedConfig.valid, onConfigContentChange]);

  const updateConfigModel = (updater: (current: ConfigObject) => ConfigObject) => {
    setConfigEditState((current) => ({
      sourceKey: configSourceKey,
      model: updater(current.sourceKey === configSourceKey ? current.model : initialConfigModel)
    }));
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabId: DaemonDialogTab) => {
    const currentIndex = daemonDialogTabs.findIndex((tab) => tab.id === tabId);
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % daemonDialogTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + daemonDialogTabs.length) % daemonDialogTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = daemonDialogTabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = daemonDialogTabs[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <section className="daemon-dialog" aria-label="TRex Daemon workspace">
      <div className="daemon-connect-row">
        <label>
          <span>TRex Daemon host</span>
          <input readOnly value={activeEnvironment?.host ?? ""} />
        </label>
        <label className="daemon-port-field">
          <span>Port</span>
          <input readOnly value={activeEnvironment?.daemon_port ?? ""} />
        </label>
        <button className="normal-button" disabled={connected || isDaemonLoading || isDaemonBusy} onClick={onConnect} type="button">
          <Plug aria-hidden="true" size={15} />
          <span>{isDaemonLoading ? "Connecting" : "Connect"}</span>
        </button>
        <button className="normal-button" disabled={!connected || isDaemonBusy} onClick={onDisconnect} type="button">
          <Power aria-hidden="true" size={15} />
          <span>Disconnect</span>
        </button>
        <span className={`daemon-runtime-pill ${connected ? "daemon-runtime-pill--connected" : "daemon-runtime-pill--blocked"}`}>
          {connected ? "Daemon connected" : "Daemon disconnected"}
        </span>
        {runtimeStatusLog ? <span className="daemon-runtime-pill">{runtimeStatusLog.replace(/^TRex status:\s*/, "")}</span> : null}
      </div>

      <div className="daemon-tabs" role="tablist" aria-label="TRex daemon views">
        {daemonDialogTabs.map((tab) => (
          <button
            aria-controls={`daemon-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={`daemon-tab ${activeTab === tab.id ? "daemon-tab--active" : ""}`}
            id={`daemon-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
        <span className="daemon-tab-summary">
          {generatedConfig.valid ? "Config valid" : `Config invalid: ${Math.max(configErrors.length, 1)} issue${configErrors.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="daemon-workspace">
        {activeTab === "config" ? (
          <details
            aria-disabled={!hasConfigMetadata}
            aria-labelledby="daemon-tab-config"
            className={`daemon-config-pane ${hasConfigMetadata ? "" : "daemon-config-pane--disabled"}`}
            id="daemon-panel-config"
            onToggle={(event) => {
              if (!hasConfigMetadata) {
                event.currentTarget.open = false;
              }
            }}
            open={hasConfigMetadata}
            role="tabpanel"
            tabIndex={0}
          >
            <summary>TRex config edit</summary>
            <div className="daemon-config-content">
              <div className="daemon-config-toolbar">
                <button
                  className="normal-button daemon-load-button"
                  disabled={!connected || !hasConfigMetadata || isDaemonLoading || isConfigLoading || isDaemonBusy}
                  onClick={onLoadDefaultConfig}
                  type="button"
                >
                  <FileText aria-hidden="true" size={15} />
                  <span>{isConfigLoading ? "Loading" : "Load default config"}</span>
                </button>
                <div
                  className={`daemon-config-error-summary ${generatedConfig.valid ? "daemon-config-error-summary--valid" : ""}`}
                  title={generatedConfig.valid ? undefined : configErrors.join("\n")}
                >
                  <strong>{generatedConfig.valid ? "Valid preview" : "Invalid preview"}</strong>
                  <span>
                    {generatedConfig.valid
                      ? "Ready to start TRex with this generated YAML"
                      : `${Math.max(configErrors.length, 1)} config issue${configErrors.length === 1 ? "" : "s"}; affected fields are highlighted`}
                  </span>
                </div>
              </div>
              <div className="daemon-config-preview-bar" aria-label="TRex config preview actions">
                <span className={generatedConfig.valid ? "daemon-config-valid" : "daemon-config-invalid"}>
                  {generatedConfig.valid ? "Valid preview" : "Invalid preview"}
                </span>
                <span>{configPreviewBytes} bytes</span>
                <span title={uploadTarget}>Target: {uploadTarget}</span>
                <button
                  className="normal-button"
                  disabled={!generatedConfig.valid || generatedConfig.content.trim() === ""}
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard) {
                        throw new Error("clipboard unavailable");
                      }
                      await navigator.clipboard.writeText(generatedConfig.content);
                      setConfigPreviewStatus("Preview copied");
                    } catch {
                      setConfigPreviewStatus("Clipboard unavailable");
                    }
                  }}
                  type="button"
                >
                  <Copy aria-hidden="true" size={14} />
                  <span>Copy preview</span>
                </button>
                <button
                  className="normal-button"
                  disabled={!generatedConfig.valid || generatedConfig.content.trim() === ""}
                  onClick={() => {
                    const fileName = configPreviewFileName(daemonResult);
                    downloadConfigPreview(fileName, generatedConfig.content);
                    setConfigPreviewStatus(`Preview downloaded ${fileName}`);
                  }}
                  type="button"
                >
                  <Download aria-hidden="true" size={14} />
                  <span>Download preview</span>
                </button>
                {configPreviewStatus ? <span className="daemon-config-preview-status">{configPreviewStatus}</span> : null}
              </div>
              <div className="daemon-config-split">
                <div className="daemon-config-tree" aria-label="TRex config editor fields" role="region">
                  <div className="daemon-config-tree-header" role="presentation">
                    <span />
                    <span>Config item</span>
                    <span>Type</span>
                    <span>Value</span>
                    <span className="daemon-config-action-heading" title="Action" />
                  </div>
                  {metadataFields.length > 0 ? (
                    <ul>
                      <li>
                        <div className="daemon-config-node daemon-config-node--root">
                          <span className="daemon-config-expander">v</span>
                          <span className="daemon-config-label">
                            <strong>TRex config</strong>
                            <em>generated daemon YAML</em>
                          </span>
                          <small className="daemon-config-type-badge" data-type="root">root</small>
                          <span className="daemon-config-muted-value">{metadataFields.length} top-level field{metadataFields.length === 1 ? "" : "s"}</span>
                          <span />
                        </div>
                        <ul>
                          {metadataFields.map((field, index) => (
                            <MetadataBranch
                              depth={1}
                              field={field}
                              key={`${fieldId(field)}:${index}`}
                              parentValue={configModel}
                              value={configModel[fieldId(field)]}
                              parentFieldId={null}
                              deviceChoices={deviceChoices}
                              invalidPaths={invalidConfigPaths}
                              path={fieldId(field)}
                              onChange={(nextValue) =>
                                updateConfigModel((current) => ({
                                  ...current,
                                  [fieldId(field)]: nextValue
                                }))
                              }
                            />
                          ))}
                        </ul>
                      </li>
                    </ul>
                  ) : null}
                </div>
                <div className={generatedConfig.valid ? "daemon-yaml-preview" : "daemon-yaml-preview daemon-yaml-preview--invalid"}>
                  <span>YAML preview:</span>
                  {!generatedConfig.valid ? (
                    <div className="daemon-yaml-preview-errors" role="alert">
                      <strong>Preview blocked</strong>
                      <ul>
                        {(configErrors.length > 0 ? configErrors : ["Generated config is invalid"]).slice(0, 4).map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <ReadOnlyCodeView
                    label="Generated TRex YAML preview"
                    value={generatedConfig.content}
                    variant="yaml"
                  />
                </div>
              </div>
            </div>
          </details>
        ) : null}

        {activeTab === "versions" ? (
          <section
            aria-label="TRex config versions"
            aria-labelledby="daemon-tab-versions"
            className="daemon-config-versions"
            id="daemon-panel-versions"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="daemon-config-version-toolbar">
              <strong>Config versions</strong>
              <select
                aria-label="Config version"
                disabled={isConfigVersionBusy || configVersions.length === 0}
                onChange={(event) => setSelectedVersionName(event.target.value)}
                value={effectiveSelectedVersionName}
              >
                {configVersions.length === 0 ? <option value="">No versions</option> : null}
                {configVersions.map((version) => (
                  <option key={version.name} value={version.name}>
                    {`${formatVersionTime(version.created_at)} ${version.source} ${formatVersionSha(version.sha256)}`}
                  </option>
                ))}
              </select>
              <button
                className="normal-button"
                disabled={isConfigVersionBusy}
                onClick={onRefreshConfigVersions}
                type="button"
              >
                <RefreshCcw aria-hidden="true" size={14} />
                <span>Refresh</span>
              </button>
              <button
                className="normal-button"
                disabled={isConfigVersionBusy || !generatedConfig.valid || generatedConfig.content.trim() === ""}
                onClick={() => onSaveConfigVersion(generatedConfig.content)}
                type="button"
              >
                <Save aria-hidden="true" size={14} />
                <span>Save</span>
              </button>
              <button
                className="normal-button"
                disabled={isConfigVersionBusy || !selectedVersion}
                onClick={() => selectedVersion ? onDiffConfigVersion(selectedVersion.name, generatedConfig.content) : undefined}
                type="button"
              >
                <GitCompare aria-hidden="true" size={14} />
                <span>Diff</span>
              </button>
              <button
                className="normal-button"
                disabled={isConfigVersionBusy || !selectedVersion}
                onClick={() => selectedVersion ? onLoadConfigVersion(selectedVersion.name) : undefined}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={14} />
                <span>Load</span>
              </button>
              <button
                className="normal-button danger-command"
                disabled={isConfigVersionBusy || !selectedVersion}
                onClick={() => selectedVersion ? onRestoreConfigVersion(selectedVersion.name) : undefined}
                type="button"
              >
                <Upload aria-hidden="true" size={14} />
                <span>Restore</span>
              </button>
              {daemonConfigVersionMessage ? <span className="daemon-config-version-status">{daemonConfigVersionMessage}</span> : null}
            </div>
            <div className="daemon-config-version-table" role="table" aria-label="Saved TRex config versions">
              <div role="row">
                <span role="columnheader">Created</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">Size</span>
                <span role="columnheader">SHA</span>
                <span role="columnheader">Note</span>
              </div>
              {configVersions.slice(0, 12).map((version) => (
                <button
                  aria-label={`Select config version ${version.name}`}
                  className={`daemon-config-version-row ${version.name === effectiveSelectedVersionName ? "daemon-config-version-row--selected" : ""}`}
                  key={version.name}
                  onClick={() => setSelectedVersionName(version.name)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{formatVersionTime(version.created_at)}</span>
                  <span role="cell">{version.source}</span>
                  <span role="cell">{formatVersionBytes(version.size_bytes)}</span>
                  <span role="cell">{formatVersionSha(version.sha256)}</span>
                  <span role="cell">{version.note ?? "-"}</span>
                </button>
              ))}
              {configVersions.length === 0 ? (
                <div className="daemon-config-version-empty" role="row">
                  <span role="cell">No saved config versions</span>
                </div>
              ) : null}
            </div>
            {daemonConfigVersionDiff ? (
              <div className="daemon-config-version-diff">
                <div>
                  <strong>Diff</strong>
                  <span>{daemonConfigVersionDiff.ok ? daemonConfigVersionDiff.name : daemonConfigVersionDiff.blocker ?? "blocked"}</span>
                  {daemonConfigVersionDiff.truncated ? <span>truncated</span> : null}
                </div>
                <pre>{daemonConfigVersionDiff.ok ? daemonConfigVersionDiff.diff || "No differences" : daemonConfigVersionDiff.error ?? ""}</pre>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "audit" ? (
          <section
            aria-label="TRex config audit"
            aria-labelledby="daemon-tab-audit"
            className="daemon-config-audit daemon-config-audit--standalone"
            id="daemon-panel-audit"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="daemon-config-audit-header">
              <strong>Audit</strong>
              {daemonConfigAudit?.truncated ? <span>tail only</span> : null}
              {daemonConfigAudit && daemonConfigAudit.skipped_lines > 0 ? <span>{daemonConfigAudit.skipped_lines} skipped</span> : null}
            </div>
            <div className="daemon-config-audit-table" role="table" aria-label="Saved TRex config audit events">
              <div role="row">
                <span role="columnheader">Time</span>
                <span role="columnheader">Action</span>
                <span role="columnheader">Version</span>
                <span role="columnheader">Backup / Seq</span>
                <span role="columnheader">Target</span>
              </div>
              {auditRecords.slice(0, 16).map((record) => (
                <div className="daemon-config-audit-row" key={`${record.created_at}:${auditVersionName(record)}:${record.action}`} role="row">
                  <span role="cell">{formatVersionTime(record.created_at)}</span>
                  <span role="cell">{formatAuditAction(record.action)}</span>
                  <span role="cell" title={auditVersionName(record)}>{formatVersionSha(auditVersionSha(record))}</span>
                  <span role="cell" title={record.before_name ?? record.config_filename ?? undefined}>{auditBackupOrSequence(record)}</span>
                  <span role="cell" title={record.config_path}>{record.config_path}</span>
                </div>
              ))}
              {daemonConfigAudit === null ? (
                <div className="daemon-config-version-empty" role="row">
                  <span role="cell">Audit not loaded</span>
                </div>
              ) : null}
              {daemonConfigAudit !== null && auditRecords.length === 0 ? (
                <div className="daemon-config-version-empty" role="row">
                  <span role="cell">No config audit events</span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === "log" ? (
          <div
            aria-labelledby="daemon-tab-log"
            className="daemon-log-pane daemon-log-pane--standalone"
            id="daemon-panel-log"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="daemon-log-tabs">
              <span aria-current="true" className="log-tab log-tab--active">Log view</span>
            </div>
            <ReadOnlyCodeView
              label="TRex daemon log"
              value={logContent}
              variant="log"
            />
          </div>
        ) : null}
        {daemonDialogTabs.filter((tab) => tab.id !== activeTab).map((tab) => (
          <div
            aria-labelledby={`daemon-tab-${tab.id}`}
            hidden
            id={`daemon-panel-${tab.id}`}
            key={tab.id}
            role="tabpanel"
          />
        ))}
      </div>

      <div className="daemon-action-row">
        <div className="daemon-reservation-group" aria-label="TRex daemon reservation">
          <span className={`daemon-reservation-state ${reservationClass}`}>Reservation: {reservationLabel}</span>
          <button
            className="normal-button"
            disabled={!connected || isDaemonBusy || isDaemonReservationBusy || reservation?.reserved === true}
            onClick={() => onDaemonReservationAction("reserve")}
            type="button"
          >
            <Lock aria-hidden="true" size={15} />
            <span>{isDaemonReservationBusy ? "Running" : "Reserve"}</span>
          </button>
          <button
            className="normal-button"
            disabled={!connected || isDaemonBusy || isDaemonReservationBusy || reservation?.reserved !== true}
            onClick={() => onDaemonReservationAction("cancel")}
            type="button"
          >
            <Unlock aria-hidden="true" size={15} />
            <span>Cancel</span>
          </button>
        </div>
        <button className="normal-button danger-command daemon-stop-button" disabled={!connected || isDaemonBusy} onClick={() => onDaemonAction("stop")} type="button">
          <Square aria-hidden="true" size={15} />
          <span>Stop</span>
        </button>
        <label className="daemon-timeout-field">
          <span>Start timeout</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={!connected || isDaemonBusy}
            value={startTimeout}
            onChange={(event) => onStartTimeoutChange(digitsOnly(event.target.value))}
          />
        </label>
        <button className="normal-button daemon-start-button" disabled={startDisabled} onClick={() => onDaemonAction("start")} type="button">
          <Play aria-hidden="true" size={15} />
          <span>Start</span>
        </button>
        {startDisabledReason ? <span className="daemon-start-disabled-reason">{startDisabledReason}</span> : null}
      </div>
    </section>
  );
}
