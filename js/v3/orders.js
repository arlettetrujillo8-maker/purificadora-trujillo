(function exposeOrders(globalScope) {
  "use strict";

  const STATUSES = Object.freeze({
    pendiente: { label: "Pendiente", next: "entregado" },
    entregado: { label: "Entregado", next: null },
    cancelado: { label: "Cancelado", next: null },
  });

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const todayKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;

  function normalize(order = {}) {
    return {
      id: order.id || "",
      clientId: order.clientId || "",
      clientName: order.clientName || "",
      route: order.route || "ventanilla",
      date: order.date || todayKey(),
      qty: Math.max(1, Math.round(num(order.qty) || 1)),
      price: num(order.price),
      status: STATUSES[order.status] ? order.status : "pendiente",
      notes: order.notes || "",
      createdAt: order.createdAt || "",
      deliveredAt: order.deliveredAt || "",
      saleId: order.saleId || "",
      source: order.source || "local",
    };
  }

  function isPending(order) {
    return normalize(order).status === "pendiente";
  }

  // Pedidos que deben atenderse en la fecha indicada (por defecto hoy),
  // ordenados por fecha y cliente para trabajar la ruta en orden.
  function dueToday(orders, date = new Date()) {
    const key = todayKey(date);
    return sortForWork(
      (Array.isArray(orders) ? orders : [])
        .map(normalize)
        .filter((order) => order.status === "pendiente" && order.date <= key),
    );
  }

  function byRoute(orders, route) {
    return (Array.isArray(orders) ? orders : [])
      .map(normalize)
      .filter((order) => order.route === route);
  }

  function summary(orders, date = new Date()) {
    const list = (Array.isArray(orders) ? orders : []).map(normalize);
    const due = dueToday(list, date);
    return {
      pending: list.filter((order) => order.status === "pendiente").length,
      dueToday: due.length,
      dueUnits: due.reduce((total, order) => total + order.qty, 0),
      deliveredToday: list.filter(
        (order) =>
          order.status === "entregado" &&
          (order.deliveredAt || "").slice(0, 10) === todayKey(date),
      ).length,
      cancelled: list.filter((order) => order.status === "cancelado").length,
      estimatedTotal: due.reduce(
        (total, order) => total + order.qty * order.price,
        0,
      ),
    };
  }

  // Transiciones permitidas: pendiente -> entregado|cancelado; sin reapertura.
  function canTransition(order, status) {
    const current = normalize(order);
    if (!STATUSES[status]) return false;
    if (current.status !== "pendiente") return false;
    return status === "entregado" || status === "cancelado";
  }

  function sortForWork(orders) {
    return (Array.isArray(orders) ? orders : [])
      .map(normalize)
      .sort((a, b) => {
        const byDate = String(a.date).localeCompare(String(b.date));
        if (byDate !== 0) return byDate;
        return String(a.clientName).localeCompare(String(b.clientName));
      });
  }

  const api = Object.freeze({
    STATUSES,
    todayKey,
    normalize,
    isPending,
    dueToday,
    byRoute,
    summary,
    canTransition,
    sortForWork,
  });
  globalScope.PurificadoraOrders = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
