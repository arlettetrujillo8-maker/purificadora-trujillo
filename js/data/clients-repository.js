import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260815-cierre-modal-seguro";

function payload(client) {
  return {
    name: client.name,
    phone: client.phone || "",
    address: client.address || "",
    normal_route: client.route || client.normalRoute || "ninguna",
    client_type:
      client.type === "Especial" || client.clientType === "special"
        ? "special"
        : "general",
    special_price_cents:
      client.price == null ? null : Math.round(Number(client.price) * 100),
    notes: client.notes || "",
    active: client.active !== false,
  };
}

export const clientsRepository = {
  list: () => selectAll("clients", "*", (query) => query.order("name")),
  create: (client) => {
    const id = /^[0-9a-f-]{36}$/i.test(client.id || "")
      ? client.id
      : entityId();
    return rpc(
      "create_client",
      commandArgs({ p_client_id: id, p_payload: payload(client) }),
    );
  },
  update: (client) =>
    rpc(
      "update_client",
      commandArgs({
        p_client_id: client.id,
        p_expected_version: Number(client.version || 1),
        p_payload: payload(client),
      }),
    ),
  merge: (primaryClientId, duplicateClientIds) =>
    rpc(
      "merge_clients",
      commandArgs({
        p_primary_client_id: primaryClientId,
        p_duplicate_client_ids: duplicateClientIds,
      }),
    ),
};
