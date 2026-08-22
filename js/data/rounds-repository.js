import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260818-ux-movil-v2";

export const roundsRepository = {
  list: () =>
    selectAll("rounds", "*", (query) =>
      query.order("started_at", { ascending: false }).limit(500),
    ),
  start: (round) =>
    rpc(
      "start_round",
      commandArgs(
        {
          p_round_id: /^[0-9a-f-]{36}$/i.test(round.id || "")
            ? round.id
            : entityId(),
          p_route: round.route,
          p_loaded_quantity: Number(round.loadedQty),
          p_notes: round.notes || "",
        },
        round.operationId || null,
      ),
    ),
  reload: (round) =>
    rpc(
      "reload_round",
      commandArgs(
        {
          p_round_id: round.id,
          p_quantity: Number(round.quantity),
          p_notes: round.notes || "",
        },
        round.operationId || null,
      ),
    ),
  registerReturn: (round) =>
    rpc(
      "register_round_return",
      commandArgs(
        {
          p_round_id: round.id,
          p_returned_full: Number(round.returnedFullQty || 0),
          p_returned_empty: Number(round.returnedEmptyQty || 0),
          p_damaged: Number(round.damagedQty || 0),
          p_notes: round.notes || "",
          p_recovery_reason: round.recoveryReason || "",
        },
        round.operationId || null,
      ),
    ),
  finalize: (round) =>
    rpc(
      "finalize_round_close",
      commandArgs(
        {
          p_round_id: round.id,
          p_notes: round.closeNotes || round.notes || "",
        },
        round.operationId || null,
      ),
    ),
};
