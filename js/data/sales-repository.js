import { selectAll, rpc, commandArgs, entityId } from "./repository-utils.js?v=20260817-rondas-una-tarjeta";
import { supabase } from "./supabase-client.js?v=20260817-rondas-una-tarjeta";

export const salesRepository = {
  list: () =>
    selectAll("sales", "*", (query) =>
      query.order("occurred_at", { ascending: false }).limit(1000),
    ),
  listCorrections: () =>
    selectAll("sale_corrections", "*", (query) =>
      query.order("created_at", { ascending: false }).limit(1000),
    ),
  create: async (sale) => {
    const channelLocation = {
      ventanilla: "local",
      fuera_ruta: "local",
      fuera_horario: "local",
      ruta1: "route_1",
      ruta2: "route_2",
    }[sale.channel];
    const { data: location, error } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("location_code", channelLocation)
      .eq("container_type", "full")
      .single();
    if (error) throw error;
    return rpc(
      "register_sale_with_containers",
      commandArgs({
        p_sale_id: /^[0-9a-f-]{36}$/i.test(sale.id || "")
          ? sale.id
          : entityId(),
        p_payload: {
          client_id: sale.clientId || null,
          channel: sale.channel,
          route:
            sale.channel === "ruta1" || sale.channel === "ruta2"
              ? sale.channel
              : null,
          round_id: sale.roundId || null,
          cash_session_id: sale.cashSessionId || null,
          inventory_location_id: location.id,
          quantity: Number(sale.qty),
          unit_price_cents: Math.round(
            Number(sale.price ?? sale.unitPrice) * 100,
          ),
          total_cents: Math.round(Number(sale.total) * 100),
          paid_cents: Math.round(Number(sale.paid) * 100),
          credit_cents: Math.round(Number(sale.credit) * 100),
          payment_method: sale.paymentType,
          price_override_reason: sale.priceReason || "",
          notes: sale.notes || "",
          occurred_at: sale.date,
          empty_return_quantity: Number(sale.emptyReturnQty ?? sale.qty),
          damaged_return_quantity: Number(sale.damagedReturnQty || 0),
        },
      }),
    );
  },
};
