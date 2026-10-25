import { selectAll } from "./repository-utils.js?v=20260906-mobile-capture-v5";

export const reportsRepository = {
  listAudit: () =>
    selectAll("audit_log", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(1000),
    ),
};
