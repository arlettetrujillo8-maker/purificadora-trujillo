(function exposeUserDisplay(globalScope) {
  const ROLE_LABELS = Object.freeze({
    administrador: "Administrador",
    repartidor: "Repartidor",
    ventanilla: "Ventanilla",
    inventario: "Inventario",
    caja: "Caja",
  });

  function roleLabel(role) {
    return ROLE_LABELS[role] || role || "";
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function userDisplayLabel(user, centerFormatter = (center) => center) {
    if (!user) return "Sin sesión";
    const name = String(user.name || user.username || "Usuario").trim();
    const role = roleLabel(user.role);
    const center = centerFormatter(user.center);
    const parts = [name];
    if (role && normalize(role) !== normalize(name)) parts.push(role);
    if (center && !parts.some((part) => normalize(part) === normalize(center)))
      parts.push(center);
    return parts.join(" · ");
  }

  const api = Object.freeze({ roleLabel, userDisplayLabel });
  globalScope.PurificadoraUserDisplay = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
