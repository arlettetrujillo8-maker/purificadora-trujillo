import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260816-reporte-y-envases-fix";

export const suppliesRepository = {
  list: () => selectAll("supplies", "*", (query) => query.order("name")),
  listMovements: () =>
    selectAll("supply_movements", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(2000),
    ),
  listMaintenance: () =>
    selectAll("maintenance_events", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(1000),
    ),
  registerMaintenance: (entry) =>
    rpc(
      "register_maintenance_service",
      commandArgs({
        p_reference_id: /^[0-9a-f-]{36}$/i.test(entry.id || "")
          ? entry.id
          : entityId(),
        p_notes: entry.notes || "",
      }),
    ),
  save: (supply) =>
    rpc(
      "upsert_supply",
      commandArgs({
        p_supply_id: /^[0-9a-f-]{36}$/i.test(supply.id || "")
          ? supply.id
          : entityId(),
        p_payload: {
          name: supply.name,
          category: supply.category || "general",
          unit: supply.unit,
          initial_stock: Number(supply.currentStock || 0),
          minimum_stock: Number(supply.minimumStock || 0),
          cost_cents: Math.round(Number(supply.costPerUnit || 0) * 100),
          consumption_per_unit: Number(supply.consumptionPerUnit || 0),
          active: supply.active !== false,
        },
      }),
    ),
  movement: (movement) =>
    rpc(
      "register_supply_movement",
      commandArgs({
        p_reference_id: entityId(),
        p_supply_id: movement.supplyId,
        p_payload: {
          movement_type:
            movement.type === "consume"
              ? "consumption"
              : movement.type === "adjust"
                ? "adjustment"
                : movement.type,
          quantity:
            movement.type === "adjust"
              ? Number(movement.balance)
              : Math.abs(Number(movement.quantity)),
          unit_cost_cents: Math.round(Number(movement.costPerUnit || 0) * 100),
          payment_method: movement.method || "otro",
          affects_cash: Boolean(movement.affectsCash),
          cash_session_id: movement.cashSessionId || null,
          expense_id: entityId(),
          reason: movement.reason || "",
        },
      }),
    ),
};
