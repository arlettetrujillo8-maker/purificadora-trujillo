import { selectAll, rpc, entityId } from "./repository-utils.js?v=20261025-offline-estable";

// Pedidos programados. Si la migracion 20261025_orders_programados no esta
// aplicada, las llamadas fallan y la app trabaja en modo local (localStorage).
export const ordersRepository = {
  list: () =>
    selectAll("orders", "*", (query) =>
      query.order("scheduled_date", { ascending: true }).limit(500),
    ),

  create: (order) =>
    rpc("create_order", {
      p_order_id: /^[0-9a-f-]{36}$/i.test(order.id || "")
        ? order.id
        : entityId(),
      p_client_id: order.clientId,
      p_route: order.route,
      p_scheduled_date: order.date,
      p_qty: Number(order.qty || 1),
      p_price_cents: Math.round(Number(order.price || 0) * 100),
      p_notes: order.notes || "",
    }),

  setStatus: (orderId, status, saleId = null) =>
    rpc("set_order_status", {
      p_order_id: orderId,
      p_status: status,
      p_sale_id: saleId || null,
    }),
};
