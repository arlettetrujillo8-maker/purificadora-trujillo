import { selectAll, rpc, commandArgs } from "./repository-utils.js?v=20260817-caja-automatica";

// Frontera de jornada. Cada renglon es un cierre; la jornada en curso es todo
// lo ocurrido despues del ultimo closed_at. No se guarda work_day_id en las
// ventas: la frontera basta para filtrar y no obliga a tocar el historico.
export const workDaysRepository = {
  list: () =>
    selectAll("work_days", "*", (query) =>
      query.order("closed_at", { ascending: false }).limit(200),
    ),
  close: (notes = "") =>
    rpc("close_work_day", commandArgs({ p_notes: notes })),
};
