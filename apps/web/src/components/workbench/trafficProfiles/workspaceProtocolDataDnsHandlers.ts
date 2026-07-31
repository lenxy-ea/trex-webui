import type { ProfileWorkbenchStream } from "../../../api";
import {
  runDnsAnswerSelectionChange,
  runDnsCountChange,
  runDnsModeChange,
  runDnsNumberChange,
  runDnsSelectionChange,
  runDnsStepChange,
  runDnsTextChange,
  type DnsModePatchAction,
  type DnsNumericPatchField,
  type DnsTextPatchField,
  type DnsVariablePatchField,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataDnsHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceDnsModeChange = {
  (field: "transaction-id", value: ProfileWorkbenchStream["dns_transaction_id_mode"]): boolean;
  (field: "flags", value: ProfileWorkbenchStream["dns_flags_mode"]): boolean;
  (field: "query-type", value: ProfileWorkbenchStream["dns_query_type_mode"]): boolean;
  (field: "query-class", value: ProfileWorkbenchStream["dns_query_class_mode"]): boolean;
  (field: "answer-ttl", value: ProfileWorkbenchStream["dns_answer_ttl_mode"]): boolean;
  (field: "answer-ipv4", value: ProfileWorkbenchStream["dns_answer_ipv4_mode"]): boolean;
};

export type WorkspaceProtocolDataDnsHandlers = {
  changeDnsAnswerSelection: (value: boolean) => boolean;
  changeDnsCount: (field: DnsVariablePatchField, value: number) => boolean;
  changeDnsMode: WorkspaceDnsModeChange;
  changeDnsNumber: (field: DnsNumericPatchField, value: number) => boolean;
  changeDnsSelection: (value: boolean) => boolean;
  changeDnsStep: (field: DnsVariablePatchField, value: number) => boolean;
  changeDnsText: (field: DnsTextPatchField, value: string) => boolean;
};

export function workspaceProtocolDataDnsHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataDnsHandlerOptions): WorkspaceProtocolDataDnsHandlers {
  function changeDnsMode(
    field: "transaction-id",
    value: ProfileWorkbenchStream["dns_transaction_id_mode"]
  ): boolean;
  function changeDnsMode(field: "flags", value: ProfileWorkbenchStream["dns_flags_mode"]): boolean;
  function changeDnsMode(field: "query-type", value: ProfileWorkbenchStream["dns_query_type_mode"]): boolean;
  function changeDnsMode(field: "query-class", value: ProfileWorkbenchStream["dns_query_class_mode"]): boolean;
  function changeDnsMode(field: "answer-ttl", value: ProfileWorkbenchStream["dns_answer_ttl_mode"]): boolean;
  function changeDnsMode(field: "answer-ipv4", value: ProfileWorkbenchStream["dns_answer_ipv4_mode"]): boolean;
  function changeDnsMode(field: DnsModePatchAction["field"], value: DnsModePatchAction["mode"]) {
    switch (field) {
      case "transaction-id":
        return runDnsModeChange(
          field,
          value as ProfileWorkbenchStream["dns_transaction_id_mode"],
          selectedStream,
          streamPatchHandlers
        );
      case "flags":
        return runDnsModeChange(
          field,
          value as ProfileWorkbenchStream["dns_flags_mode"],
          selectedStream,
          streamPatchHandlers
        );
      case "query-type":
        return runDnsModeChange(
          field,
          value as ProfileWorkbenchStream["dns_query_type_mode"],
          selectedStream,
          streamPatchHandlers
        );
      case "query-class":
        return runDnsModeChange(
          field,
          value as ProfileWorkbenchStream["dns_query_class_mode"],
          selectedStream,
          streamPatchHandlers
        );
      case "answer-ttl":
        return runDnsModeChange(
          field,
          value as ProfileWorkbenchStream["dns_answer_ttl_mode"],
          selectedStream,
          streamPatchHandlers
        );
      case "answer-ipv4":
        return runDnsModeChange(
          field,
          value as ProfileWorkbenchStream["dns_answer_ipv4_mode"],
          selectedStream,
          streamPatchHandlers
        );
    }
  }

  return {
    changeDnsAnswerSelection: (value) =>
      runDnsAnswerSelectionChange(value, selectedStream, streamPatchHandlers),
    changeDnsCount: (field, value) => runDnsCountChange(field, value, selectedStream, streamPatchHandlers),
    changeDnsMode,
    changeDnsNumber: (field, value) => runDnsNumberChange(field, value, selectedStream, streamPatchHandlers),
    changeDnsSelection: (value) => runDnsSelectionChange(value, selectedStream, streamPatchHandlers),
    changeDnsStep: (field, value) => runDnsStepChange(field, value, selectedStream, streamPatchHandlers),
    changeDnsText: (field, value) => runDnsTextChange(field, value, selectedStream, streamPatchHandlers)
  };
}
