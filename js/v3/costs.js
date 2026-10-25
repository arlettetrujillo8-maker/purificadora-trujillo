(function exposeCosts(globalScope) {
  "use strict";

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  function activeSupplies(supplies) {
    return (Array.isArray(supplies) ? supplies : []).filter(
      (supply) =>
        supply && supply.active !== false && num(supply.consumptionPerUnit) > 0,
    );
  }

  // Costo de insumos por garrafón producido.
  function costPerContainer(supplies) {
    return activeSupplies(supplies).reduce(
      (total, supply) =>
        total + num(supply.consumptionPerUnit) * num(supply.costPerUnit),
      0,
    );
  }

  function breakdown(supplies) {
    const total = costPerContainer(supplies);
    return activeSupplies(supplies)
      .map((supply) => {
        const perContainer =
          num(supply.consumptionPerUnit) * num(supply.costPerUnit);
        return {
          id: supply.id,
          name: supply.name || "Insumo",
          unit: supply.unit || "",
          consumptionPerUnit: num(supply.consumptionPerUnit),
          costPerUnit: num(supply.costPerUnit),
          costPerContainer: perContainer,
          share: total > 0 ? perContainer / total : 0,
        };
      })
      .sort((a, b) => b.costPerContainer - a.costPerContainer);
  }

  // Precio de venta contra costo: margen absoluto y porcentual.
  function marginPerContainer(price, supplies) {
    const salePrice = num(price);
    const cost = costPerContainer(supplies);
    return {
      price: salePrice,
      cost,
      margin: salePrice - cost,
      marginPercent: salePrice > 0 ? (salePrice - cost) / salePrice : 0,
    };
  }

  function productionMovements(movements, periodStart) {
    const list = Array.isArray(movements) ? movements : [];
    if (!periodStart) return list;
    const start = new Date(periodStart).getTime();
    return list.filter((movement) => {
      const time = new Date(movement.date || 0).getTime();
      return Number.isFinite(time) && time >= start;
    });
  }

  function productionCost(movements, periodStart) {
    return productionMovements(movements, periodStart)
      .filter((movement) => movement && movement.type === "production")
      .reduce(
        (total, movement) =>
          total + Math.abs(num(movement.quantity)) * num(movement.costPerUnit),
        0,
      );
  }

  // Garrafones producidos: usa `containers` si existe y, para datos historicos,
  // el motivo "Llenado de N garrafones". Se agrupa por lote (fillId).
  function producedUnits(movements, periodStart) {
    const fills = new Map();
    for (const movement of productionMovements(movements, periodStart)) {
      if (!movement || movement.type !== "production" || !movement.fillId)
        continue;
      const containers = num(movement.containers);
      if (containers > 0) {
        fills.set(movement.fillId, containers);
        continue;
      }
      const match = /Llenado de (\d+)/.exec(movement.reason || "");
      if (match) fills.set(movement.fillId, num(match[1]));
    }
    return [...fills.values()].reduce((total, qty) => total + qty, 0);
  }

  function report(supplies, movements, periodStart) {
    return {
      costPerContainer: costPerContainer(supplies),
      breakdown: breakdown(supplies),
      productionCost: productionCost(movements, periodStart),
      producedUnits: producedUnits(movements, periodStart),
    };
  }

  const api = Object.freeze({
    costPerContainer,
    breakdown,
    marginPerContainer,
    productionCost,
    producedUnits,
    report,
  });

  globalScope.PurificadoraCosts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
