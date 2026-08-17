import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260817-envases-en-la-venta";

export const ledgerRepository = {
  listPayments: () =>
    selectAll("payments", "*", (query) =>
      query.order("occurred_at", { ascending: false }).limit(1000),
    ),
  listEntries: () =>
    selectAll("ledger_entries", "*", (query) =>
      query.order("created_at", { ascending: true }).limit(3000),
    ),
  registerPayment: (payment) =>
    rpc(
      "register_payment",
      commandArgs({
        p_payment_id: entityId(),
        p_payload: {
          client_id: payment.clientId,
          cash_session_id: payment.cashSessionId || null,
          amount_cents: Math.round(Number(payment.payment) * 100),
          payment_method: payment.method,
          notes: payment.notes || "",
          occurred_at: payment.date,
        },
      }),
    ),
};
