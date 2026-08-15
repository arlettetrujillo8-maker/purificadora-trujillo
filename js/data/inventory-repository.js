import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260815-llenos-solo-sin-ronda";

export const inventoryRepository = {
  listLocations: () => selectAll("inventory_locations"),
  listMovements: () =>
    selectAll("inventory_movements", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(2000),
    ),
  transfer: (movement) =>
    rpc(
      "transfer_inventory",
      commandArgs({
        p_reference_id: entityId(),
        p_from_code: movement.from,
        p_to_code: movement.to,
        p_quantity: Number(movement.quantity),
        p_reason: movement.reason || "",
      }),
    ),
  adjust: (movement) =>
    rpc(
      "adjust_inventory",
      commandArgs({
        p_reference_id: entityId(),
        p_location_code: movement.location,
        p_new_quantity: Number(movement.newQuantity),
        p_reason: movement.reason,
      }),
    ),
  fill: (movement) =>
    rpc(
      "fill_containers",
      commandArgs({
        p_reference_id: entityId(),
        p_quantity: Number(movement.quantity),
        p_notes: movement.notes || "",
      }),
    ),
};
