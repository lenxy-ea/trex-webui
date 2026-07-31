import type { TrexPortRecord } from "../../api";

const CONNECT_RUNTIME_REASON = "Connect to TRex RPC to use runtime controls.";
const PORTS_UNAVAILABLE_REASON = "TRex port inventory is unavailable.";
const NO_PORTS_REASON = "No TRex ports are available.";

type RuntimeControlOverview = {
  trex_probe: {
    ok: boolean;
  };
  trex_ports: {
    data: {
      ports: TrexPortRecord[];
    } | null;
    ok: boolean;
  };
};

export function runtimeControlDisabledReason(overview: RuntimeControlOverview | null): string | null {
  if (!overview?.trex_probe?.ok) {
    return CONNECT_RUNTIME_REASON;
  }
  if (!overview.trex_ports.ok || !overview.trex_ports.data) {
    return PORTS_UNAVAILABLE_REASON;
  }
  if (overview.trex_ports.data.ports.length === 0) {
    return NO_PORTS_REASON;
  }
  return null;
}
