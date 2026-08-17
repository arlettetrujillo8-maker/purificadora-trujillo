import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260816-sesion-y-inventario-fix";

const expensePaymentMethod = (value) => {
  const normalized = String(value || "otro").trim().toLowerCase();
  if (normalized === "sin_efectivo") return "otro";
  return ["efectivo", "transferencia", "otro"].includes(normalized)
    ? normalized
    : "otro";
};

export const cashRepository = {
  listSessions: () =>
    selectAll("cash_sessions", "*", (query) =>
      query.order("opened_at", { ascending: false }).limit(500),
    ),
  listMovements: () =>
    selectAll("cash_movements", "*", (query) =>
      query.order("created_at", { ascending: true }).limit(2000),
    ),
  listExpenses: () =>
    selectAll("expenses", "*", (query) =>
      query.order("occurred_at", { ascending: false }).limit(1000),
    ),
  open: (session) =>
    rpc(
      "open_cash_session",
      commandArgs({
        p_session_id: /^[0-9a-f-]{36}$/i.test(session.id || "")
          ? session.id
          : entityId(),
        p_opening_cents: Math.round(Number(session.openingAmount) * 100),
      }),
    ),
  close: (session) =>
    rpc(
      "close_cash_session",
      commandArgs({
        p_session_id: session.id,
        p_counted_cents: Math.round(Number(session.countedAmount) * 100),
        p_difference_reason: session.differenceReason || "",
      }),
    ),
  movement: (movement) =>
    rpc(
      "register_cash_movement",
      commandArgs({
        p_movement_id: entityId(),
        p_session_id: movement.cashSessionId,
        p_movement_type: movement.type === "income" ? "deposit" : "withdrawal",
        p_direction: movement.type === "income" ? "in" : "out",
        p_amount_cents: Math.round(Number(movement.amount) * 100),
        p_reason: movement.reason,
      }),
    ),
  transfer: (transfer) =>
    rpc(
      "transfer_cash",
      commandArgs({
        p_transfer_id: entityId(),
        p_from_session_id: transfer.fromCashSessionId,
        p_to_session_id: transfer.toCashSessionId,
        p_amount_cents: Math.round(Number(transfer.amount) * 100),
        p_notes: transfer.notes || "",
      }),
    ),
  createExpense: (expense) =>
    rpc(
      "create_expense",
      commandArgs({
        p_expense_id: entityId(),
        p_payload: {
          concept: expense.concept,
          amount_cents: Math.round(Number(expense.amount) * 100),
          center: expense.center,
          payment_method: expensePaymentMethod(expense.method),
          affects_cash: expense.affectsCash !== false,
          cash_session_id: expense.cashSessionId || null,
          notes: expense.notes || "",
          occurred_at: expense.date,
        },
      }),
    ),
};
