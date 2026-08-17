import { selectAll } from "./repository-utils.js?v=20260817-vacios-ronda";

export const reportsRepository = {
  listAudit: () =>
    selectAll("audit_log", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(1000),
    ),
};
