import type { ProfileWorkbenchStream } from "../../../api";
import {
  runArpHardwareSizeChange,
  runArpHardwareTypeChange,
  runArpOperationChange,
  runArpOperationCountChange,
  runArpOperationModeChange,
  runArpOperationStepChange,
  runArpProtocolSizeChange,
  runArpProtocolTypeChange,
  runArpSenderIpChange,
  runArpSenderIpCountChange,
  runArpSenderIpModeChange,
  runArpSenderIpStepChange,
  runArpSenderMacChange,
  runArpSenderMacCountChange,
  runArpSenderMacModeChange,
  runArpSenderMacStepChange,
  runArpTargetIpChange,
  runArpTargetIpCountChange,
  runArpTargetIpModeChange,
  runArpTargetIpStepChange,
  runArpTargetMacChange,
  runArpTargetMacCountChange,
  runArpTargetMacModeChange,
  runArpTargetMacStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataArpHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataArpHandlers = {
  changeArpHardwareSize: (value: number) => boolean;
  changeArpHardwareType: (value: number) => boolean;
  changeArpOperation: (value: number) => boolean;
  changeArpOperationCount: (value: number) => boolean;
  changeArpOperationMode: (value: ProfileWorkbenchStream["arp_operation_mode"]) => boolean;
  changeArpOperationStep: (value: number) => boolean;
  changeArpProtocolSize: (value: number) => boolean;
  changeArpProtocolType: (value: string) => boolean;
  changeArpSenderIp: (value: string) => boolean;
  changeArpSenderIpCount: (value: number) => boolean;
  changeArpSenderIpMode: (value: ProfileWorkbenchStream["arp_sender_ip_mode"]) => boolean;
  changeArpSenderIpStep: (value: number) => boolean;
  changeArpSenderMac: (value: string) => boolean;
  changeArpSenderMacCount: (value: number) => boolean;
  changeArpSenderMacMode: (value: ProfileWorkbenchStream["arp_sender_mac_mode"]) => boolean;
  changeArpSenderMacStep: (value: number) => boolean;
  changeArpTargetIp: (value: string) => boolean;
  changeArpTargetIpCount: (value: number) => boolean;
  changeArpTargetIpMode: (value: ProfileWorkbenchStream["arp_target_ip_mode"]) => boolean;
  changeArpTargetIpStep: (value: number) => boolean;
  changeArpTargetMac: (value: string) => boolean;
  changeArpTargetMacCount: (value: number) => boolean;
  changeArpTargetMacMode: (value: ProfileWorkbenchStream["arp_target_mac_mode"]) => boolean;
  changeArpTargetMacStep: (value: number) => boolean;
};

export function workspaceProtocolDataArpHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataArpHandlerOptions): WorkspaceProtocolDataArpHandlers {
  return {
    changeArpHardwareSize: (value) => runArpHardwareSizeChange(value, selectedStream, streamPatchHandlers),
    changeArpHardwareType: (value) => runArpHardwareTypeChange(value, selectedStream, streamPatchHandlers),
    changeArpOperation: (value) => runArpOperationChange(value, selectedStream, streamPatchHandlers),
    changeArpOperationCount: (value) => runArpOperationCountChange(value, selectedStream, streamPatchHandlers),
    changeArpOperationMode: (value) => runArpOperationModeChange(value, selectedStream, streamPatchHandlers),
    changeArpOperationStep: (value) => runArpOperationStepChange(value, selectedStream, streamPatchHandlers),
    changeArpProtocolSize: (value) => runArpProtocolSizeChange(value, selectedStream, streamPatchHandlers),
    changeArpProtocolType: (value) => runArpProtocolTypeChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderIp: (value) => runArpSenderIpChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderIpCount: (value) => runArpSenderIpCountChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderIpMode: (value) => runArpSenderIpModeChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderIpStep: (value) => runArpSenderIpStepChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderMac: (value) => runArpSenderMacChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderMacCount: (value) => runArpSenderMacCountChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderMacMode: (value) => runArpSenderMacModeChange(value, selectedStream, streamPatchHandlers),
    changeArpSenderMacStep: (value) => runArpSenderMacStepChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetIp: (value) => runArpTargetIpChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetIpCount: (value) => runArpTargetIpCountChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetIpMode: (value) => runArpTargetIpModeChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetIpStep: (value) => runArpTargetIpStepChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetMac: (value) => runArpTargetMacChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetMacCount: (value) => runArpTargetMacCountChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetMacMode: (value) => runArpTargetMacModeChange(value, selectedStream, streamPatchHandlers),
    changeArpTargetMacStep: (value) => runArpTargetMacStepChange(value, selectedStream, streamPatchHandlers)
  };
}
