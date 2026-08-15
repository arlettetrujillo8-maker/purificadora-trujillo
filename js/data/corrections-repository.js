import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260814-simplified-container-flow";

const uuid = (value) => /^[0-9a-f-]{36}$/i.test(value || "") ? value : entityId();

export const correctionsRepository = {
  list: () => selectAll("sale_corrections", "*", (query) => query.order("created_at", { ascending: false }).limit(1000)),
  listCashAdjustments: async () => {
    try {
      return await selectAll("sale_cash_adjustments", "*", (query) => query.order("created_at", { ascending: false }).limit(1000));
    } catch (error) {
      if (["42P01", "PGRST205"].includes(error?.code)) return [];
      throw error;
    }
  },
  correct: (correction, replacement, cashSessionId = null) => rpc("correct_sale_with_containers", commandArgs({
    p_correction_id: uuid(correction.id),
    p_replacement_sale_id: uuid(replacement.id),
    p_original_sale_id: correction.originalSaleId,
    p_payload: {
      reason: correction.reason,
      client_id: replacement.clientId || null,
      channel: replacement.channel,
      round_id: replacement.roundId || null,
      cash_session_id: cashSessionId || replacement.cashSessionId || null,
      quantity: Number(replacement.qty),
      unit_price_cents: Math.round(Number(replacement.unitPrice ?? replacement.price) * 100),
      total_cents: Math.round(Number(replacement.total) * 100),
      paid_cents: Math.round(Number(replacement.paid) * 100),
      credit_cents: Math.round(Number(replacement.credit) * 100),
      payment_method: replacement.paymentType,
      notes: replacement.notes || "",
      empty_return_quantity: Number(replacement.emptyReturnQty ?? replacement.qty),
      damaged_return_quantity: Number(replacement.damagedReturnQty || 0),
      occurred_at: replacement.date,
    },
  })),
  void: (correction, cashSessionId = null) => rpc("void_sale", commandArgs({
    p_correction_id: uuid(correction.id),
    p_sale_id: correction.originalSaleId,
    p_cash_session_id: cashSessionId || null,
    p_reason: correction.reason || "",
  })),
};
