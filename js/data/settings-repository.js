import { selectAll, rpc, commandArgs } from "./repository-utils.js?v=20260814-simplified-container-flow";

export const settingsRepository = {
  list: () => selectAll("settings"),
  save: (settings) =>
    rpc(
      "update_operational_settings",
      commandArgs({
        p_payload: {
          business_name: settings.businessName,
          default_price_cents: Math.round(Number(settings.defaultPrice) * 100),
          maintenance_threshold: Number(settings.maintenanceThreshold),
        },
      }),
    ),
};
