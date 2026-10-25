import { selectAll } from "./repository-utils.js?v=20261025-venta-inline";

// Catalogo de rutas de reparto. La tabla `routes` es la fuente de verdad; si la
// migracion aun no esta aplicada, el cliente cae a las rutas por defecto.
export const routesRepository = {
  list: () =>
    selectAll("routes", "code,name,active,sort_order", (query) =>
      query.eq("active", true).order("sort_order", { ascending: true }),
    ),
};
