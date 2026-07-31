export type LogRow = {
  level: "Info" | "Event" | "Warn";
  message: string;
  timestamp?: string;
};

export type StatsRow = {
  scope: string;
  metric: string;
  value: string;
};

export type StatsHistorySample = {
  timestamp: number;
  txPps: number;
  rxPps: number;
  txBps: number;
  rxBps: number;
  dropBps?: number;
  queueFull: number;
  latencyAvg: number;
};
