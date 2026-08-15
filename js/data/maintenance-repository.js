import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260815-menu-backdrop-fix";

export const maintenanceRepository = {
  list: () => selectAll("maintenance_events", "*", (query) => query.order("created_at", { ascending: false }).limit(1000)),
  register: (entry) => rpc("register_maintenance_service", commandArgs({
    p_reference_id: /^[0-9a-f-]{36}$/i.test(entry.id || "") ? entry.id : entityId(),
    p_notes: entry.notes || "",
  })),
};
