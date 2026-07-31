import type { ProfilePacketPreview, ProfilePacketPreviewLine } from "../../../api";
import { formatLayerField } from "./model";

export type PacketViewerTreeRow = {
  field: string;
  key: string;
  layer: string;
  value: string;
};

export type PacketViewerEmptyRow = {
  colSpan: number;
  text: string;
};

export type PacketViewerTableViewModel = {
  emptyRow: PacketViewerEmptyRow;
  rows: PacketViewerTreeRow[];
  showEmptyRow: boolean;
};

export type PacketViewerHexViewModel = {
  emptyRow: PacketViewerEmptyRow;
  rows: ProfilePacketPreviewLine[];
  showEmptyRow: boolean;
};

export function packetViewerEmptyText(isBusy: boolean) {
  return isBusy ? "Rendering packet" : "No packet preview";
}

export function packetViewerTreeRows(preview: ProfilePacketPreview | null): PacketViewerTreeRow[] {
  if (!preview) {
    return [];
  }
  return preview.layers.flatMap((layer, layerIndex) =>
    Object.entries(layer.fields).map(([field, value], fieldIndex) => ({
      field,
      key: `${layerIndex}:${layer.name}:${field}`,
      layer: fieldIndex === 0 ? layer.name : "",
      value: formatLayerField(value)
    }))
  );
}

export function packetViewerTreeViewModel(
  preview: ProfilePacketPreview | null,
  isBusy: boolean
): PacketViewerTableViewModel {
  return {
    emptyRow: {
      colSpan: 3,
      text: packetViewerEmptyText(isBusy)
    },
    rows: packetViewerTreeRows(preview),
    showEmptyRow: !preview
  };
}

export function packetViewerHexViewModel(
  preview: ProfilePacketPreview | null,
  isBusy: boolean
): PacketViewerHexViewModel {
  return {
    emptyRow: {
      colSpan: 3,
      text: packetViewerEmptyText(isBusy)
    },
    rows: preview?.hex_lines ?? [],
    showEmptyRow: !preview
  };
}
