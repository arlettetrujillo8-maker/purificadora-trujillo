(function exposePresentationLabels(globalScope) {
  "use strict";

  const CENTER_LABELS = Object.freeze({
    local: "Local",
    ruta1: "Ruta 1",
    ruta2: "Ruta 2",
  });
  const INVENTORY_LOCATION_LABELS = Object.freeze({
    local: "Local · llenos",
    ruta1: "Ruta 1 · llenos",
    ruta2: "Ruta 2 · llenos",
    empty_local: "Local · vacíos",
    empty_ruta1: "Ruta 1 · vacíos",
    empty_ruta2: "Ruta 2 · vacíos",
    lavado: "Lavado · vacíos",
    danados: "Dañados",
  });
  const STOCK_TYPE_LABELS = Object.freeze({
    full: "Llenos",
    empty: "Vacíos",
    damaged: "Dañados",
  });

  function routeNumber(value) {
    return String(value || "").toLowerCase().match(/^ruta[_-]?(\d+)$/)?.[1];
  }

  function formatRouteLabel(route) {
    const number = routeNumber(route);
    return number ? `Ruta ${number}` : String(route || "");
  }

  function formatCenterLabel(center) {
    if (CENTER_LABELS[center]) return CENTER_LABELS[center];
    const route = formatRouteLabel(center);
    return route || String(center || "");
  }

  function formatInventoryLocationLabel(location) {
    return INVENTORY_LOCATION_LABELS[location] || String(location || "");
  }

  function formatStockTypeLabel(type) {
    return STOCK_TYPE_LABELS[type] || String(type || "");
  }

  const api = Object.freeze({
    CENTER_LABELS,
    INVENTORY_LOCATION_LABELS,
    STOCK_TYPE_LABELS,
    formatCenterLabel,
    formatInventoryLocationLabel,
    formatRouteLabel,
    formatStockTypeLabel,
  });
  globalScope.PurificadoraPresentationLabels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
