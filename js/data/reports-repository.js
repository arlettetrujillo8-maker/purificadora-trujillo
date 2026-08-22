import { selectAll } from "./repository-utils.js?v=20260818-modo-offline-v1";

export const reportsRepository = {
  listAudit: () =>
    selectAll("audit_log", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(1000),
    ),
};
