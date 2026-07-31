# TRex configuration examples

`trex_cfg.yaml` is a fictional six-port i350 example for understanding the
configuration shape. It uses reserved documentation IP networks, locally
administered MAC placeholders, and invented PCI addresses. It has not been
certified against any TRex release, NIC firmware, DPDK driver, kernel, CPU
topology, or physical cabling.

Do not copy it directly into `/etc` or `/var/lib/trex-webui`.

Before adapting it:

1. Isolate the traffic-generator ports from production networks.
2. Inventory the real PCI functions with `lspci -Dnn` and TRex
   `dpdk_setup_ports.py -s`.
3. Confirm driver binding, IOMMU/hugepages, NUMA sockets, and available worker
   cores against the TRex documentation for the installed release.
4. Map each intended cable pair explicitly and replace all six `interfaces`
   entries in the desired TRex port order.
5. Replace every MAC and IP value. The `02:00:*` MACs and RFC 5737 addresses in
   the example are documentation placeholders, not discovered hardware values.
6. Replace the `platform` CPU/socket assignments. Do not assume the example's
   master, latency, or worker threads fit the target CPU topology.
7. Validate and preview the edited YAML before activating it. Start with traffic
   idle and no ports reserved by another client.

For the standard deployment, the writable configuration authority is
`/var/lib/trex-webui/trex_cfg.yaml`. The public example must remain separate
from that active path. A successful parse or daemon start is not hardware
certification; real traffic, capture, cleanup, and report evidence are still
required for the exact host configuration.

See [the development guide](../docs/DEVELOPMENT.md) for the hardware acceptance
workflow and [the support matrix](../docs/SUPPORT_MATRIX.md) for the currently
documented platform boundary.
