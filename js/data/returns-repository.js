import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260814-simplified-container-flow";

export const returnsRepository = {
  list: async () => {
    try {
      return await selectAll("sale_returns", "*", (query) => query.order("created_at", { ascending: false }).limit(2000));
    } catch (error) {
      if (["42P01", "PGRST205"].includes(error?.code)) return [];
      throw error;
    }
  },
  create: (entry) => rpc("return_sale", commandArgs({
    p_return_id: /^[0-9a-f-]{36}$/i.test(entry.id || "") ? entry.id : entityId(),
    p_sale_id: entry.saleId,
    p_quantity: Number(entry.qty),
    p_cash_session_id: entry.cashSessionId || null,
    p_reason: entry.reason || "",
  })),
};
