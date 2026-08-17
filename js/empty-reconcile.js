(function exposeEmptyReconcile(globalScope) {
  // Reconciliacion de vacios al regresar una ronda.
  //
  // Antes la app prellenaba "vacios recolectados" con los garrafones vendidos,
  // dando por hecho un vacio de vuelta por cada lleno vendido. Cuando un
  // cliente devuelve envases que traia debiendo, ese numero es falso: el
  // repartidor trae mas de los que vendio y las cuentas dejan de cuadrar.
  //
  // Aqui no se topa nada. Obligar a teclear un numero falso para poder cerrar
  // es peor que un descuadre visible; lo que se hace es nombrar la diferencia
  // para que sea rastreable.

  function toInt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  }

  // expected: vacios que corresponden a las ventas netas de la ronda.
  // brought: lo que el repartidor dice traer fisicamente.
  // routeDebt: envases que los clientes de esa ruta traen debiendo. Sirve de
  //   cota de cordura: un sobrante mayor que toda la deuda huele a dedazo.
  function emptyReconcileState({ expected, brought, routeDebt = 0 } = {}) {
    if (brought === "" || brought == null)
      return { state: "pending", difference: 0, requiresNote: false, message: "" };

    const expectedQty = toInt(expected);
    const broughtQty = toInt(brought);
    const debtQty = toInt(routeDebt);
    const difference = broughtQty - expectedQty;

    if (difference === 0)
      return {
        state: "even",
        difference: 0,
        requiresNote: false,
        message: "Cuadra con las ventas de esta ronda.",
      };

    if (difference < 0)
      return {
        state: "short",
        difference,
        requiresNote: true,
        message: `${-difference} de menos: se quedaron con clientes y se les suma a su cuenta.`,
      };

    const base = `${difference} de más: envases que clientes te devolvieron de visitas anteriores.`;
    return {
      state: "surplus",
      difference,
      requiresNote: true,
      suspicious: difference > debtQty,
      message:
        difference > debtQty
          ? `${base} Ojo: la ruta solo debe ${debtQty}. Revisa la cuenta.`
          : base,
    };
  }

  // Aviso de envases pendientes dentro de la venta.
  //
  // El intercambio de envases ya existia en el formulario, pero plegado bajo
  // el rotulo "excepcion" y con "Intercambio normal 1:1" ya contestado. Nadie
  // lo abria, asi que los vacios que un cliente devolvia de visitas anteriores
  // no le bajaban SU deuda, y el descuadre aparecia hasta cerrar la ronda,
  // cuando ya nadie recuerda de quien eran.
  //
  // El unico momento en que se sabe de quien son los envases es frente al
  // cliente. Por eso se avisa ahi, y solo si ese cliente debe algo.
  function containerDebtPrompt(client) {
    const debt = toInt(client?.containerDebt);
    if (!client || debt <= 0) return { show: false, debt: 0, message: "" };
    const name = String(client.name || "Este cliente").trim() || "Este cliente";
    return {
      show: true,
      debt,
      message: `${name} tiene ${debt} envase(s) pendiente(s). Si hoy te los devolvió, elige "Recibió más vacíos" para descontárselos.`,
    };
  }

  const api = Object.freeze({ emptyReconcileState, containerDebtPrompt });
  globalScope.PurificadoraEmptyReconcile = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
