(() => {
  "use strict";

  const APP_SCRIPT_BUILD = "20260817-jornada-cliente";
  window.PurificadoraAppScriptBuild = APP_SCRIPT_BUILD;

  const LEGACY_STORAGE_KEY = "purificadora_trujillo_v1";
  const STORAGE_KEY = "purificadora_state_current";
  const PREVIOUS_STORAGE_KEY = "purificadora_state_previous";
  const CHANNELS = {
    ventanilla: "Ventanilla",
    ruta1: "Ruta 1",
    ruta2: "Ruta 2",
    fuera_ruta: "Fuera de ruta",
    fuera_horario: "Fuera de horario",
  };
  const INVENTORY_LOCATION_LABELS =
    window.PurificadoraPresentationLabels?.INVENTORY_LOCATION_LABELS || {
    local: "Local · llenos",
    ruta1: "Ruta 1 · llenos",
    ruta2: "Ruta 2 · llenos",
    empty_local: "Local · vacíos",
    empty_ruta1: "Ruta 1 · vacíos",
    empty_ruta2: "Ruta 2 · vacíos",
    lavado: "Lavado · vacíos",
    danados: "Dañados",
    };
  const EMPLOYEE_SESSION_KEY = "purificadora_trujillo_employee_session";
  const PENDING_ACCESS_KEY = "purificadora_pending_access_flow";
  const ADMIN_PERMISSIONS = [
    "create_sale",
    "return_sale",
    "correct_sale",
    "void_sale",
    "override_sale_price",
    "create_client",
    "edit_client",
    "view_client_debt",
    "register_payment",
    "create_credit",
    "view_global_debt",
    "view_own_cash",
    "view_all_cash",
    "open_cash",
    "close_cash",
    "close_work_day",
    "cash_adjustments",
    "cash_delivery",
    "create_expense",
    "view_expenses",
    "adjust_inventory",
    "transfer_inventory",
    "view_inventory",
    "rounds",
    "supplies",
    "maintenance",
    "users",
    "reports",
    "settings",
    "backups",
    "reset_data",
  ];
  const ESSENTIAL_ADMIN_PERMISSIONS = [
    "users",
    "settings",
    "backups",
    "reset_data",
  ];
  const ACCESS_POLICY = {
    administrador: {
      views: [
        "dashboard",
        "clientes",
        "ventas",
        "ultimas",
        "fiado",
        "envases",
        "rutas",
        "ventanilla",
        "caja",
        "inventario",
        "insumos",
        "gastos",
        "reportes",
      ],
      permissions: [
        "create_sale",
        "correct_sale",
        "create_client",
        "edit_client",
        "view_client_debt",
        "register_payment",
        "create_credit",
        "view_global_debt",
        "view_own_cash",
        "view_all_cash",
        "open_cash",
        "close_cash",
        "close_work_day",
        "cash_delivery",
        "create_expense",
        "view_expenses",
        "view_inventory",
        "adjust_inventory",
        "transfer_inventory",
        "rounds",
        "supplies",
        ...ESSENTIAL_ADMIN_PERMISSIONS,
      ],
    },
    repartidor: {
      views: [
        "dashboard",
        "clientes",
        "ventas",
        "ultimas",
        "fiado",
        "envases",
        "rutas",
        "caja",
        "inventario",
      ],
      permissions: [
        "create_sale",
        "correct_sale",
        "create_client",
        "edit_client",
        "view_client_debt",
        "register_payment",
        "create_credit",
        "view_own_cash",
        "open_cash",
        "close_cash",
        "cash_delivery",
        "view_inventory",
        "rounds",
      ],
    },
    ventanilla: {
      views: [
        "dashboard",
        "clientes",
        "ventas",
        "ultimas",
        "fiado",
        "envases",
        "ventanilla",
        "caja",
      ],
      permissions: [
        "create_sale",
        "correct_sale",
        "create_client",
        "edit_client",
        "view_client_debt",
        "register_payment",
        "create_credit",
        "view_own_cash",
        "open_cash",
        "close_cash",
      ],
    },
    inventario: {
      views: ["dashboard", "inventario", "insumos", "mantenimiento"],
      permissions: [
        "view_inventory",
        "adjust_inventory",
        "transfer_inventory",
        "supplies",
        "maintenance",
      ],
    },
    caja: {
      views: ["dashboard", "caja", "gastos", "reportes"],
      permissions: [
        "view_own_cash",
        "view_all_cash",
        "open_cash",
        "close_cash",
        "close_work_day",
        "cash_delivery",
        "create_expense",
        "view_expenses",
        "reports",
      ],
    },
  };
  const ADMIN_MODE_VIEWS = [
    "dashboard",
    "clientes",
    "ventas",
    "ultimas",
    "fiado",
    "rutas",
    "ventanilla",
    "caja",
    "inventario",
    "insumos",
    "mantenimiento",
    "gastos",
    "usuarios",
    "reportes",
    "configuracion",
    "auditoria",
    "diagnostico",
  ];
  const ROLE_PERMISSIONS = Object.fromEntries(
    Object.entries(ACCESS_POLICY).map(([role, policy]) => [
      role,
      policy.permissions,
    ]),
  );
  const ROLE_VIEWS = Object.fromEntries(
    Object.entries(ACCESS_POLICY).map(([role, policy]) => [role, policy.views]),
  );
  const NAV_PERMISSIONS = {
    ventas: "create_sale",
    ultimas: "create_sale",
    ventanilla: "create_sale",
    clientes: "view_client_debt",
    fiado: "view_client_debt",
    envases: "view_client_debt",
    rutas: "rounds",
    caja: "view_own_cash",
    gastos: "view_expenses",
    inventario: "view_inventory",
    insumos: "supplies",
    mantenimiento: "maintenance",
    usuarios: "users",
    reportes: "reports",
    configuracion: "settings",
    auditoria: "users",
    diagnostico: "users",
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const uid = (prefix = "id") =>
    `${prefix}_${window.PurificadoraCrypto.safeRandomUUID()}`;
  const nowISO = () => new Date().toISOString();
  const money = (n) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(Number(n || 0));
  const int = (n) => new Intl.NumberFormat("es-MX").format(Number(n || 0));
  const fmtDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat("es-MX", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(iso))
      : "-";
  const fmtDateTime = (iso) =>
    iso
      ? new Intl.DateTimeFormat("es-MX", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : "-";
  const sameDay = (iso, d = new Date()) => {
    const a = new Date(iso);
    return (
      a.getFullYear() === d.getFullYear() &&
      a.getMonth() === d.getMonth() &&
      a.getDate() === d.getDate()
    );
  };
  const relativeDayLabel = (iso) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameDay(iso)) return "HOY";
    if (sameDay(iso, yesterday)) return "AYER";
    return fmtDate(iso);
  };
  const monthKey = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const sameMonth = (iso, ym) => Boolean(iso) && monthKey(iso) === ym;
  const esc = (s = "") =>
    String(s).replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );

  const defaultState = () => ({
    version: 5,
    revision: 0,
    settings: {
      businessName: "Purificadora Trujillo",
      defaultPrice: 14,
      maintenanceThreshold: 375,
      adminTimeoutMinutes: 10,
    },
    users: [
      {
        id: "usr_admin",
        name: "Administrador",
        username: "admin",
        role: "administrador",
        center: "local",
        active: true,
        pin: "1234",
        permissions: ROLE_PERMISSIONS.administrador,
      },
    ],
    activeUserId: "usr_admin",
    clients: [],
    sales: [],
    ledger: [],
    expenses: [],
    returns: [],
    saleCorrections: [],
    cashSessions: [],
    cashAdjustments: [],
    cashTransfers: [],
    cashMovements: [],
    inventory: {
      local: 0,
      ruta1: 0,
      ruta2: 0,
      empty_local: 0,
      empty_ruta1: 0,
      empty_ruta2: 0,
      lavado: 0,
      danados: 0,
    },
    inventoryMovements: [],
    rounds: [],
    supplies: [],
    supplyMovements: [],
    sequences: { sale: 0, correction: 0, payment: 0 },
    maintenance: { count: 0, history: [] },
    activity: [],
    audit: [],
    workDays: [],
  });

  let recoveryRequired = false;
  let recoveryRaw = "";
  let recoverySourceKey = STORAGE_KEY;
  let loadedRevision = 0;
  let externalRevision = 0;
  let stateConflict = false;
  // V3 online never boots from the legacy operational snapshot. The keys are
  // intentionally left untouched as a recoverable pre-migration backup.
  let state = defaultState();
  let selectedClientId = null;
  const saleClientSelection =
    window.PurificadoraSaleClientSelection.createSaleClientSelection();
  let debtFilter = "all";
  let adminMode = false;
  let adminLastActivity = 0;
  let adminTimer = null;
  let adminPinFailures = 0;
  let adminPinLockedUntil = 0;
  let adminLoginPurpose = "entry";
  let centralAccessState = "checking";
  let centralProfileId = null;
  let centralProfileRole = null;
  let pendingAccessFlow = sessionStorage.getItem(PENDING_ACCESS_KEY) || null;
  let adminReauthResolve = null;
  let logoTapTimes = [];
  let employeeSession = loadEmployeeSession();
  let currentView = "dashboard";
  let saleOriginView = "dashboard";
  let saleContext = null;
  let saleInitialSnapshot = null;
  let isSaleSubmitting = false;
  let saleReleaseTimer = null;
  let pendingDialogClose = null;
  let pendingUserDeleteId = null;
  let pendingClientMergeIds = [];
  let quickClientFromSale = false;
  let lastCommitError = null;
  const saleFormOriginalHost = $("saleForm").parentElement;
  const saleFormOriginalNextSibling = $("saleForm").nextElementSibling;

  function hydrateState(source) {
    const base = defaultState(),
      settings = Object.assign(base.settings, source.settings || {});
    if (Number(source.version || 0) < 5 && Number(settings.defaultPrice) === 30)
      settings.defaultPrice = 14;
    const hydrated = Object.assign(base, source, {
      settings,
      inventory: Object.assign(base.inventory, source.inventory || {}),
      maintenance: Object.assign(base.maintenance, source.maintenance || {}),
    });
    [
      "returns",
      "saleCorrections",
      "cashAdjustments",
      "cashTransfers",
      "cashMovements",
      "rounds",
      "supplies",
      "supplyMovements",
      "audit",
      "activity",
      "inventoryMovements",
      "cashSessions",
      "sales",
      "ledger",
      "expenses",
      "clients",
      "users",
      "workDays",
    ].forEach((key) => {
      hydrated[key] = Array.isArray(source[key]) ? source[key] : base[key];
    });
    hydrated.clients = hydrated.clients.map((c) => ({
      ...c,
      active: c.active !== false,
      frequent: c.frequent !== false,
      price: c.price == null ? null : Number(c.price),
    }));
    hydrated.users = hydrated.users.map((u) => ({
      ...u,
      pin: u.pin || (u.id === "usr_admin" ? "1234" : ""),
      permissions: migratePermissions(u.permissions, u.role),
    }));
    hydrated.expenses = hydrated.expenses.map((e) => ({
      ...e,
      affectsCash: e.affectsCash !== false,
    }));
    hydrated.cashSessions = hydrated.cashSessions.map((s) => ({
      ...s,
      status: s.closedAt ? "cerrada" : "abierta",
    }));
    hydrated.sequences = Object.assign(base.sequences, source.sequences || {});
    hydrated.sales = hydrated.sales.map((s, index) => ({
      ...s,
      price: Number(s.price ?? s.unitPrice ?? settings.defaultPrice),
      unitPrice: Number(s.unitPrice ?? s.price ?? settings.defaultPrice),
      status: s.status || "active",
      folio: s.folio || `V-${String(index + 1).padStart(6, "0")}`,
    }));
    hydrated.sequences.sale = Math.max(
      Number(hydrated.sequences.sale || 0),
      hydrated.sales.reduce(
        (max, s) =>
          Math.max(max, Number(String(s.folio || "").replace(/\D/g, "")) || 0),
        0,
      ),
    );
    hydrated.sequences.correction = Math.max(
      Number(hydrated.sequences.correction || 0),
      hydrated.saleCorrections.reduce(
        (max, c) =>
          Math.max(max, Number(String(c.folio || "").replace(/\D/g, "")) || 0),
        0,
      ),
    );
    hydrated.sequences.payment = Math.max(
      Number(hydrated.sequences.payment || 0),
      hydrated.ledger.reduce(
        (max, l) =>
          Math.max(max, Number(String(l.folio || "").replace(/\D/g, "")) || 0),
        0,
      ),
    );
    hydrated.revision = Number.isInteger(source.revision) ? source.revision : 0;
    hydrated.version = 5;
    return hydrated;
  }
  function loadState() {
    const currentRaw = localStorage.getItem(STORAGE_KEY),
      legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY),
      raw = currentRaw ?? legacyRaw;
    if (!raw) {
      loadedRevision = 0;
      return defaultState();
    }
    try {
      const parsed = JSON.parse(raw);
      validateBackup(parsed);
      const hydrated = hydrateState(parsed);
      loadedRevision = hydrated.revision;
      return hydrated;
    } catch (error) {
      console.error(error);
      recoveryRequired = true;
      recoveryRaw = raw;
      recoverySourceKey = currentRaw != null ? STORAGE_KEY : LEGACY_STORAGE_KEY;
      loadedRevision = 0;
      return defaultState();
    }
  }
  function storedRevision() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    try {
      return Number(JSON.parse(raw).revision || 0);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  function showStorageConflict(revision = storedRevision()) {
    stateConflict = true;
    externalRevision = revision;
    if (
      typeof document !== "undefined" &&
      $("storageConflictDialog") &&
      !$("storageConflictDialog").open
    )
      $("storageConflictDialog").showModal();
  }
  function saveState({ skipConflict = false } = {}) {
    if (state.central) return true;
    if (recoveryRequired) return false;
    const originalCurrent = localStorage.getItem(STORAGE_KEY),
      originalRevision = storedRevision();
    if (!skipConflict && (stateConflict || originalRevision > loadedRevision)) {
      showStorageConflict(originalRevision);
      return false;
    }
    const nextRevision = loadedRevision + 1,
      candidate = structuredClone(state);
    candidate.version = 5;
    candidate.revision = nextRevision;
    candidate.updatedAt = nowISO();
    const serialized = JSON.stringify(candidate),
      previousRaw = originalCurrent ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    try {
      if (previousRaw) localStorage.setItem(PREVIOUS_STORAGE_KEY, previousRaw);
      localStorage.setItem(STORAGE_KEY, serialized);
      const verified = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!verified || verified.revision !== nextRevision)
        throw new Error("La revisión guardada no coincide");
      state = candidate;
      loadedRevision = nextRevision;
      stateConflict = false;
      externalRevision = 0;
      return true;
    } catch (error) {
      console.error(error);
      try {
        if (originalCurrent != null)
          localStorage.setItem(STORAGE_KEY, originalCurrent);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return false;
    }
  }
  async function commitState(
    previousState,
    message = "No se pudo guardar la operación. No se realizaron cambios permanentes.",
  ) {
    lastCommitError = null;
    try {
      if (!window.PurificadoraV3?.commitTransition)
        throw new Error(
          "Conecta la cuenta central antes de registrar operaciones.",
        );
      const projection = await window.PurificadoraV3.commitTransition(
        previousState,
        structuredClone(state),
      );
      state = hydrateState(projection);
      state.central = true;
      renderAll();
      return true;
    } catch (error) {
      console.error(error);
      lastCommitError = error;
      state = previousState;
      renderAll();
      try {
        await window.PurificadoraV3?.refresh?.("commit-error");
      } catch (refreshError) {
        console.warn("No se pudo refrescar la central después del error", refreshError);
      }
      toast(error?.userMessage || error?.message || message, "error");
      return false;
    }
  }
  function toast(msg, type = "ok") {
    const t = $("toast");
    toast._home ??= t.parentElement;
    const supportsPopover = typeof t.showPopover === "function",
      dialogs = [...document.querySelectorAll("dialog[open]")],
      dialog =
        document.activeElement?.closest?.("dialog[open]") || dialogs.at(-1);
    if (!supportsPopover) t.removeAttribute("popover");
    t.textContent = msg;
    t.className = `toast show ${type === "error" ? "error" : ""}`;
    if (supportsPopover) {
      if (!t.matches(":popover-open")) t.showPopover();
    } else if (dialog) {
      const host = dialog.querySelector(".dialog-form") || dialog,
        head = host.querySelector(".dialog-head");
      head ? head.insertAdjacentElement("afterend", t) : host.prepend(t);
      t.classList.add("in-dialog");
    } else if (t.parentElement !== toast._home) toast._home.appendChild(t);
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      t.className = "toast";
      if (supportsPopover && t.matches(":popover-open")) t.hidePopover();
      if (!supportsPopover && t.parentElement !== toast._home)
        toast._home.appendChild(t);
    }, 3800);
  }
  function migratePermissions(perms, role) {
    let provided = [];
    if (Array.isArray(perms) && perms.length) {
      if (perms.some((p) => ADMIN_PERMISSIONS.includes(p)))
        provided = perms.filter((p) => ADMIN_PERMISSIONS.includes(p));
      else {
        const groups = {
          ventas: ["create_sale", "create_credit"],
          clientes: [
            "create_client",
            "edit_client",
            "view_client_debt",
            "register_payment",
          ],
          rutas: ["create_sale", "view_inventory", "rounds"],
          caja: [
            "view_own_cash",
            "open_cash",
            "close_cash",
            "create_expense",
            "view_expenses",
          ],
          inventario: [
            "view_inventory",
            "adjust_inventory",
            "transfer_inventory",
            "supplies",
            "maintenance",
          ],
          reportes: ["reports"],
        };
        provided = perms.flatMap((p) => groups[p] || []);
      }
    }
    let result = [...new Set([...(ROLE_PERMISSIONS[role] || []), ...provided])];
    if (role === "administrador")
      result = [
        ...new Set([
          ...result,
          "view_global_debt",
          ...ESSENTIAL_ADMIN_PERMISSIONS,
        ]),
      ];
    return result;
  }
  function loadEmployeeSession() {
    try {
      const id = sessionStorage.getItem(EMPLOYEE_SESSION_KEY);
      return id ? { userId: id, startedAt: nowISO() } : null;
    } catch {
      return null;
    }
  }
  function activeUser() {
    if (!employeeSession) return null;
    return (
      state.users.find((u) => u.id === employeeSession.userId && u.active) ||
      null
    );
  }
  function nextFolio(type, prefix) {
    state.sequences[type] = Number(state.sequences[type] || 0) + 1;
    return `${prefix}-${String(state.sequences[type]).padStart(6, "0")}`;
  }
  function expectedSalePrice(client = null) {
    return Number(client?.price ?? state.settings.defaultPrice ?? 14);
  }
  async function fillContainersV22(e) {
    e.preventDefault();
    if (!requirePermission("rounds")) return;
    const qty = Number($("fillContainersQty").value),
      notes = $("fillContainersNotes").value.trim(),
      available = Math.max(0, Number(state.inventory.empty_local || 0));
    if (!Number.isInteger(qty) || qty <= 0)
      return toast("Captura una cantidad válida.", "error");
    if (qty > available)
      return toast(
        `Solo hay ${int(available)} vacíos disponibles en Local.`,
        "error",
      );
    const configured = state.supplies.filter(
      (s) => s.active !== false && Number(s.consumptionPerUnit) > 0,
    );
    for (const supply of configured) {
      const needed = Number(supply.consumptionPerUnit) * qty;
      if (Number(supply.currentStock) < needed)
        return toast(`Insumo insuficiente: ${supply.name}.`, "error");
    }
    const previousState = structuredClone(state),
      fillId = uid("fill");
    recordInventoryMovement(
      "empty_local",
      -qty,
      "containers_filled",
      "Vacíos preparados",
      null,
      { fillId },
    );
    recordInventoryMovement(
      "local",
      qty,
      "containers_filled",
      "Llenos disponibles",
      "empty_local",
      { fillId },
    );
    configured.forEach((s) => {
      const amount = Number(s.consumptionPerUnit) * qty;
      s.currentStock -= amount;
      state.supplyMovements.unshift({
        id: uid("supmov"),
        date: nowISO(),
        supplyId: s.id,
        type: "production",
        quantity: -amount,
        balance: s.currentStock,
        costPerUnit: s.costPerUnit,
        userId: activeUser().id,
        reason: `Llenado de ${qty} garrafones`,
        fillId,
      });
    });
    state.maintenance.count += qty;
    audit(
      "containers_filled",
      "inventory",
      fillId,
      `Llenado de ${qty} garrafones`,
      {
        emptyLocal: Number(previousState.inventory.empty_local),
        local: Number(previousState.inventory.local),
      },
      { emptyLocal: state.inventory.empty_local, local: state.inventory.local, notes },
    );
    if (!(await commitState(previousState))) return;
    $("fillContainersDialog").close();
    renderAll();
    toast(`${qty} garrafones preparados`);
  }
  async function saveSaleCorrectionV2(e) {
    e.preventDefault();
    const original = state.sales.find(
      (s) => s.id === $("correctionSaleId").value,
    );
    if (!canCorrectSale(original))
      return toast("Ya no tienes permiso para corregir esta venta.", "error");
    const reason = $("correctionReason").value.trim(),
      qty = Number($("correctionQty").value),
      price = Number($("correctionPrice").value),
      type = $("correctionPaymentType").value,
      client = clientById($("correctionClient").value),
      channel = $("correctionChannel").value,
      total = qty * price,
      paid =
        type === "fiado"
          ? 0
          : type === "mixto"
            ? Number($("correctionPaid").value)
            : total,
      credit = total - paid,
      expectedPrice = expectedSalePrice(client);
    if (!reason)
      return toast("El motivo de corrección es obligatorio.", "error");
    if (
      !Number.isInteger(qty) ||
      qty <= 0 ||
      price < 0 ||
      !Number.isFinite(paid) ||
      paid < 0 ||
      paid > total
    )
      return toast("Revisa cantidad, precio y pago.", "error");
    if (Math.abs(price - expectedPrice) > 0.009 && !can("override_sale_price"))
      return toast(`El precio autorizado es ${money(expectedPrice)}.`, "error");
    if (credit > 0 && !client)
      return toast("El fiado requiere un cliente registrado.", "error");
    const newCenter = centerForChannel(channel),
      available =
        Number(state.inventory[newCenter] || 0) +
        (newCenter === original.center ? Number(original.qty) : 0);
    if (available < qty)
      return toast(
        `Inventario insuficiente en ${inventoryLocationLabel(newCenter)}.`,
        "error",
      );
    const newCash = type === "efectivo" ? total : type === "mixto" ? paid : 0,
      cashPlan = correctionCashPlan(original, newCash, reason);
    if (!cashPlan) return;
    const previousState = structuredClone(state),
      date = nowISO(),
      correction = {
        id: uid("corr"),
        folio: nextFolio("correction", "C"),
        date,
        originalSaleId: original.id,
        newSaleId: null,
        reason,
        userId: activeUser().id,
        before: structuredClone(original),
      },
      beforeOriginal = structuredClone(original);
    original.status = "superseded";
    original.correctedAt = date;
    original.correctionId = correction.id;
    recordInventoryMovement(
      original.center,
      original.qty,
      "corrección_reversa",
      `Reversa ${original.folio}`,
      null,
      { saleId: original.id, correctionId: correction.id },
    );
    recordInventoryMovement(
      newCenter,
      -qty,
      "venta_corregida",
      `Corrección ${correction.folio}`,
      null,
      { correctionId: correction.id },
    );
    state.maintenance.count = Math.max(
      0,
      Number(state.maintenance.count || 0) - Number(original.qty) + qty,
    );
    reverseSaleDebt(original, date, reason, correction.id);
    const newSale = {
      id: uid("sale"),
      folio: nextFolio("sale", "V"),
      date,
      clientId: client?.id || null,
      clientName: client?.name || "Público general",
      channel,
      qty,
      price,
      unitPrice: price,
      total,
      paid,
      credit,
      paymentType: type,
      notes: $("correctionNotes").value.trim(),
      userId: activeUser().id,
      center: newCenter,
      status: "active",
      cashSessionId: cashPlan.cashSessionId,
      cashAccounting: cashPlan.cashAccounting,
      roundId:
        channel === original.channel
          ? original.roundId
          : activeRound(channel)?.id || null,
      originalSaleId: original.id,
      correctionId: correction.id,
      containerMode: "normal",
      emptyReturnQty: qty,
      damagedReturnQty: 0,
    };
    const originalEmptyCenter =
        original.channel === "ruta1" || original.channel === "ruta2"
          ? `empty_${original.channel}`
          : "empty_local",
      newEmptyCenter =
        channel === "ruta1" || channel === "ruta2"
          ? `empty_${channel}`
          : "empty_local";
    if (Number(original.emptyReturnQty || 0))
      recordInventoryMovement(originalEmptyCenter, -Number(original.emptyReturnQty), "sale_empty_reversal", `Corrección ${correction.folio}`, null, { correctionId: correction.id });
    if (Number(original.damagedReturnQty || 0))
      recordInventoryMovement("danados", -Number(original.damagedReturnQty), "sale_damaged_reversal", `Corrección ${correction.folio}`, null, { correctionId: correction.id });
    recordInventoryMovement(newEmptyCenter, qty, "sale_empty_received", `Venta corregida ${correction.folio}`, null, { correctionId: correction.id });
    state.sales.push(newSale);
    const ledger = saleLedgerFor(newSale);
    if (ledger) state.ledger.push(ledger);
    correction.newSaleId = newSale.id;
    correction.after = structuredClone(newSale);
    state.saleCorrections.push(correction);
    if (cashPlan.adjustment)
      state.cashAdjustments.push({
        ...cashPlan.adjustment,
        correctionId: correction.id,
      });
    addActivity(`Venta corregida: ${original.folio} → ${newSale.folio}`);
    audit("sale_corrected", "sale", original.id, reason, beforeOriginal, {
      original,
      newSale,
      correction,
    });
    if (!(await commitState(previousState))) return;
    $("saleCorrectionDialog").close();
    renderAll();
    toast(`Venta corregida: ${newSale.folio}`);
  }
  function centerLabel(center) {
    return (
      window.PurificadoraPresentationLabels?.formatCenterLabel(center) ||
      center ||
      ""
    );
  }
  function inventoryLocationLabel(location) {
    return (
      window.PurificadoraPresentationLabels?.formatInventoryLocationLabel(
        location,
      ) ||
      INVENTORY_LOCATION_LABELS[location] ||
      location ||
      ""
    );
  }
  function routeLabel(route) {
    return (
      window.PurificadoraPresentationLabels?.formatRouteLabel(route) ||
      CHANNELS[route] ||
      route ||
      ""
    );
  }
  function roleLabel(role) {
    return window.PurificadoraUserDisplay?.roleLabel(role) || role || "";
  }
  function userDisplayLabel(user) {
    return (
      window.PurificadoraUserDisplay?.userDisplayLabel(user, centerLabel) ||
      [user?.name || user?.username || "Usuario", centerLabel(user?.center)]
        .filter(Boolean)
        .join(" · ")
    );
  }
  function isEffectiveSale(s) {
    return s?.status === "active";
  }
  function saleCashAmount(s) {
    return s?.paymentType === "efectivo"
      ? Number(s.total || 0)
      : s?.paymentType === "mixto"
        ? Number(s.paid || 0)
        : 0;
  }
  function activeRound(route) {
    return state.rounds.find(
      (r) => r.route === route && !["cerrada"].includes(r.status),
    );
  }
  function salesForRound(roundId) {
    return state.sales.filter(
      (s) => s.roundId === roundId && isEffectiveSale(s),
    ).map(netSale);
  }
  function roundMetrics(round) {
    const initialLoad = Number(round?.loadedQty || 0),
      reloads = Number(round?.reloadQty || 0),
      totalLoaded = initialLoad + reloads,
      netSold = round
        ? round.status === "cerrada" && Number.isFinite(Number(round.soldQty))
          ? Number(round.soldQty)
          : salesForRound(round.id).reduce((sum, sale) => sum + sale.qty, 0)
        : 0,
      availableFull = totalLoaded - netSold;
    return {
      initialLoad,
      reloads,
      totalLoaded,
      netSold,
      availableFull,
      inconsistencyQty: availableFull < 0 ? -availableFull : 0,
    };
  }
  function netSale(sale) {
    return {
      ...sale,
      qty: Math.max(0, Number(sale.qty || 0) - Number(sale.returnedQty || 0)),
      total: Math.max(0, Number(sale.total || 0) - Number(sale.returnedTotal || 0)),
      paid: Math.max(0, Number(sale.paid || 0) - Number(sale.returnedPaid || 0)),
      credit: Math.max(0, Number(sale.credit || 0) - Number(sale.returnedCredit || 0)),
    };
  }
  function canCorrectSale(sale) {
    if (!sale || !isEffectiveSale(sale) || Number(sale.returnedQty || 0) > 0) return false;
    const u = activeUser();
    if (adminMode && u?.role === "administrador") return true;
    if (!can("correct_sale") || sale.userId !== u?.id) return false;
    const correctionDialog = $("saleCorrectionDialog");
    if (correctionDialog?.open) {
      const client = clientById($("correctionClient").value),
        price = Number($("correctionPrice").value);
      if (price !== expectedSalePrice(client) && !can("override_sale_price"))
        return false;
    }
    const ageMinutes = (Date.now() - new Date(sale.date).getTime()) / 60000,
      session = sale.cashSessionId
        ? state.cashSessions.find((s) => s.id === sale.cashSessionId)
        : null;
    return ageMinutes <= 30 || Boolean(session && !session.closedAt);
  }
  function permissionsFor(user = activeUser()) {
    return user?.permissions?.length
      ? user.permissions
      : ROLE_PERMISSIONS[user?.role] || [];
  }
  function can(permission) {
    const user = activeUser();
    if (recoveryRequired || stateConflict || !employeeSession || !user)
      return false;
    if (permission === "open_cash" && user.role === "repartidor")
      return true;
    if (adminMode && user.role === "administrador")
      return ADMIN_PERMISSIONS.includes(permission);
    return permissionsFor(user).includes(permission);
  }
  function canAccess(view) {
    const user = activeUser();
    if (recoveryRequired || stateConflict || !employeeSession || !user)
      return false;
    const views =
      adminMode && user.role === "administrador"
        ? ADMIN_MODE_VIEWS
        : ROLE_VIEWS[user.role] || ["dashboard"];
    const explicitlyGrantedExpenseView =
      view === "gastos" && permissionsFor(user).includes("view_expenses");
    if (!views.includes(view) && !explicitlyGrantedExpenseView) return false;
    const permission = NAV_PERMISSIONS[view];
    return !permission || can(permission);
  }
  function requirePermission(
    permission,
    message = "No tienes permiso para realizar esta acción.",
  ) {
    if (can(permission)) return true;
    toast(message, "error");
    audit("unauthorized", "permission", permission, message);
    saveState();
    return false;
  }
  async function validateEmployeePin(user, pin) {
    if (!user?.active || !/^\d{4,8}$/.test(String(pin || ""))) return false;
    if (state.central && window.PurificadoraV3?.validateOperatorPin) {
      try {
        return Boolean(
          await window.PurificadoraV3.validateOperatorPin(user.id, pin),
        );
      } catch (error) {
        const commandPending =
          error?.code === "PGRST202" ||
          error?.userMessage?.includes("todavía no está desplegado");
        if (!commandPending) throw error;
      }
    }
    return Boolean(user.pin && pin === String(user.pin));
  }
  async function requireAdminPin(pin, user = activeUser()) {
    return (
      user?.role === "administrador" &&
      (await validateEmployeePin(user, pin))
    );
  }
  async function validateAdminPin(pin) {
    return requireAdminPin(pin);
  }
  function requestAdminReauth(actionLabel) {
    if (!(adminMode && activeUser()?.role === "administrador")) {
      toast("Activa el modo administrador para realizar esta acción.", "error");
      return Promise.resolve(false);
    }
    if (adminReauthResolve) return Promise.resolve(false);
    $("adminReauthForm").reset();
    $("adminReauthError").textContent = "";
    $("adminReauthMessage").textContent = `Escribe tu PIN para ${actionLabel}.`;
    $("adminReauthDialog").showModal();
    $("adminReauthPin").focus();
    return new Promise((resolve) => {
      adminReauthResolve = resolve;
    });
  }
  function finishAdminReauth(authorized) {
    if ($("adminReauthDialog").open) $("adminReauthDialog").close();
    const resolve = adminReauthResolve;
    adminReauthResolve = null;
    resolve?.(Boolean(authorized));
  }
  async function submitAdminReauth(event) {
    event.preventDefault();
    const remainingLock = adminPinLockedUntil - Date.now();
    if (remainingLock > 0) {
      $("adminReauthError").textContent =
        `Espera ${Math.ceil(remainingLock / 1000)} segundos antes de intentar de nuevo.`;
      return;
    }
    try {
      if (await requireAdminPin($("adminReauthPin").value.trim())) {
        adminPinFailures = 0;
        adminPinLockedUntil = 0;
        finishAdminReauth(true);
        return;
      }
    } catch (error) {
      $("adminReauthError").textContent =
        error?.userMessage || error?.message || "No se pudo validar el PIN.";
      return;
    }
    {
      adminPinFailures += 1;
      if (adminPinFailures >= 5) {
        adminPinFailures = 0;
        adminPinLockedUntil = Date.now() + 30000;
      }
      $("adminReauthError").textContent = "PIN incorrecto.";
      return;
    }
  }
  function audit(
    action,
    entity = "system",
    entityId = "",
    description = "",
    before = null,
    after = null,
  ) {
    const u = activeUser();
    state.audit.unshift({
      id: uid("audit"),
      timestamp: nowISO(),
      userId: u?.id || null,
      userName: u?.name || "Sin sesión",
      action,
      entity,
      entityId: entityId || "",
      description,
      before: before == null ? null : structuredClone(before),
      after: after == null ? null : structuredClone(after),
    });
    state.audit = state.audit.slice(0, 1500);
  }
  function addActivity(text, type = "info") {
    state.activity.unshift({
      id: uid("act"),
      date: nowISO(),
      text,
      type,
      userId: activeUser()?.id,
    });
    state.activity = state.activity.slice(0, 100);
  }
  function centerForChannel(channel) {
    return channel === "ruta1"
      ? "ruta1"
      : channel === "ruta2"
        ? "ruta2"
        : "local";
  }
  function clientById(id) {
    return state.clients.find((c) => c.id === id);
  }
  function normalizeClientText(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }
  function clientNameDistance(a, b) {
    a = normalizeClientText(a);
    b = normalizeClientText(b);
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const saved = row[j];
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          previous + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        previous = saved;
      }
    }
    return row[b.length];
  }
  function possibleClientDuplicates({
    id = "",
    name = "",
    phone = "",
    address = "",
  }) {
    const normalizedName = normalizeClientText(name),
      normalizedAddress = normalizeClientText(address),
      digits = String(phone).replace(/\D/g, "");
    return state.clients
      .filter((c) => c.id !== id && c.active !== false)
      .map((c) => {
        const reasons = [],
          otherName = normalizeClientText(c.name),
          otherAddress = normalizeClientText(c.address),
          otherDigits = String(c.phone || "").replace(/\D/g, "");
        if (digits.length >= 7 && digits === otherDigits)
          reasons.push("mismo teléfono");
        if (
          normalizedName &&
          normalizedAddress &&
          normalizedName === otherName &&
          normalizedAddress === otherAddress
        )
          reasons.push("mismo nombre y dirección");
        else if (
          normalizedName.length >= 4 &&
          otherName.length >= 4 &&
          clientNameDistance(normalizedName, otherName) <=
            Math.max(
              1,
              Math.floor(
                Math.max(normalizedName.length, otherName.length) * 0.2,
              ),
            )
        )
          reasons.push("nombre muy similar");
        return reasons.length ? { client: c, reasons } : null;
      })
      .filter(Boolean)
      .slice(0, 4);
  }
  function blockingClientDuplicate({ id = "", name = "", phone = "" }) {
    const normalizedName = normalizeClientText(name),
      digits = String(phone).replace(/\D/g, "");
    return state.clients.find((client) => {
      if (client.id === id || client.active === false) return false;
      const sameName =
          normalizedName && normalizeClientText(client.name) === normalizedName,
        samePhone =
          digits.length >= 7 &&
          String(client.phone || "").replace(/\D/g, "") === digits;
      return sameName || samePhone;
    });
  }
  function duplicateClientGroup(client) {
    const normalizedName = normalizeClientText(client?.name);
    if (!normalizedName) return [];
    return state.clients.filter(
      (candidate) =>
        candidate.active !== false &&
        normalizeClientText(candidate.name) === normalizedName,
    );
  }
  function updateClientDuplicateWarning(kind = "full") {
    const quick = kind === "quick",
      warning = $(
        quick ? "quickClientDuplicateWarning" : "clientDuplicateWarning",
      ),
      data = {
        id: quick ? "" : $("clientId").value,
        name: $(quick ? "quickClientName" : "clientName").value,
        phone: $(quick ? "quickClientPhone" : "clientPhone").value,
        address: $(quick ? "quickClientAddress" : "clientAddress").value,
      },
      matches = possibleClientDuplicates(data),
      blocking = blockingClientDuplicate(data);
    warning.classList.toggle("hidden", !matches.length);
    warning.innerHTML = matches.length
      ? `<strong>${blocking ? "Cliente duplicado" : "Posible cliente duplicado"}</strong>${matches.map((m) => `${esc(m.client.name)} · ${esc(m.reasons.join(", "))}`).join("<br>")}<br><small>${blocking ? "No se puede guardar otra ficha con el mismo nombre o teléfono." : "Verifica que realmente sea otra persona antes de continuar."}</small>`
      : "";
  }
  function clientInDebtScope(client, user = activeUser()) {
    if (adminMode || can("view_global_debt")) return true;
    if (user?.role === "repartidor") return client.route === user.center;
    if (user?.role === "ventanilla")
      return client.route === "ventanilla" || client.route === "ninguna";
    return false;
  }
  function clientBalance(id) {
    return state.ledger
      .filter((x) => x.clientId === id)
      .reduce((s, x) => s + Number(x.charge || 0) - Number(x.payment || 0), 0);
  }
  function clientBalanceAt(id, end) {
    return state.ledger
      .filter((x) => x.clientId === id && new Date(x.date).getTime() <= end)
      .reduce((s, x) => s + Number(x.charge || 0) - Number(x.payment || 0), 0);
  }
  function lastClientMovement(id) {
    return state.ledger
      .filter((x) => x.clientId === id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  }
  function lastClientSale(id) {
    return state.sales
      .filter((x) => x.clientId === id && isEffectiveSale(x))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  }
  // Inicio de la jornada en curso: el ultimo cierre registrado en el servidor.
  // Antes de que exista el primer cierre no hay frontera, y se cae al dia
  // natural para no vaciar las pantallas de golpe.
  function currentWorkDayStart() {
    const closes = state.workDays || [];
    if (!closes.length) return null;
    return closes.reduce(
      (latest, item) =>
        !latest || String(item.closedAt) > latest ? String(item.closedAt) : latest,
      null,
    );
  }
  // La jornada, no el dia natural: si se cierra a las 8pm y se sigue vendiendo,
  // o si la jornada cruza la medianoche, sameDay() da el corte equivocado.
  function inCurrentWorkDay(date) {
    const start = currentWorkDayStart();
    return start ? String(date) > start : sameDay(date);
  }
  function todaySales() {
    return state.sales
      .filter((s) => inCurrentWorkDay(s.date) && isEffectiveSale(s))
      .map(netSale);
  }
  function todayExpenses() {
    return state.expenses.filter((e) => inCurrentWorkDay(e.date));
  }
  function getOpenCashSession(userId = activeUser()?.id) {
    if (!userId) return null;
    return state.cashSessions.find((s) => s.userId === userId && !s.closedAt);
  }
  function requireOpenCashSession({ method = "efectivo", amount = 0 } = {}) {
    const required =
      String(method).toLowerCase() === "efectivo" && Number(amount) > 0;
    if (!required) return { required: false, session: null };
    const session = getOpenCashSession(activeUser()?.id);
    if (!session && $("cashRequiredDialog") && !$("cashRequiredDialog").open)
      $("cashRequiredDialog").showModal();
    return { required: true, session: session || null };
  }
  function occursWithinCashSession(movement, start, end) {
    const time = new Date(movement.date).getTime();
    return Number.isFinite(time) && time >= start && time <= end;
  }
  function belongsToCashSession(movement, session, start, end) {
    if (!occursWithinCashSession(movement, start, end)) return false;
    if (movement.cashSessionId) return movement.cashSessionId === session.id;
    return movement.userId === session.userId;
  }
  function cashMovementsForSession(session) {
    const start = new Date(session.openedAt).getTime(),
      end = session.closedAt ? new Date(session.closedAt).getTime() : Infinity;
    const sales = state.sales.filter((s) => {
      if (
        !belongsToCashSession(s, session, start, end) ||
        s.cashAccounting === "adjustment_only"
      )
        return false;
      if (isEffectiveSale(s)) return true;
      const changedAt = s.correctedAt || s.voidedAt || s.returnedAt;
      return Boolean(
        session.closedAt &&
          changedAt &&
          new Date(changedAt) > new Date(session.closedAt),
      );
    });
    const payments = state.ledger.filter(
      (l) =>
        l.type === "payment" && belongsToCashSession(l, session, start, end),
    );
    const expenses = state.expenses.filter((e) =>
      belongsToCashSession(e, session, start, end),
    );
    const returns = (state.returns || []).filter((r) =>
      belongsToCashSession(r, session, start, end),
    );
    const adjustments = state.cashAdjustments.filter(
        (a) => a.appliedCashSessionId === session.id,
      ),
      authorized = state.cashMovements.filter((m) =>
        belongsToCashSession(m, session, start, end),
      ),
      incoming = state.cashTransfers.filter(
        (t) =>
          t.toCashSessionId === session.id &&
          occursWithinCashSession(t, start, end),
      ),
      outgoing = state.cashTransfers.filter(
        (t) =>
          t.fromCashSessionId === session.id &&
          occursWithinCashSession(t, start, end),
      );
    const cashSales = sales.reduce((a, s) => a + saleCashAmount(s), 0);
    const cashDebtPayments = payments.reduce(
      (a, p) => a + (p.method === "efectivo" ? p.payment : 0),
      0,
    );
    const debtPaymentsTotal = payments.reduce(
      (a, p) => a + Number(p.payment || 0),
      0,
    );
    const cashExpenses = expenses.reduce(
      (a, e) =>
        a +
        (e.affectsCash !== false &&
        String(e.method).toLowerCase() === "efectivo"
          ? e.amount
          : 0),
      0,
    );
    const cashReturns = returns.reduce(
      (a, r) => a + Number(r.cashRefund || 0),
      0,
    );
    const otherIncome = authorized
        .filter((m) => m.type === "income")
        .reduce((a, m) => a + Number(m.amount || 0), 0),
      withdrawals = authorized
        .filter((m) => m.type === "withdrawal")
        .reduce((a, m) => a + Number(m.amount || 0), 0),
      cashAdjustments = adjustments.reduce(
        (a, m) => a + Number(m.amount || 0),
        0,
      ),
      cashIncoming = incoming.reduce((a, m) => a + Number(m.amount || 0), 0),
      cashOutgoing = outgoing.reduce((a, m) => a + Number(m.amount || 0), 0);
    const nonCashTransfers =
        sales.reduce(
          (a, s) =>
            a + (s.paymentType === "transferencia" ? Number(s.total) : 0),
          0,
        ) +
        payments
          .filter((p) => p.method === "transferencia")
          .reduce((a, p) => a + Number(p.payment || 0), 0),
      creditGenerated = sales.reduce((a, s) => a + Number(s.credit || 0), 0);
    return {
      cashSales,
      cashDebtPayments,
      debtPaymentsTotal,
      cashExpenses,
      cashReturns,
      otherIncome,
      withdrawals,
      cashAdjustments,
      cashIncoming,
      cashOutgoing,
      nonCashTransfers,
      creditGenerated,
      expected:
        Number(session.openingAmount || 0) +
        cashSales +
        cashDebtPayments +
        otherIncome +
        cashIncoming +
        cashAdjustments -
        cashExpenses -
        cashReturns -
        withdrawals -
        cashOutgoing,
    };
  }
  function debtAgeDays(clientId) {
    let running = 0,
      oldest = null;
    [
      ...state.ledger
        .filter((x) => x.clientId === clientId)
        .sort((a, b) => a.date.localeCompare(b.date)),
    ].forEach((x) => {
      if (x.charge > 0 && running <= 0) oldest = x.date;
      running += Number(x.charge || 0) - Number(x.payment || 0);
      if (running <= 0) oldest = null;
    });
    return oldest
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000),
        )
      : 0;
  }
  function ageLabel(days) {
    if (days > 30) return "Rojo · +30 días";
    if (days > 15) return "Naranja · 16-30 días";
    if (days > 7) return "Amarillo · 8-15 días";
    return "Verde · 0-7 días";
  }
  function validateInventoryMovement(location, delta) {
    const current = Number(state.inventory[location] || 0),
      next = current + Number(delta);
    return { valid: Number.isFinite(next) && next >= 0, current, next };
  }
  function recordInventoryMovement(
    location,
    delta,
    type,
    notes = "",
    otherLocation = null,
    meta = {},
  ) {
    const check = validateInventoryMovement(location, delta);
    if (!check.valid) return null;
    state.inventory[location] = check.next;
    const movement = {
      id: uid("inv"),
      date: nowISO(),
      location,
      delta: Number(delta),
      type,
      notes,
      otherLocation,
      userId: activeUser()?.id,
      balance: check.next,
      before: check.current,
      after: check.next,
      ...meta,
    };
    state.inventoryMovements.unshift(movement);
    return movement;
  }
  function resetAdminActivity() {
    if (!adminMode) return;
    adminLastActivity = Date.now();
    clearTimeout(adminTimer);
    adminTimer = setTimeout(
      () => lockAdmin("Administración bloqueada por inactividad."),
      Number(state.settings.adminTimeoutMinutes || 10) * 60000,
    );
  }
  function unlockAdmin() {
    adminMode = true;
    adminLastActivity = Date.now();
    document.body.classList.add("admin-mode");
    audit("admin_access", "session", "admin", "Acceso administrador", null, {
      device: navigator.userAgent,
    });
    saveState();
    resetAdminActivity();
    renderAll();
    showView("dashboard");
    toast("Acceso de administrador autorizado");
  }
  function lockAdmin(message = "Modo administrador cerrado.") {
    if (!adminMode) return;
    adminMode = false;
    clearTimeout(adminTimer);
    document.body.classList.remove("admin-mode");
    audit("admin_logout", "session", "admin", message);
    saveState();
    renderAll();
    showView("dashboard");
    toast(message);
  }

  function setPendingAccessFlow(flow) {
    pendingAccessFlow = ["admin", "user"].includes(flow) ? flow : null;
    if (pendingAccessFlow)
      sessionStorage.setItem(PENDING_ACCESS_KEY, pendingAccessFlow);
    else sessionStorage.removeItem(PENDING_ACCESS_KEY);
  }

  function updateAccessChoiceStatus() {
    const status = $("centralSessionNotice");
    const button = $("v3OpenAuthBtn");
    if (!status || !button) return;
    const ready = centralAccessState === "ready";
    const checking = centralAccessState === "checking";
    status.hidden = ready || checking;
    status.textContent =
      ready || checking ? "" : "Reconecta la cuenta central para continuar.";
    status.classList.toggle("is-connected", ready);
    button.textContent = ready ? "En línea" : checking ? "Verificando…" : "Reconectar";
    button.disabled = ready || checking;
    button.classList.toggle("is-connected", ready);
  }

  function openAccessChoice({ clearPending = false } = {}) {
    employeeSession = null;
    adminMode = false;
    state.activeUserId = null;
    document.body.classList.remove("admin-mode");
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    if (clearPending) setPendingAccessFlow(null);
    ["employeeLoginDialog", "adminLoginDialog"].forEach((id) => {
      if ($(id)?.open) $(id).close();
    });
    updateAccessChoiceStatus();
    if (!$("accessChoiceDialog").open) $("accessChoiceDialog").showModal();
  }

  function requestCentralReconnect() {
    const trigger = $("v3OpenAuthBtn");
    if (!window.PurificadoraCentralAuthUi?.openCentralAuthModal(trigger)) {
      $("centralSessionNotice").textContent =
        "No se pudo abrir la conexión central. Recarga la aplicación.";
    }
  }

  function enterAsCentralAdministrator() {
    const user = state.users.find(
      (candidate) =>
        candidate.id === centralProfileId &&
        candidate.active &&
        candidate.role === "administrador",
    );
    if (centralProfileRole !== "administrador" || !user) return false;
    employeeSession = { userId: user.id, startedAt: nowISO() };
    state.activeUserId = user.id;
    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, user.id);
    audit(
      "login",
      "session",
      user.id,
      "Inicio de turno administrador con cuenta central",
      null,
      { role: user.role, center: user.center },
    );
    saveState();
    unlockAdmin();
    return true;
  }

  function resumePendingAccessFlow() {
    if (centralAccessState !== "ready" || !pendingAccessFlow) return;
    const flow = pendingAccessFlow;
    setPendingAccessFlow(null);
    if ($("accessChoiceDialog")?.open) $("accessChoiceDialog").close();
    if ($("v3AuthDialog")?.open) {
      window.PurificadoraCentralAuthUi?.discardOriginDialog?.();
      $("v3AuthDialog").close();
    }
    if (flow === "admin") {
      if (enterAsCentralAdministrator()) return;
      openAccessChoice({ clearPending: true });
      const notice = $("centralSessionNotice");
      notice.hidden = false;
      notice.textContent =
        "La cuenta central conectada no tiene permiso de administrador.";
      return;
    }
    openEmployeeLogin();
  }

  // Cerrar el login con la "x" dejaba el dashboard accesible sin turno: la
  // pantalla quedaba operable con el chip "Sin sesion". Si al cerrarse no hay
  // usuario activo, se regresa a la eleccion de acceso, que es modal y no
  // tiene boton de cierre.
  function guardSessionDialogClose() {
    if (activeUser()) return;
    if ($("accessChoiceDialog")?.open) return;
    // El flujo sigue vivo esperando a la cuenta central; no lo interrumpimos.
    if (pendingAccessFlow || $("v3AuthDialog")?.open) return;
    openAccessChoice();
  }

  function beginAccessFlow(flow) {
    setPendingAccessFlow(flow);
    if (centralAccessState === "ready") return resumePendingAccessFlow();
    updateAccessChoiceStatus();
    if (centralAccessState === "unavailable") requestCentralReconnect();
  }

  function handleCentralAccessState(event) {
    centralAccessState = event.detail?.ready ? "ready" : "unavailable";
    centralProfileId = event.detail?.ready
      ? event.detail?.profileId || null
      : null;
    centralProfileRole = event.detail?.ready ? event.detail?.role || null : null;
    updateAccessChoiceStatus();
    if (centralAccessState === "ready") resumePendingAccessFlow();
    else if (pendingAccessFlow) requestCentralReconnect();
  }

  function populateEmployeeLogin() {
    const users = state.users.filter(
      (u) =>
        u.active &&
        u.role !== "administrador" &&
        (u.pinConfigured || u.pin),
    );
    $("employeeLoginUser").innerHTML = users
      .map(
        (u) =>
          `<option value="${u.id}">${esc(userDisplayLabel(u))}</option>`,
      )
      .join("");
  }
  function openEmployeeLogin() {
    if (centralAccessState !== "ready") return beginAccessFlow("user");
    employeeSession = null;
    adminMode = false;
    document.body.classList.remove("admin-mode");
    populateEmployeeLogin();
    $("employeeLoginForm").reset();
    $("employeeLoginError").textContent = "";
    if (!$("employeeLoginUser").options.length) {
      $("employeeLoginError").textContent =
        "No hay empleados con PIN configurado.";
    }
    if (!$("employeeLoginDialog").open) $("employeeLoginDialog").showModal();
  }
  async function loginEmployee(e) {
    e.preventDefault();
    const id = $("employeeLoginUser").value,
      pin = $("employeeLoginPin").value.trim(),
      user = state.users.find(
        (u) => u.id === id && u.active && u.role !== "administrador",
      );
    let validPin = false;
    try {
      validPin = await validateEmployeePin(user, pin);
    } catch (error) {
      $("employeeLoginError").textContent =
        error?.userMessage || error?.message || "No se pudo validar el PIN.";
      return;
    }
    if (!validPin) {
      audit("login_failed", "session", id, "PIN de empleado incorrecto");
      saveState();
      $("employeeLoginError").textContent = "Usuario o PIN incorrecto.";
      return;
    }
    employeeSession = { userId: user.id, startedAt: nowISO() };
    state.activeUserId = user.id;
    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, user.id);
    audit(
      "login",
      "session",
      user.id,
      "Inicio de turno",
      { device: navigator.userAgent },
      { role: user.role, center: user.center },
    );
    saveState();
    $("employeeLoginDialog").close();
    renderAll();
    showView("dashboard");
    toast(`Turno iniciado: ${user.name}`);
  }
  async function logoutEmployee() {
    const user = activeUser();
    if (!user) return openAccessChoice({ clearPending: true });
    if (getOpenCashSession(user.id))
      return toast("Cierra tu caja antes de terminar el turno.", "error");
    if (adminMode) lockAdmin("Modo administrador cerrado al terminar turno.");
    audit("logout", "session", user.id, "Cierre de turno");
    saveState();
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    openAccessChoice({ clearPending: true });
    renderAll();
  }
  function populateAdminLogin() {
    const admins = state.users.filter(
      (u) =>
        u.active &&
        u.role === "administrador" &&
        (u.pinConfigured || u.pin),
    );
    $("adminLoginUser").innerHTML = admins
      .map((u) => `<option value="${u.id}">${esc(userDisplayLabel(u))}</option>`)
      .join("");
  }
  function openAdminEntryLogin() {
    if (centralAccessState !== "ready") return beginAccessFlow("admin");
    adminLoginPurpose = "entry";
    populateAdminLogin();
    $("adminLoginUserWrap").classList.remove("hidden");
    $("adminLoginForm").reset();
    $("adminLoginError").textContent = $("adminLoginUser").options.length
      ? ""
      : "No hay administradores activos disponibles.";
    if (!$("adminLoginDialog").open) $("adminLoginDialog").showModal();
  }
  function openAdminLogin() {
    if (!employeeSession) return;
    if (activeUser()?.role !== "administrador")
      return toast(
        "Este usuario no puede abrir el modo administrador.",
        "error",
      );
    adminLoginPurpose = "elevate";
    populateAdminLogin();
    $("adminLoginUser").value = activeUser().id;
    $("adminLoginUserWrap").classList.add("hidden");
    $("adminLoginForm").reset();
    $("adminLoginError").textContent = "";
    if (!$("adminLoginDialog").open) $("adminLoginDialog").showModal();
  }
  async function loginAdmin(e) {
    e.preventDefault();
    const pin = $("adminLoginPin").value.trim();
    const user =
      adminLoginPurpose === "entry"
        ? state.users.find(
            (u) => u.id === $("adminLoginUser").value && u.active,
          )
        : activeUser();
    const remainingLock = adminPinLockedUntil - Date.now();
    if (remainingLock > 0) {
      $("adminLoginError").textContent = `Espera ${Math.ceil(remainingLock / 1000)} segundos antes de intentar de nuevo.`;
      return;
    }
    let validPin = false;
    try {
      validPin = await requireAdminPin(pin, user);
    } catch (error) {
      $("adminLoginError").textContent =
        error?.userMessage || error?.message || "No se pudo validar el PIN.";
      return;
    }
    if (!validPin) {
      adminPinFailures += 1;
      if (adminPinFailures >= 5) {
        adminPinFailures = 0;
        adminPinLockedUntil = Date.now() + 30000;
      }
      audit(
        "admin_access_failed",
        "session",
        "admin",
        "PIN de empleado administrador incorrecto",
      );
      saveState();
      $("adminLoginError").textContent = "PIN incorrecto.";
      return;
    }
    adminPinFailures = 0;
    adminPinLockedUntil = 0;
    if (adminLoginPurpose === "entry") {
      employeeSession = { userId: user.id, startedAt: nowISO() };
      state.activeUserId = user.id;
      sessionStorage.setItem(EMPLOYEE_SESSION_KEY, user.id);
      audit("login", "session", user.id, "Inicio de turno administrador", null, {
        role: user.role,
        center: user.center,
      });
      saveState();
    }
    $("adminLoginDialog").close();
    unlockAdmin();
  }
  function setupLogoGestures() {
    $$(".brand-logo,.topbar-logo,.hero-logo").forEach((logo) => {
      logo.addEventListener("click", () => {
        if (!adminMode) return;
        const now = Date.now();
        logoTapTimes = logoTapTimes.filter((t) => now - t < 1800);
        logoTapTimes.push(now);
        if (logoTapTimes.length >= 5) {
          logoTapTimes = [];
          showView("diagnostico");
        }
      });
    });
  }

  function init() {
    bindNavigation();
    bindDialogs();
    bindForms();
    bindGeneral();
    setupLogoGestures();
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("storage", handleExternalStorageChange);
    window.addEventListener(
      "purificadora:central-access",
      handleCentralAccessState,
    );
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      const appBuild =
        document.querySelector('meta[name="app-build"]')?.content || "current";
      navigator.serviceWorker
        .register(`./sw.js?v=${encodeURIComponent(appBuild)}`)
        .catch(() => {});
    }
    $("todayLabel").textContent = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    employeeSession = null;
    adminMode = false;
    state.activeUserId = null;
    resetSaleForm();
    renderAll();
    if (recoveryRequired) {
      sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
      employeeSession = null;
      $("restorePreviousStateBtn").disabled = !validPreviousState();
      $("recoveryDialog").showModal();
      return;
    }
    openAccessChoice();
  }

  function bindNavigation() {
    document.body.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-view]");
      if (nav) showView(nav.dataset.view);
      const b = e.target.closest("[data-go]");
      if (b) {
        if (b.dataset.go === "ventas" && b.dataset.channel)
          beginSaleForRoute(b.dataset.channel);
        else {
          showView(b.dataset.go);
          if (b.dataset.expenseCenter) {
            $("expenseCenter").value = b.dataset.expenseCenter;
            $("expenseConcept").dataset.contextCenter = b.dataset.expenseCenter;
          }
        }
      }
      const inventoryAction = e.target.closest("[data-inventory-quick]");
      if (inventoryAction?.dataset.inventoryQuick === "adjust")
        openInventoryAdjustQuick(inventoryAction.dataset.location);
      if (inventoryAction?.dataset.inventoryQuick === "transfer")
        openInventoryTransferQuick(inventoryAction.dataset.location);
      if (inventoryAction?.dataset.inventoryQuick === "fill")
        openFillContainersDialog();
    });
    document.body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const stockFigure = e.target.closest(".route-stock-inline-edit");
      if (!stockFigure) return;
      e.preventDefault();
      stockFigure.click();
    });
    $("menuBtn").addEventListener("click", () =>
      $("sidebar").classList.toggle("open"),
    );
    $("moreNavBtn").addEventListener("click", () =>
      $("sidebar").classList.toggle("open"),
    );
    $("sidebarBackdrop").addEventListener("click", () =>
      $("sidebar").classList.remove("open"),
    );
  }
  function mountSaleFormForView(name) {
    const form = $("saleForm");
    if (name === "ventanilla") {
      $("windowSaleSlot").appendChild(form);
      form.classList.add("window-compact-sale");
      return;
    }
    if (form.parentElement !== saleFormOriginalHost)
      saleFormOriginalHost.insertBefore(form, saleFormOriginalNextSibling);
    form.classList.remove("window-compact-sale");
  }
  function showView(name, { preserveSidebar = false } = {}) {
    if (!employeeSession) {
      openAccessChoice({ clearPending: true });
      return;
    }
    if (!canAccess(name)) {
      audit(
        "unauthorized",
        "view",
        name,
        "Intento de acceso a módulo no autorizado",
      );
      saveState();
      toast("El usuario activo no tiene permiso para este módulo", "error");
      return;
    }
    const isNewNavigation = currentView !== name;
    const preservedScrollY = window.scrollY;
    resetAdminActivity();
    if (
      ["ventas", "ventanilla"].includes(name) &&
      currentView !== name
    ) {
      saleOriginView = currentView || "dashboard";
      resetSaleForm();
    }
    mountSaleFormForView(name);
    if (name === "ventanilla") {
      $("saleChannel").value = "ventanilla";
      updateSaleSummary();
      captureSaleInitialState();
    }
    $$(".view").forEach((v) => v.classList.remove("active"));
    $$(".nav-item").forEach((b) => b.classList.remove("active"));
    $(`view-${name}`)?.classList.add("active");
    document.querySelector(`[data-view="${name}"]`)?.classList.add("active");
    $$(".bottom-nav [data-view]").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === name),
    );
    $("moreNavBtn").classList.toggle(
      "active",
      !["dashboard", "ventas", "clientes", "fiado"].includes(name),
    );
    const titles = {
      dashboard: "Inicio",
      clientes: "Clientes",
      ventas: "Nueva venta",
      ultimas: "Últimas ventas",
      fiado: "Fiado y pagos",
      envases: "Envases pendientes",
      rutas: "Rutas",
      ventanilla: "Ventanilla",
      caja: "Caja",
      inventario: "Inventario",
      insumos: "Insumos",
      mantenimiento: "Mantenimiento",
      gastos: "Gastos",
      usuarios: "Empleados",
      reportes: "Reportes",
      configuracion: "Configuración",
      auditoria: "Auditoría",
      diagnostico: "Diagnóstico",
    };
    currentView = name;
    $("viewTitle").textContent = titles[name] || name;
    if (!preserveSidebar) $("sidebar").classList.remove("open");
    if (isNewNavigation && window.scrollY !== 0)
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    renderView(name);
    if (!isNewNavigation && window.scrollY !== preservedScrollY)
      window.scrollTo({
        top: preservedScrollY,
        left: 0,
        behavior: "auto",
      });
    renderOperationalStatus();
  }
  function bindDialogs() {
    $$("[data-close]").forEach((b) =>
      b.addEventListener("click", () => requestDialogClose($(b.dataset.close))),
    );
    $$("dialog").forEach((d) => {
      d.addEventListener("cancel", (e) => {
        if (dialogIsDirty(d)) {
          e.preventDefault();
          requestDialogClose(d);
        }
      });
      d.addEventListener("close", () => {
        const form = d.querySelector("[data-dirty-guard]");
        if (form) delete form.dataset.baseline;
      });
    });
    ["employeeLoginDialog", "adminLoginDialog"].forEach((id) =>
      $(id).addEventListener("close", guardSessionDialogClose),
    );
    document.addEventListener("focusin", captureDialogBaseline, true);
    document.addEventListener("pointerdown", captureDialogBaseline, true);
    document.addEventListener("focusin", scrollFieldIntoViewOnFocus);
    document.addEventListener("input", autoGrowTextarea);
    bindKeyboardAwareScroll();
    $("keepEditingBtn").addEventListener("click", () => {
      $("discardChangesDialog").close();
      pendingDialogClose = null;
    });
    $("discardDialogBtn").addEventListener("click", confirmDiscardDialog);
    $("resetDataDialog").addEventListener("close", () => {
      if (recoveryRequired && !$("recoveryDialog").open)
        $("recoveryDialog").showModal();
    });
    $("newClientBtn").addEventListener("click", () => openClientDialog());
    $("saleNewClientBtn").addEventListener("click", openQuickClientDialog);
    $("newUserBtn").addEventListener("click", () => openUserDialog());
    $("cancelDeleteUserBtn").addEventListener("click", closeDeleteUserDialog);
    $("closeDeleteUserBtn").addEventListener("click", closeDeleteUserDialog);
    $("confirmDeleteUserBtn").addEventListener("click", confirmDeleteUser);
    $("startRoundBtn").addEventListener("click", openStartRoundDialog);
    $("fillContainersBtn").addEventListener("click", openFillContainersDialog);
    $("newSupplyBtn").addEventListener("click", () => openSupplyDialog());
  }
  function formSnapshot(form) {
    return JSON.stringify(
      [...form.elements]
        .filter(
          (el) =>
            el.name !== undefined && !["button", "submit"].includes(el.type),
        )
        .map((el) => [
          el.id || el.name,
          el.type === "checkbox"
            ? el.checked
            : el.multiple
              ? [...el.selectedOptions].map((o) => o.value)
              : el.value,
        ]),
    );
  }
  function captureDialogBaseline(event) {
    const dialog = event.target.closest?.("dialog"),
      form = dialog?.querySelector("[data-dirty-guard]");
    if (form && !form.dataset.baseline)
      form.dataset.baseline = formSnapshot(form);
  }
  function dialogIsDirty(dialog) {
    const form = dialog?.querySelector("[data-dirty-guard]");
    return Boolean(
      form?.dataset.baseline && form.dataset.baseline !== formSnapshot(form),
    );
  }
  // El campo enfocado debe quedar visible cuando sube el teclado. Un solo
  // timeout de 300ms no basta: en iOS el teclado no reduce el layout (el meta
  // interactive-widget solo aplica en Chrome Android), asi que el campo queda
  // debajo sin que cambie nada medible. visualViewport si reporta el area real
  // en ambos, y avisa cuando el teclado termina de animar.
  let focusedField = null;
  function fieldIsHiddenByKeyboard(field) {
    const view = window.visualViewport;
    if (!view) return false;
    const box = field.getBoundingClientRect();
    return box.bottom > view.height - 12 || box.top < 0;
  }
  function revealFocusedField() {
    if (!focusedField?.isConnected) return;
    if (!fieldIsHiddenByKeyboard(focusedField)) return;
    focusedField.scrollIntoView({ block: "center", behavior: "auto" });
  }
  function scrollFieldIntoViewOnFocus(e) {
    const field = e.target;
    if (!field.matches?.("input, textarea, select")) return;
    if (!field.closest("dialog")) return;
    focusedField = field;
    // Sin visualViewport (navegadores viejos) se conserva el timeout ciego.
    if (!window.visualViewport) {
      window.setTimeout(() => field.scrollIntoView({ block: "center" }), 300);
      return;
    }
    window.setTimeout(revealFocusedField, 300);
  }
  function bindKeyboardAwareScroll() {
    const view = window.visualViewport;
    if (!view) return;
    view.addEventListener("resize", revealFocusedField);
    view.addEventListener("scroll", revealFocusedField);
    document.addEventListener("focusout", (e) => {
      if (e.target === focusedField) focusedField = null;
    });
  }
  // Los textarea traen rows="2"; en vez de tocar los 19 uno por uno, crecen
  // solos conforme se escribe. El tope evita que empujen el boton de guardar
  // fuera de la pantalla.
  const TEXTAREA_MAX_GROW = 260;
  function autoGrowTextarea(e) {
    const field = e.target;
    if (!field.matches?.("textarea")) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, TEXTAREA_MAX_GROW)}px`;
    field.style.overflowY =
      field.scrollHeight > TEXTAREA_MAX_GROW ? "auto" : "hidden";
  }
  function showManagedDialog(dialog) {
    const form = dialog.querySelector("[data-dirty-guard]");
    if (form) form.dataset.baseline = formSnapshot(form);
    if (!dialog.open) dialog.showModal();
  }
  function requestDialogClose(dialog) {
    if (!dialog?.open) return;
    if (dialog.id !== "discardChangesDialog" && dialogIsDirty(dialog)) {
      pendingDialogClose = dialog;
      if (!$("discardChangesDialog").open)
        $("discardChangesDialog").showModal();
      return;
    }
    dialog.close();
  }
  function confirmDiscardDialog() {
    $("discardChangesDialog").close();
    const target = pendingDialogClose;
    pendingDialogClose = null;
    if (target?.open) {
      const form = target.querySelector("[data-dirty-guard]");
      if (form) delete form.dataset.baseline;
      target.close();
    }
  }
  function bindForms() {
    $("adminReauthForm").addEventListener("submit", submitAdminReauth);
    $("employeeLoginForm").addEventListener("submit", loginEmployee);
    $("adminLoginForm").addEventListener("submit", loginAdmin);
    $("resetDataForm").addEventListener("submit", confirmResetApp);
    $("clientForm").addEventListener("submit", saveClient);
    $("mergeClientsForm").addEventListener("submit", mergeDuplicateClients);
    $("saleForm").addEventListener("submit", saveSale);
    $("paymentForm").addEventListener("submit", savePayment);
    $("containerReturnForm").addEventListener(
      "submit",
      saveContainerReturn,
    );
    $("userForm").addEventListener("submit", saveUser);
    $("transferForm").addEventListener("submit", saveTransfer);
    $("inventoryAdjustForm").addEventListener(
      "submit",
      saveInventoryAdjustment,
    );
    $("inventoryAdjustQuickForm").addEventListener(
      "submit",
      submitInventoryAdjustQuick,
    );
    $("inventoryTransferQuickForm").addEventListener(
      "submit",
      submitInventoryTransferQuick,
    );
    $("expenseForm").addEventListener("submit", saveExpense);
    $("cashOpenForm").addEventListener("submit", openCash);
    $("cashCloseForm").addEventListener("submit", closeCash);
    $("quickClientForm").addEventListener("submit", saveQuickClient);
    $("saleCorrectionForm").addEventListener("submit", saveSaleCorrectionV2);
    $("saleReturnForm").addEventListener("submit", saveSaleReturn);
    $("returnSaleQty").addEventListener("input", updateSaleReturnAmounts);
    $("saleVoidConfirmForm").addEventListener("submit", confirmVoidSale);
    $("startRoundForm").addEventListener("submit", startRound);
    $("reloadRoundForm").addEventListener("submit", reloadActiveRound);
    $("roundLoadCorrectionForm").addEventListener(
      "submit",
      saveRoundLoadCorrection,
    );
    $("roundLoadCorrectionQty").addEventListener(
      "input",
      updateRoundLoadCorrectionDifference,
    );
    $("returnRoundForm").addEventListener("submit", closeRound);
    $("continueRoundBtn").addEventListener("click", () =>
      $("returnRoundDialog").close(),
    );
    $("fillContainersForm").addEventListener("submit", fillContainersV22);
    $("cashMovementForm").addEventListener("submit", saveCashMovement);
    $("cashDeliveryForm").addEventListener("submit", saveCashDelivery);
    $("supplyForm").addEventListener("submit", saveSupply);
    $("supplyMovementForm").addEventListener("submit", saveSupplyMovement);
  }
  function bindGeneral() {
    $("v3AuthDialog").addEventListener("close", () => {
      // Si se cierra esta ventana sin completar el login (botón × , ESC,
      // clic fuera) y no quedó una sesión de empleado REAL Y VÁLIDA,
      // siempre se regresa a la pantalla de acceso limpia. Ojo: no basta
      // con revisar `employeeSession` -- ese objeto puede seguir en
      // sessionStorage de un login anterior aunque state.users todavía
      // no haya sincronizado con la cuenta central, dejando `activeUser()`
      // en null (sesión "fantasma": no bloquea el acceso, pero tampoco
      // resuelve a nadie real, y el menú queda vacío). Por eso se revisa
      // activeUser(), no solo la existencia de employeeSession.
      setPendingAccessFlow(null);
      if (!activeUser()) {
        employeeSession = null;
        sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
        window.setTimeout(() => openAccessChoice({ clearPending: true }), 0);
      }
    });
    ["cancelAdminReauthBtn", "cancelAdminReauthIconBtn"].forEach((id) =>
      $(id).addEventListener("click", () => finishAdminReauth(false)),
    );
    $("adminReauthDialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      finishAdminReauth(false);
    });
    $("enterAsAdminBtn").addEventListener("click", () =>
      beginAccessFlow("admin"),
    );
    $("enterAsUserBtn").addEventListener("click", () =>
      beginAccessFlow("user"),
    );
    $("backToAccessChoiceBtn").addEventListener("click", () =>
      openAccessChoice({ clearPending: true }),
    );
    $("backFromAdminLoginBtn").addEventListener("click", () =>
      openAccessChoice({ clearPending: true }),
    );
    $("clientSearch").addEventListener("input", renderClients);
    ["clientName", "clientPhone", "clientAddress"].forEach((id) =>
      $(id).addEventListener("input", () =>
        updateClientDuplicateWarning("full"),
      ),
    );
    ["quickClientName", "quickClientPhone", "quickClientAddress"].forEach(
      (id) =>
        $(id).addEventListener("input", () =>
          updateClientDuplicateWarning("quick"),
        ),
    );
    ["saleQty", "salePrice", "salePaid", "salePaymentType"].forEach((id) =>
      $(id).addEventListener("input", updateSaleSummary),
    );
    ["saleContainerMode", "saleEmptyReturnQty", "saleDamagedReturnQty"].forEach(
      (id) => $(id).addEventListener("input", updateSaleSummary),
    );
    $("saleClientSearch").addEventListener("input", renderSaleClientResults);
    $("salePaymentType").addEventListener("change", updateSaleSummary);
    $("saleQtyMinus").addEventListener("click", () => changeSaleQty(-1));
    $("saleQtyPlus").addEventListener("click", () => changeSaleQty(1));
    $("inventoryAdjustQuickQty").addEventListener(
      "input",
      updateInventoryAdjustQuickDifference,
    );
    $$(".payment-option").forEach((b) =>
      b.addEventListener("click", () => setSalePaymentType(b.dataset.payment)),
    );
    $$(".channel-option").forEach((b) =>
      b.addEventListener("click", () => setSaleChannel(b.dataset.channel)),
    );
    $("cancelSaleBtn").addEventListener("click", cancelSale);
    $("paymentSettleBtn").addEventListener("click", () => {
      $("paymentAmount").value = $("paymentDialog").dataset.balance || "";
    });
    $("paymentOtherAmountBtn").addEventListener("click", () => {
      $("paymentAmount").value = "";
      $("paymentAmount").focus();
    });
    $("confirmSaleCancelBtn").addEventListener(
      "click",
      confirmSaleCancellation,
    );
    $("debtFilters").addEventListener("click", (e) => {
      const b = e.target.closest("[data-debt-filter]");
      if (!b) return;
      debtFilter = b.dataset.debtFilter;
      $$("[data-debt-filter]").forEach((x) =>
        x.classList.toggle("active", x === b),
      );
      renderDebt();
    });
    $("logoutEmployeeBtn").addEventListener("click", logoutEmployee);
    $("openAdminBtn").addEventListener("click", openAdminLogin);
    $("closeAdminBtn").addEventListener("click", () => lockAdmin());
    $("mobileLockAdminBtn").addEventListener("click", () => lockAdmin());
    $("openCashFromRequiredBtn").addEventListener("click", () => {
      $("cashRequiredDialog").close();
      $("cashOpenDialog").showModal();
    });
    $("cashCountedAmount").addEventListener("input", updateCashCloseComparison);
    $("reloadExternalStateBtn").addEventListener("click", reloadExternalState);
    $("downloadRawStateBtn").addEventListener("click", downloadRawState);
    $("restorePreviousStateBtn").addEventListener(
      "click",
      restorePreviousState,
    );
    $("manualRecoveryResetBtn").addEventListener("click", openRecoveryReset);
    $("resetMaintenanceBtn").addEventListener("click", resetMaintenance);
    $("saveMaintenanceThresholdBtn").addEventListener(
      "click",
      saveMaintenanceThreshold,
    );
    $("saveSettingsBtn").addEventListener("click", saveSettings);
    $("exportBtn").addEventListener("click", exportBackup);
    $("importInput").addEventListener("change", importBackup);
    $("resetAppBtn").addEventListener("click", resetApp);
    $("auditSearch").addEventListener("input", renderAudit);
    $("userRole").addEventListener("change", (e) => {
      applyRolePermissions(e.target.value);
      updateUserRoleFields();
    });
    $("generateUserPinBtn").addEventListener("click", generateUserPin);
    $("copyUserPinBtn").addEventListener("click", copyUserPin);
    $("userPin").addEventListener("input", updateUserPinCopyState);
    $("resetRolePermissionsBtn").addEventListener("click", () =>
      applyRolePermissions($("userRole").value),
    );
    $("userPermissions").addEventListener("change", updatePermissionCount);
    $("correctionPaymentType").addEventListener("change", updateCorrectionPaid);
    ["correctionQty", "correctionPrice"].forEach((id) =>
      $(id).addEventListener("input", updateCorrectionPaid),
    );
    $("voidSaleBtn").addEventListener("click", openVoidSaleConfirmation);
    $("supplyMovementType").addEventListener(
      "change",
      updateSupplyMovementFields,
    );
    ["resetAdminPin", "resetConfirmText"].forEach((id) =>
      $(id).addEventListener("input", updateResetButton),
    );
    ["click", "touchstart", "keydown", "submit"].forEach((event) =>
      document.addEventListener(event, resetAdminActivity, { passive: true }),
    );
  }
  function updateOnlineStatus() {
    const on = navigator.onLine;
    $("onlineBadge").textContent = on ? "En línea" : "Sin conexión";
    $("onlineBadge").classList.toggle("offline", !on);
    renderOperationalStatus();
  }

  function renderAll() {
    state.rounds
      .filter((r) => r.status !== "cerrada")
      .forEach((r) => {
        r.soldQty = undefined;
      });
    renderSessionUi();
    renderDashboard();
    renderClients();
    renderLatestSales();
    renderAllLatestSales();
    renderDebt();
    renderContainerDebt();
    renderRoutes();
    renderWindow();
    renderCash();
    renderInventory();
    renderSupplies();
    renderMaintenance();
    renderExpenses();
    renderUsers();
    renderReports();
    renderSettings();
    renderAudit();
    updateSaleSummary();
  }
  function renderView(name) {
    (
      ({
        dashboard: renderDashboard,
        clientes: renderClients,
        ventas: renderLatestSales,
        ultimas: renderAllLatestSales,
        fiado: renderDebt,
        envases: renderContainerDebt,
        rutas: renderRoutes,
        ventanilla: renderWindow,
        caja: renderCash,
        inventario: renderInventory,
        insumos: renderSupplies,
        mantenimiento: renderMaintenance,
        gastos: renderExpenses,
        usuarios: renderUsers,
        reportes: renderReports,
        configuracion: renderSettings,
        auditoria: renderAudit,
        diagnostico: renderOperationalStatus,
      })[name] || (() => {})
    )();
  }
  function renderSessionUi() {
    const u = activeUser();
    $("sessionChip").textContent = u
      ? userDisplayLabel(u)
      : "Sin sesión";
    $("mobileUserIdentity").textContent = u ? userDisplayLabel(u) : "";
    const runtimeVersion = state.central
      ? "V3.0.1 online"
      : "Conexión requerida";
    $("modeLabel").textContent = adminMode
      ? `Modo administrador · ${runtimeVersion}`
      : `Modo operativo · ${runtimeVersion}`;
    $("closeAdminBtn").classList.toggle("hidden", !adminMode);
    $("mobileLockAdminBtn").classList.toggle("hidden", !adminMode);
    $("adminModeBadge").classList.toggle("hidden", !adminMode);
    $("openAdminBtn").classList.toggle(
      "hidden",
      u?.role !== "administrador" || adminMode,
    );
    $("logoutEmployeeBtn").classList.toggle("hidden", !employeeSession);
    $$("[data-view]").forEach((b) => (b.hidden = !canAccess(b.dataset.view)));
    const controls = [
      ["newClientBtn", "create_client"],
      ["saleNewClientBtn", "create_client"],
      ["newUserBtn", "users"],
      ["newSupplyBtn", "supplies"],
      ["startRoundBtn", "rounds"],
      ["fillContainersBtn", "rounds"],
      ["exportBtn", "backups"],
      ["importInput", "backups"],
      ["resetAppBtn", "reset_data"],
      ["saveSettingsBtn", "settings"],
      ["resetMaintenanceBtn", "maintenance"],
      ["saveMaintenanceThresholdBtn", "maintenance"],
    ];
    controls.forEach(([id, p]) => {
      const el = $(id);
      if (el)
        el.closest(".file-label")
          ? el.closest(".file-label").classList.toggle("hidden", !can(p))
          : el.classList.toggle("hidden", !can(p));
    });
    $("transferForm").classList.toggle("hidden", !can("transfer_inventory"));
    $("inventoryAdjustForm").classList.toggle(
      "hidden",
      !can("adjust_inventory"),
    );
    renderOperationalStatus();
  }

  function renderOperationalStatus() {
    const statusBar = $("operationalStatusBar");
    const showGlobalStatus = currentView === "dashboard";
    statusBar.hidden = !showGlobalStatus;
    if (!showGlobalStatus) {
      statusBar.innerHTML = "";
      return;
    }
    const user = activeUser();
    const cashOpen = Boolean(getOpenCashSession(user?.id));
    const route =
      user?.role === "repartidor" && ["ruta1", "ruta2"].includes(user.center)
        ? user.center
        : null;
    const roundOpen = route
      ? Boolean(activeRound(route))
      : state.rounds.some((round) => round.status !== "cerrada");
    const statuses = [
      [navigator.onLine ? "En línea" : "Sin conexión", navigator.onLine],
      [cashOpen ? "Caja abierta" : "Caja cerrada", cashOpen],
      [roundOpen ? "Ronda activa" : "Sin ronda", roundOpen],
      [state.central ? "Sincronizado" : "Pendiente", state.central],
    ];
    statusBar.innerHTML = statuses
      .map(
        ([label, active]) =>
          `<span class="operational-status ${active ? "is-active" : "is-warning"}"><i></i>${esc(label)}</span>`,
      )
      .join("");
  }

  function metric(label, value, hint = "") {
    return `<div class="metric-card"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`;
  }
  function renderDashboard() {
    const u = activeUser(),
      allSales = todaySales(),
      isAdmin = adminMode && u?.role === "administrador";
    let sales = allSales;
    if (!isAdmin && u?.role === "repartidor")
      sales = allSales.filter(
        (s) => s.channel === u.center && s.userId === u.id,
      );
    else if (!isAdmin && u?.role === "ventanilla")
      sales = allSales.filter(
        (s) => s.channel === "ventanilla" && s.userId === u.id,
      );
    else if (!isAdmin) sales = allSales.filter((s) => s.userId === u?.id);
    const expenses = isAdmin
        ? todayExpenses()
        : todayExpenses().filter((e) => e.userId === u?.id),
      payments = state.ledger.filter(
        (x) =>
          sameDay(x.date) &&
          x.type === "payment" &&
          (isAdmin || x.userId === u?.id),
      );
    const units = sales.reduce((a, s) => a + s.qty, 0),
      revenue = sales.reduce((a, s) => a + s.total, 0),
      collected =
        sales.reduce((a, s) => a + s.paid, 0) +
        payments.reduce((a, x) => a + x.payment, 0),
      credit = sales.reduce((a, s) => a + s.credit, 0),
      exp = expenses.reduce((a, e) => a + e.amount, 0),
      open = getOpenCashSession(u?.id),
      inventoryTotal = Object.values(state.inventory).reduce(
        (a, n) => a + Number(n || 0),
        0,
      ),
      pending = state.clients.reduce(
        (a, c) => a + Math.max(0, clientBalance(c.id)),
        0,
      );
    const ownRound =
      u?.role === "repartidor" ? activeRound(u.center) : null;
    const dashboardCards = [];
    if (can("view_own_cash")) {
      const expected = open ? cashMovementsForSession(open).expected : 0;
      dashboardCards.push(`<article class="operational-card operational-card--caja${open ? " is-live" : ""}"><div class="operational-card-head"><div class="operational-card-title"><span class="card-icon" aria-hidden="true">💵</span><div><span class="eyebrow">CAJA</span><h3>${open ? "Caja abierta" : "Caja cerrada"}</h3></div></div><strong>${open ? money(expected) : ""}</strong></div><div class="quick-actions"><button class="secondary-btn" data-go="caja">Ver</button><button class="primary-btn" id="dashboardCashAction">${open ? "Cerrar" : "Abrir caja"}</button></div></article>`);
    }
    if (can("rounds")) {
      const routeScope = ownRound ? [u.center] : ["ruta1", "ruta2"];
      routeScope.forEach((route) => {
        const round = activeRound(route),
          routeMetrics = round ? roundMetrics(round) : null,
          routeSales = todaySales().filter((sale) => sale.channel === route),
          sold = routeSales.reduce((sum, sale) => sum + sale.qty, 0);
        dashboardCards.push(`<article class="operational-card operational-card--ruta${round && round.status !== "regresada" ? " is-live" : ""}"><div class="operational-card-head"><div class="operational-card-title"><span class="card-icon" aria-hidden="true">🛻</span><div><span class="eyebrow">${esc(routeLabel(route).toUpperCase())}</span><h3>${round ? round.status === "regresada" ? "Regreso registrado" : "Ronda activa" : "Sin ronda"}</h3></div></div><strong class="${routeMetrics?.inconsistencyQty ? "amount-danger" : ""}">${routeMetrics ? routeMetrics.inconsistencyQty ? "Requiere ajuste" : `${int(routeMetrics.availableFull)} llenos` : ""}</strong></div><div class="operational-card-stats"><span>${int(state.inventory[`empty_${route}`] || 0)} vacíos</span><span>${int(sold)} vendidos</span></div><div class="quick-actions">${round ? `<button class="primary-btn" data-go="ventas" data-channel="${route}" ${routeMetrics.inconsistencyQty || round.status === "regresada" ? "disabled" : ""}>Nueva venta</button><button class="secondary-btn reload-round" data-id="${round.id}" ${round.status === "regresada" ? "disabled" : ""}>Recargar</button><button class="secondary-btn return-round" data-id="${round.id}" ${routeMetrics.inconsistencyQty && !isAdmin ? "disabled" : ""}>${round.status === "regresada" ? "Cerrar ronda" : "Regreso"}</button>${isAdmin && routeMetrics.inconsistencyQty ? `<button class="text-btn recover-round" data-id="${round.id}">Resolver ronda activa</button>` : ""}` : `<button class="primary-btn route-start-round" data-route="${route}">Iniciar ronda</button>`}<button class="text-btn" data-go="rutas">Ver detalle</button>${isAdmin ? `<button class="text-btn" data-go="gastos" data-expense-center="${route}">Registrar gasto</button>` : ""}</div></article>`);
      });
    }
    if (can("view_inventory"))
      dashboardCards.push(`<article class="operational-card operational-card--local"><div class="operational-card-head"><div class="operational-card-title"><span class="card-icon" aria-hidden="true">📦</span><div><span class="eyebrow">LOCAL</span><h3>Inventario</h3></div></div><strong>${int(state.inventory.local || 0)} llenos</strong></div><div class="operational-card-stats"><span>${int(state.inventory.empty_local || 0)} vacíos</span><span>${int(state.inventory.danados || 0)} dañados</span></div><div class="quick-actions">${can("rounds") ? '<button class="primary-btn" data-inventory-quick="fill" data-location="empty_local">Preparar llenos</button>' : ""}${can("transfer_inventory") ? '<button class="secondary-btn" data-inventory-quick="transfer" data-location="local">Transferir</button>' : ""}${can("adjust_inventory") ? '<button class="secondary-btn" data-inventory-quick="adjust" data-location="local">Ajustar</button>' : ""}<button class="text-btn" data-go="inventario">Ver detalle</button></div></article>`);
    if (can("register_payment"))
      dashboardCards.push(`<article class="operational-card operational-card--fiado${pending > 0.009 ? " is-live" : ""}"><div class="operational-card-head"><div class="operational-card-title"><span class="card-icon" aria-hidden="true">🧾</span><div><span class="eyebrow">FIADO</span><h3>${money(pending)} pendiente</h3></div></div></div><div class="quick-actions"><button class="primary-btn" data-go="fiado">Cobrar</button><button class="text-btn" data-go="clientes">Ver clientes</button></div></article>`);
    if (can("create_expense"))
      dashboardCards.push(`<article class="operational-card operational-card--gastos"><div class="operational-card-head"><div class="operational-card-title"><span class="card-icon" aria-hidden="true">🧮</span><div><span class="eyebrow">GASTOS</span><h3>Registro rápido</h3></div></div></div><div class="quick-actions"><button class="primary-btn" data-go="gastos" data-expense-center="${esc(u?.center || "local")}">Registrar gasto</button></div></article>`);
    if (isAdmin && can("close_work_day")) {
      const openCashCount = state.cashSessions.filter((s) => !s.closedAt).length;
      const activeRoundCount = state.rounds.filter((r) => r.status !== "cerrada").length;
      dashboardCards.push(`<article class="operational-card operational-card--workday"><div class="operational-card-head"><div class="operational-card-title"><span class="card-icon" aria-hidden="true">🔒</span><div><span class="eyebrow">CIERRE</span><h3>Cerrar jornada</h3></div></div></div><div class="operational-card-stats"><span>${int(openCashCount)} caja(s)</span><span>${int(activeRoundCount)} ronda(s)</span></div><div class="quick-actions"><button class="primary-btn" id="closeWorkDayBtn">Cerrar jornada</button></div></article>`);
    }
    $("dashboardPrimaryActions").innerHTML = dashboardCards.join("");
    const cashAction = $("dashboardCashAction");
    if (cashAction)
      cashAction.onclick = () =>
        open
          ? openCloseCashDialog(open)
          : showManagedDialog($("cashOpenDialog"));
    $$("#dashboardPrimaryActions .route-start-round").forEach(
      (button) =>
        (button.onclick = () => openStartRoundDialog(button.dataset.route)),
    );
    $$("#dashboardPrimaryActions .reload-round").forEach(
      (button) => (button.onclick = () => openReloadRound(button.dataset.id)),
    );
    $$("#dashboardPrimaryActions .return-round").forEach(
      (button) => (button.onclick = () => openReturnRound(button.dataset.id)),
    );
    $$("#dashboardPrimaryActions .recover-round").forEach(
      (button) => (button.onclick = () => openReturnRound(button.dataset.id, true)),
    );
    const closeWorkDayBtn = $("closeWorkDayBtn");
    if (closeWorkDayBtn) {
      const openCashCount = state.cashSessions.filter((s) => !s.closedAt).length;
      const activeRoundCount = state.rounds.filter((r) => r.status !== "cerrada").length;
      $("closeWorkDayOpenCashes").textContent = `Cerrar ${int(openCashCount)} caja(s) abierta(s)`;
      $("closeWorkDayActiveRounds").textContent = `Cerrar ${int(activeRoundCount)} ronda(s) activa(s)`;
      closeWorkDayBtn.onclick = openCloseWorkDayDialog;
    }
    $("closeWorkDayForm").addEventListener("submit", closeWorkDay);
    if (isAdmin) {
      $("dashboardEyebrow").textContent = "ADMINISTRACIÓN · HOY";
      $("dashboardHeading").textContent = "Resumen de hoy";
      $("dashboardIntro").textContent = "Ventas, caja, deuda e inventario.";
      $("dashboardMetrics").innerHTML = [
        metric("Garrafones", int(units), "Vendidos hoy"),
        metric("Ventas", money(revenue), "Importe vendido"),
        metric("Cobrado", money(collected), "Ventas + abonos"),
        metric("Fiado generado", money(credit), "Hoy"),
        metric("Deuda total", money(pending), "Saldo acumulado"),
        metric("Gastos", money(exp), "Hoy"),
        metric(
          "Resultado operativo",
          money(revenue - exp),
          "Ventas menos gastos",
        ),
        metric(
          "Cajas e inventario",
          state.cashSessions.filter((s) => !s.closedAt).length + " abiertas",
          `${int(inventoryTotal)} garrafones`,
        ),
      ].join("");
    } else if (u?.role === "repartidor") {
      $("dashboardEyebrow").textContent = (
        routeLabel(u.center) || "RUTA"
      ).toUpperCase();
      $("dashboardHeading").textContent =
        `Operación de ${routeLabel(u.center)}`;
      $("dashboardIntro").textContent =
        "Ventas, cobros y clientes asignados a tu ruta.";
      const routeClients = state.clients.filter(
        (c) => c.route === u.center && c.active !== false,
      ).length;
      $("dashboardMetrics").innerHTML = [
        metric(
          "Inventario móvil",
          int(state.inventory[u.center] || 0),
          "Garrafones disponibles",
        ),
        metric("Garrafones", int(units), "Vendidos hoy"),
        metric("Cobrado", money(collected), "Ventas + abonos"),
        metric("Fiado", money(credit), "Generado hoy"),
        metric("Clientes", int(routeClients), "Asignados a tu ruta"),
        metric("Caja", open ? "Abierta" : "Cerrada", "Tu turno"),
      ].join("");
    } else {
      $("dashboardEyebrow").textContent =
        u?.role === "ventanilla" ? "VENTANILLA" : "MODO OPERATIVO";
      $("dashboardHeading").textContent = `Turno de ${u?.name || "empleado"}`;
      $("dashboardIntro").textContent = "Acciones y resultados de tu turno.";
      $("dashboardMetrics").innerHTML = [
        metric("Caja", open ? "Abierta" : "Cerrada", "Tu turno"),
        metric("Garrafones", int(units), "Vendidos hoy"),
        metric("Ventas", money(revenue), "Hoy"),
        metric("Cobrado", money(collected), "Ventas + abonos"),
        metric("Fiado", money(credit), "Generado hoy"),
      ].join("");
    }
    if (isAdmin) {
      const lowSupplies = state.supplies.filter(
          (s) =>
            s.active !== false &&
            Number(s.currentStock) <= Number(s.minimumStock),
        ).length,
        activeRoundsCount = state.rounds.filter(
          (r) => r.status !== "cerrada",
        ).length,
        differences = state.cashSessions
          .filter((s) => s.closedAt && sameDay(s.closedAt))
          .reduce((a, s) => a + Number(s.difference || 0), 0);
      $("dashboardMetrics").insertAdjacentHTML(
        "beforeend",
        metric("Rondas activas", int(activeRoundsCount), "Ruta 1 y Ruta 2") +
          metric("Insumos bajos", int(lowSupplies), "Alertas de existencia") +
          metric("Diferencias de caja", money(differences), "Cortes de hoy"),
      );
    }
    const totals = Object.keys(CHANNELS).map((k) => ({
      k,
      val: sales
        .filter((s) => s.channel === k)
        .reduce((a, s) => a + s.total, 0),
    }));
    const max = Math.max(1, ...totals.map((x) => x.val));
    $("channelBreakdown").innerHTML = totals
      .map(
        (x) =>
          `<div class="bar-row"><span>${CHANNELS[x.k]}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.val / max) * 100}%"></div></div><strong>${money(x.val)}</strong></div>`,
      )
      .join("");
    const debtors = state.clients
      .map((c) => ({
        ...c,
        balance: clientBalance(c.id),
        age: debtAgeDays(c.id),
      }))
      .filter((c) => c.balance > 0.009 && clientInDebtScope(c, u))
      .sort((a, b) => b.balance - a.balance);
    $("debtPreview").innerHTML = debtors.length
      ? debtors
          .slice(0, 5)
          .map(
            (c) =>
              `<div class="list-row"><div class="list-main"><strong>${esc(c.name)}</strong><small>${ageLabel(c.age)}</small></div><button class="text-btn pay-client" data-id="${c.id}">${money(c.balance)}</button></div>`,
          )
          .join("")
      : '<div class="empty">No hay clientes con deuda.</div>';
    const alerts = [];
    const threshold = Number(state.settings.maintenanceThreshold || 375);
    if (state.maintenance.count >= threshold)
      alerts.push(
        `Mantenimiento requerido: ${int(state.maintenance.count)} garrafones`,
      );
    else if (state.maintenance.count >= threshold * 0.85)
      alerts.push(
        `Mantenimiento próximo: ${int(state.maintenance.count)} / ${int(threshold)}`,
      );
    const old = debtors.filter((d) => d.age > 30).length;
    if (old) alerts.push(`${old} cliente(s) con deuda mayor a 30 días`);
    if (state.inventory.local <= 10) alerts.push("Inventario local bajo");
    state.supplies
      .filter(
        (s) =>
          s.active !== false &&
          Number(s.currentStock) <= Number(s.minimumStock),
      )
      .forEach((s) =>
        alerts.push(`Stock bajo: ${s.name} (${int(s.currentStock)} ${s.unit})`),
      );
    alerts.push(
      open
        ? "Caja del usuario activo abierta"
        : "Caja del usuario activo cerrada",
    );
    $("alertsList").innerHTML = alerts
      .map((a) => `<div class="list-row"><span>${a}</span></div>`)
      .join("");
    $("recentActivity").innerHTML = state.activity.length
      ? state.activity
          .slice(0, 7)
          .map(
            (a) =>
              `<div class="list-row"><div class="list-main"><strong>${esc(a.text)}</strong><small>${fmtDateTime(a.date)}</small></div></div>`,
          )
          .join("")
      : '<div class="empty">Aún no hay actividad.</div>';
    $("dashboardRounds").innerHTML = ["ruta1", "ruta2"]
      .map((route) => {
        const r = activeRound(route);
        if (!r)
          return `<div class="list-row"><span>${CHANNELS[route]}</span><strong>Sin ronda activa</strong></div>`;
        const metrics = roundMetrics(r);
        return `<div class="list-row"><div class="list-main"><strong>${CHANNELS[route]} · Ronda ${r.number}</strong><small>Carga ${int(metrics.initialLoad)} · Recargas ${int(metrics.reloads)} · Vendidos ${int(metrics.netSold)}</small>${metrics.inconsistencyQty ? `<small class="amount-danger">Ronda con inconsistencia: se vendieron ${int(metrics.inconsistencyQty)} más de los cargados</small>` : ""}</div><strong class="${metrics.inconsistencyQty ? "amount-danger" : ""}">${metrics.inconsistencyQty ? "Requiere ajuste" : `${int(metrics.availableFull)} restantes`}</strong></div>`;
      })
      .join("");
    $("dashboardLatestSales").innerHTML = latestSalesMarkup(5, false);
    $$(".pay-client").forEach((b) => {
      b.hidden = !can("register_payment");
      b.onclick = () => openPaymentDialog(b.dataset.id);
    });
  }

  function openClientDialog(client = null) {
    if (!requirePermission(client ? "edit_client" : "create_client")) return;
    $("clientForm").reset();
    $("clientDialogTitle").textContent = client
      ? "Editar cliente"
      : "Nuevo cliente";
    $("clientId").value = client?.id || "";
    $("clientName").value = client?.name || "";
    $("clientPhone").value = client?.phone || "";
    $("clientAddress").value = client?.address || "";
    $("clientRoute").value = client?.route || "ninguna";
    $("clientType").value = client?.type || "Hogar";
    $("clientPrice").value = client?.price ?? "";
    $("clientFrequent").value = String(client?.frequent ?? true);
    $("clientActive").value = String(client?.active !== false);
    $("clientNotes").value = client?.notes || "";
    updateClientDuplicateWarning("full");
    showManagedDialog($("clientDialog"));
  }
  async function saveClient(e) {
    e.preventDefault();
    const id = $("clientId").value;
    if (!requirePermission(id ? "edit_client" : "create_client")) return;
    const previousClient = id ? structuredClone(clientById(id)) : null,
      rawPrice = $("clientPrice").value.trim();
    const obj = {
      id: id || uid("cli"),
      name: $("clientName").value.trim(),
      phone: $("clientPhone").value.trim(),
      address: $("clientAddress").value.trim(),
      route: $("clientRoute").value,
      type: $("clientType").value,
      price: rawPrice === "" ? null : Number(rawPrice),
      frequent: $("clientFrequent").value === "true",
      active: $("clientActive").value === "true",
      notes: $("clientNotes").value.trim(),
      updatedAt: nowISO(),
      version: previousClient?.version || 1,
    };
    if (!obj.name) return toast("El nombre es obligatorio", "error");
    if (obj.price != null && obj.price < 0)
      return toast("El precio no puede ser negativo", "error");
    const duplicate = blockingClientDuplicate(obj);
    if (duplicate)
      return toast(
        `Ya existe “${duplicate.name}”. Usa Unir duplicados en Clientes.`,
        "error",
      );
    const previousState = structuredClone(state);
    if (id) {
      const i = state.clients.findIndex((c) => c.id === id);
      obj.createdAt = state.clients[i]?.createdAt || nowISO();
      state.clients[i] = obj;
      addActivity(`Cliente actualizado: ${obj.name}`);
      audit(
        "edit_client",
        "client",
        obj.id,
        `Cliente actualizado: ${obj.name}`,
        previousClient,
        obj,
      );
    } else {
      obj.createdAt = nowISO();
      state.clients.push(obj);
      addActivity(`Cliente creado: ${obj.name}`);
      audit(
        "create_client",
        "client",
        obj.id,
        `Cliente creado: ${obj.name}`,
        null,
        obj,
      );
    }
    if (!(await commitState(previousState))) return;
    $("clientDialog").close();
    renderAll();
    toast("Cliente guardado");
  }
  function openQuickClientDialog() {
    if (!requirePermission("create_client")) return;
    $("quickClientForm").reset();
    $("quickClientRoute").value = ["ruta1", "ruta2", "ventanilla"].includes(
      $("saleChannel").value,
    )
      ? $("saleChannel").value
      : "ninguna";
    $("quickClientPrice").value = "";
    quickClientFromSale = true;
    updateClientDuplicateWarning("quick");
    showManagedDialog($("quickClientDialog"));
  }
  async function saveQuickClient(e) {
    e.preventDefault();
    if (!requirePermission("create_client")) return;
    const name = $("quickClientName").value.trim(),
      phone = $("quickClientPhone").value.trim(),
      address = $("quickClientAddress").value.trim(),
      rawPrice = $("quickClientPrice").value.trim();
    if (!name) return toast("El nombre es obligatorio", "error");
    if (rawPrice !== "" && Number(rawPrice) < 0)
      return toast("El precio no puede ser negativo", "error");
    const duplicate = blockingClientDuplicate({ name, phone });
    if (duplicate)
      return toast(
        `Ya existe “${duplicate.name}”. Selecciónalo en lugar de crear otro.`,
        "error",
      );
    const previousState = structuredClone(state),
      client = {
        id: uid("cli"),
        name,
        phone,
        address,
        route: $("quickClientRoute").value,
        type: "Hogar",
        price: rawPrice === "" ? null : Number(rawPrice),
        frequent: true,
        active: true,
        notes: "Alta rápida desde venta",
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
    state.clients.push(client);
    addActivity(`Cliente creado: ${client.name}`);
    audit(
      "client_created_quick",
      "client",
      client.id,
      `Cliente rápido creado: ${client.name}`,
      null,
      client,
    );
    if (!(await commitState(previousState))) return;
    $("quickClientDialog").close();
    const savedClient = state.clients.find(
      (item) =>
        item.name === name && item.phone === phone && item.address === address,
    );
    if (savedClient) selectSaleClient(savedClient.id);
    renderClients();
    toast("Cliente guardado y seleccionado");
  }
  function openMergeClientsDialog(clientId) {
    if (!adminMode) return toast("Solo el Administrador puede unir clientes.", "error");
    const group = duplicateClientGroup(clientById(clientId));
    if (group.length < 2)
      return toast("Este cliente ya no tiene duplicados activos.", "error");
    pendingClientMergeIds = group.map((client) => client.id);
    $("mergeClientsError").textContent = "";
    $("mergeClientsOptions").innerHTML = group
      .map((client) => {
        const salesCount = state.sales.filter(
            (sale) => sale.clientId === client.id,
          ).length,
          balance = clientBalance(client.id);
        return `<label class="merge-client-option"><input type="radio" name="mergePrimaryClient" value="${client.id}" required><span><strong>${esc(client.name)}</strong><small>${esc(CHANNELS[client.route] || client.route || "Sin ruta")} · ${client.price == null ? "Precio general" : `Precio ${money(client.price)}`} · ${salesCount} venta(s) · Saldo ${money(balance)}</small></span></label>`;
      })
      .join("");
    showManagedDialog($("mergeClientsDialog"));
  }
  async function mergeDuplicateClients(event) {
    event.preventDefault();
    if (!adminMode) return;
    const selected = new FormData(event.currentTarget).get("mergePrimaryClient"),
      duplicateIds = pendingClientMergeIds.filter((id) => id !== selected),
      submit = $("mergeClientsSubmitBtn"),
      errorBox = $("mergeClientsError");
    if (!selected || !duplicateIds.length) {
      errorBox.textContent = "Selecciona el cliente que conservará sus datos.";
      return;
    }
    submit.disabled = true;
    submit.textContent = "Uniendo historial…";
    errorBox.textContent = "";
    try {
      if (!window.PurificadoraV3?.mergeClients)
        throw new Error("El comando para unir clientes todavía no está disponible.");
      await window.PurificadoraV3.mergeClients(selected, duplicateIds);
      pendingClientMergeIds = [];
      $("mergeClientsDialog").close();
      renderAll();
      toast("Clientes unidos. Ventas, pagos y fiado quedaron en una sola ficha.");
    } catch (error) {
      console.error(error);
      errorBox.textContent =
        error?.userMessage || error?.message || "No se pudieron unir los clientes.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Unir y conservar historial";
    }
  }
  function renderClients() {
    const q = $("clientSearch").value.trim().toLowerCase(),
      u = activeUser();
    const arr = state.clients
      .filter(
        (c) =>
          c.active !== false &&
          [c.name, c.phone, c.address].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q),
          ) &&
          (adminMode || u?.role !== "repartidor" || c.route === u.center),
      )
      .sort((a, b) => b.frequent - a.frequent || a.name.localeCompare(b.name));
    $("clientsTableBody").innerHTML = arr.length
      ? arr
          .map((c) => {
            const last = lastClientSale(c.id);
            const bal = clientBalance(c.id),
              canMerge = adminMode && duplicateClientGroup(c).length > 1;
            return `<tr><td><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || "Sin teléfono")}</small></td><td>${esc(CHANNELS[c.route] || c.route || "Ninguna")}</td><td>${money(expectedSalePrice(c))}${c.price != null ? "<br><small>Especial</small>" : ""}</td><td class="${bal > 0 ? "amount-danger" : ""}">${money(bal)}</td><td>Activo</td><td>${last ? `${fmtDate(last.date)} · ${last.qty} garrafón(es)` : "-"}</td><td><button class="text-btn client-detail" data-id="${c.id}">Ver</button> <button class="text-btn client-edit" data-id="${c.id}">Editar</button>${canMerge ? ` <button class="text-btn merge-clients" data-id="${c.id}">Unir duplicados</button>` : ""}</td></tr>`;
          })
          .join("")
      : '<tr><td colspan="7"><div class="empty">No hay clientes registrados.</div></td></tr>';
    $("clientsMobileList").innerHTML = arr.length
      ? `<div class="mobile-list-label">${q ? "Resultados" : "Sugerencias"}</div>${arr
          .slice(0, 20)
          .map((c) => {
            const balance = clientBalance(c.id),
              canMerge = adminMode && duplicateClientGroup(c).length > 1;
            return `<article class="mobile-client-card"><div class="mobile-client-main"><div><strong>${c.frequent ? "★ " : ""}${esc(c.name)}</strong><small>${esc(c.address || c.phone || "Sin datos adicionales")}</small></div><span class="client-balance ${balance > 0 ? "has-debt" : ""}">${balance > 0 ? `Debe ${money(balance)}` : "Sin deuda"}</span></div><div class="client-meta"><span>${esc(CHANNELS[c.route] || "Sin ruta")}</span><span>${c.price != null ? `Precio especial ${money(expectedSalePrice(c))}` : `Precio ${money(expectedSalePrice(c))}`}</span></div><div class="mobile-card-actions"><button class="secondary-btn client-sale" data-id="${c.id}">Vender</button>${balance > 0 && can("register_payment") ? `<button class="secondary-btn pay-client" data-id="${c.id}">Cobrar</button>` : ""}<button class="text-btn client-detail" data-id="${c.id}">Historial</button>${can("edit_client") ? `<button class="text-btn client-edit" data-id="${c.id}">Editar</button>` : ""}${canMerge ? `<button class="text-btn merge-clients" data-id="${c.id}">Unir duplicados</button>` : ""}</div></article>`;
          })
          .join("")}`
      : `<div class="empty mobile-empty-client">No encontramos “${esc($("clientSearch").value.trim())}”.<button class="primary-btn wide" id="createClientFromSearch" type="button">+ Crear cliente</button></div>`;
    const createFromSearch = $("createClientFromSearch");
    if (createFromSearch) {
      createFromSearch.hidden = !can("create_client");
      createFromSearch.onclick = () => {
        openClientDialog();
        $("clientName").value = $("clientSearch").value.trim();
        $("clientName").focus();
      };
    }
    $$(".client-sale").forEach(
      (button) => (button.onclick = () => beginSaleForClient(button.dataset.id)),
    );
    $$(".client-detail").forEach((b) => {
      b.hidden = !can("view_client_debt");
      b.onclick = () => openClientDetail(b.dataset.id);
    });
    $$("#clientsMobileList .pay-client").forEach(
      (button) =>
        (button.onclick = () => openPaymentDialog(button.dataset.id)),
    );
    $$(".client-edit").forEach((b) => {
      b.hidden = !can("edit_client");
      b.onclick = () => openClientDialog(clientById(b.dataset.id));
    });
    $$(".merge-clients").forEach(
      (button) =>
        (button.onclick = () => openMergeClientsDialog(button.dataset.id)),
    );
  }
  function renderSaleClientResults() {
    invalidateSaleClientSelection({ resetPrice: true });
    const q = $("saleClientSearch").value.trim().toLowerCase(),
      u = activeUser();
    if (!q) {
      $("saleClientResults").classList.add("hidden");
      $("saleClientSearch").setAttribute("aria-expanded", "false");
      updateSaleSummary();
      return;
    }
    const matches = state.clients
      .filter(
        (c) =>
          c.active !== false &&
          (adminMode || u?.role !== "repartidor" || c.route === u.center) &&
          [c.name, c.phone, c.address].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q),
          ),
      )
      .sort((a, b) => b.frequent - a.frequent || a.name.localeCompare(b.name))
      .slice(0, 8);
    $("saleClientResults").innerHTML = matches.length
      ? matches
          .map(
            (c) =>
              `<button type="button" class="client-result" data-client-id="${c.id}" role="option"><span><strong>${c.frequent ? "★ " : ""}${esc(c.name)}</strong><small>${esc(CHANNELS[c.route] || c.route)} · ${money(expectedSalePrice(c))} · ${esc(c.address || "Sin dirección")}</small></span><span class="${clientBalance(c.id) > 0 ? "debt" : ""}">Saldo ${money(clientBalance(c.id))}</span></button>`,
          )
          .join("")
      : '<div class="empty">Sin coincidencias. Usa “Registrar cliente nuevo”.</div>';
    $("saleClientResults").classList.remove("hidden");
    $("saleClientSearch").setAttribute("aria-expanded", "true");
    $$(".client-result").forEach(
      (b) => (b.onclick = () => selectSaleClient(b.dataset.clientId)),
    );
    updateSaleSummary();
  }
  function selectSaleClient(id) {
    const c = clientById(id);
    if (!c || !saleClientSelection.select(c)) return;
    $("saleClientId").value = saleClientSelection.clientId;
    $("saleClientSearch").value = c.name;
    $("salePrice").value = expectedSalePrice(c);
    if (["ruta1", "ruta2", "ventanilla"].includes(c.route))
      $("saleChannel").value = c.route;
    $("saleClientResults").classList.add("hidden");
    $("saleClientSearch").setAttribute("aria-expanded", "false");
    const last = lastClientSale(id);
    $("selectedSaleClient").innerHTML =
      `<strong>${c.frequent ? "★ " : ""}${esc(c.name)}</strong> · ${esc(CHANNELS[c.route] || c.route)} · Saldo ${money(clientBalance(id))}${last ? ` · Última compra ${last.qty}` : ""}<button type="button" id="clearSaleClient">Quitar</button>`;
    $("selectedSaleClient").classList.remove("hidden");
    $("clearSaleClient").onclick = clearSaleClient;
    updateSaleSummary();
  }
  function beginSaleForClient(
    id,
    { quantity = null, channel = null, paymentType = null } = {},
  ) {
    showView("ventas");
    if (id && clientById(id)) selectSaleClient(id);
    if (quantity) $("saleQty").value = Math.max(1, Number(quantity));
    if (channel) $("saleChannel").value = channel;
    if (paymentType) setSalePaymentType(paymentType);
    const client = clientById(id);
    applySaleContext({
      type: "client",
      clientId: client?.id || null,
      route: channel || client?.route || defaultSaleChannel(),
    });
    updateSaleSummary();
    $("saleQty").focus();
  }
  function beginSaleForRoute(route) {
    if (!["ruta1", "ruta2"].includes(route)) return showView("ventas");
    showView("ventas");
    $("saleChannel").value = route;
    applySaleContext({
      type: "route",
      route,
      roundId: activeRound(route)?.id || null,
    });
    updateSaleSummary();
  }
  function invalidateSaleClientSelection({
    clearSearch = false,
    resetPrice = false,
  } = {}) {
    const hadSelection = Boolean(saleClientSelection.clientId);
    saleClientSelection.clear();
    $("saleClientId").value = "";
    if (clearSearch) $("saleClientSearch").value = "";
    $("selectedSaleClient").innerHTML = "";
    $("selectedSaleClient").classList.add("hidden");
    if (resetPrice && hadSelection)
      $("salePrice").value = state.settings.defaultPrice;
  }
  function clearSaleClient() {
    invalidateSaleClientSelection({ clearSearch: true, resetPrice: true });
    updateSaleSummary();
  }
  function selectedSaleClient() {
    const hadSelection = Boolean(saleClientSelection.clientId);
    const client = saleClientSelection.resolve(state.clients);
    if (!client) {
      $("saleClientId").value = "";
      if (hadSelection) {
        $("selectedSaleClient").innerHTML = "";
        $("selectedSaleClient").classList.add("hidden");
        $("salePrice").value = state.settings.defaultPrice;
      }
    }
    return client;
  }
  function changeSaleQty(delta) {
    $("saleQty").value = Math.max(1, Number($("saleQty").value || 1) + delta);
    updateSaleSummary();
  }
  function setSalePaymentType(type) {
    $("salePaymentType").value = type;
    $$(".payment-option").forEach((b) =>
      b.classList.toggle("active", b.dataset.payment === type),
    );
    updateSaleSummary();
  }
  function setSaleChannel(channel) {
    $("saleChannel").value = channel;
    $$(".channel-option").forEach((b) =>
      b.classList.toggle("active", b.dataset.channel === channel),
    );
    updateSaleSummary();
  }
  function defaultSaleChannel() {
    const u = activeUser();
    return u?.role === "repartidor" ? u.center : "ventanilla";
  }
  function saleFormSnapshot() {
    const type = $("salePaymentType").value;
    return {
      clientId: saleClientSelection.clientId || null,
      qty: Number($("saleQty").value || 0),
      price: Number($("salePrice").value || 0),
      priceReason: $("salePriceReason").value.trim(),
      channel: $("saleChannel").value,
      paymentType: type,
      paid: type === "mixto" ? String($("salePaid").value || "").trim() : "",
      containerMode: $("saleContainerMode").value,
      emptyReturnQty: Number($("saleEmptyReturnQty").value || 0),
      damagedReturnQty: Number($("saleDamagedReturnQty").value || 0),
      notes: $("saleNotes").value.trim(),
    };
  }
  function captureSaleInitialState() {
    saleInitialSnapshot = JSON.stringify(saleFormSnapshot());
  }
  function isSaleFormDirty() {
    return saleInitialSnapshot !== JSON.stringify(saleFormSnapshot());
  }
  function captureSaleDraftForRefresh() {
    if (
      !["ventas", "ventanilla"].includes(currentView) ||
      !isSaleFormDirty()
    )
      return null;
    return {
      ...saleFormSnapshot(),
      search: $("saleClientSearch").value,
      baseline: saleInitialSnapshot,
      focusedId: document.activeElement?.id || "",
      context: saleContext ? { ...saleContext } : null,
    };
  }
  function restoreSaleDraftAfterRefresh(draft) {
    if (!draft) return;
    if (draft.clientId && clientById(draft.clientId))
      selectSaleClient(draft.clientId);
    else {
      invalidateSaleClientSelection();
      $("saleClientSearch").value = draft.search || "";
    }
    $("saleQty").value = draft.qty;
    $("salePrice").value = draft.price;
    $("salePriceReason").value = draft.priceReason || "";
    $("saleChannel").value = draft.channel;
    setSalePaymentType(draft.paymentType);
    $("salePaid").value = draft.paid;
    $("saleContainerMode").value = draft.containerMode || "normal";
    $("saleEmptyReturnQty").value = draft.emptyReturnQty || 0;
    $("saleDamagedReturnQty").value = draft.damagedReturnQty || 0;
    $("saleNotes").value = draft.notes;
    applySaleContext(draft.context);
    saleInitialSnapshot = draft.baseline;
    updateSaleSummary();
    const focused = draft.focusedId ? $(draft.focusedId) : null;
    focused?.focus();
  }
  function setSaleSubmitting(value) {
    isSaleSubmitting = value;
    const submit = $("saleSubmitBtn"),
      cancel = $("cancelSaleBtn");
    submit.disabled = value;
    cancel.disabled = value;
    submit.setAttribute("aria-busy", String(value));
    submit.textContent = value ? "Registrando…" : "Registrar venta";
  }
  function resetSaleForm() {
    $("saleForm").reset();
    saleClientSelection.clear();
    $("saleClientId").value = "";
    $("saleClientSearch").value = "";
    $("selectedSaleClient").innerHTML = "";
    $("selectedSaleClient").classList.add("hidden");
    $("saleClientResults").innerHTML = "";
    $("saleClientResults").classList.add("hidden");
    $("saleClientSearch").setAttribute("aria-expanded", "false");
    $("saleQty").value = 1;
    $("salePrice").value = state.settings.defaultPrice;
    $("salePriceReason").value = "";
    $("salePriceReasonWrap").classList.add("hidden");
    $("saleChannel").value = defaultSaleChannel();
    $("salePaid").value = 0;
    $("saleContainerMode").value = "normal";
    $("saleEmptyReturnQty").value = 0;
    $("saleDamagedReturnQty").value = 0;
    $("saleContainerException").open = false;
    $("saleNotes").value = "";
    applySaleContext(null);
    setSalePaymentType("efectivo");
    captureSaleInitialState();
  }

  function applySaleContext(context) {
    saleContext = context ? { ...context } : null;
    const form = $("saleForm"),
      banner = $("saleContextBanner");
    form.classList.toggle("contextual-sale", Boolean(saleContext));
    form.dataset.contextType = saleContext?.type || "";
    if (!saleContext) {
      banner.innerHTML = "";
      banner.classList.add("hidden");
      return;
    }
    const client = saleContext.clientId
        ? clientById(saleContext.clientId)
        : null,
      route = saleContext.route || client?.route || "",
      parts = [
        client?.name,
        route ? routeLabel(route) : "",
        client ? `Precio ${money(expectedSalePrice(client))}` : "",
      ].filter(Boolean);
    banner.innerHTML = `<div><span class="eyebrow">CONTEXTO APLICADO</span><strong>${parts.map(esc).join(" · ")}</strong></div><button type="button" class="text-btn" id="showAdvancedSale">Venta avanzada</button>`;
    banner.classList.remove("hidden");
    $("showAdvancedSale").onclick = () => applySaleContext(null);
  }
  function cancelSale() {
    if (isSaleSubmitting) return;
    if (isSaleFormDirty()) {
      if (!$("saleCancelDialog").open) $("saleCancelDialog").showModal();
      return;
    }
    confirmSaleCancellation();
  }
  function confirmSaleCancellation() {
    if (isSaleSubmitting) return;
    if ($("saleCancelDialog").open) $("saleCancelDialog").close();
    resetSaleForm();
    const destination =
      saleOriginView && saleOriginView !== "ventas" && canAccess(saleOriginView)
        ? saleOriginView
        : "dashboard";
    showView(destination);
  }
  function openClientDetail(id) {
    if (!requirePermission("view_client_debt")) return;
    const rawClient = clientById(id),
      c = rawClient
        ? { ...rawClient, price: expectedSalePrice(rawClient) }
        : null;
    if (!c) return;
    selectedClientId = id;
    const bal = clientBalance(id),
      last = lastClientSale(id);
    const month = monthKey(nowISO());
    const monthSales = state.sales.filter(
      (s) =>
        s.clientId === id && sameMonth(s.date, month) && isEffectiveSale(s),
    );
    const monthLedger = state.ledger.filter(
        (l) => l.clientId === id && sameMonth(l.date, month),
      ),
      digits = (c.phone || "").replace(/\D/g, ""),
      waNumber = digits.length === 10 ? `52${digits}` : digits,
      waText = encodeURIComponent(
        `Hola ${c.name}, tienes un saldo pendiente de ${money(bal)} con Purificadora Trujillo.`,
      );
    $("clientDetailContent").innerHTML =
      `<div class="detail-hero"><div><h2>${c.frequent ? "★ " : ""}${esc(c.name)}</h2><p>${esc(c.phone || "Sin teléfono")} · ${esc(c.address || "Sin dirección")}</p><p>${esc(CHANNELS[c.route] || "Sin ruta habitual")} · Precio ${money(c.price)} · ${c.frequent ? "Frecuente" : "Regular"}</p>${c.notes ? `<p class="muted">${esc(c.notes)}</p>` : ""}${last ? `<p>Última compra: <strong>${last.qty} garrafón(es) · ${fmtDate(last.date)}</strong></p>` : ""}</div><div><div class="muted">Saldo actual</div><div class="route-number ${bal > 0 ? "amount-danger" : "amount-success"}">${money(bal)}</div></div></div><div class="detail-actions"><button class="primary-btn" id="detailSaleBtn">Nueva venta</button>${last ? `<button class="primary-btn" id="detailRepeatBtn">Repetir ${last.qty}</button>` : ""}<button class="secondary-btn" id="detailPayBtn">Registrar pago</button><button class="secondary-btn" id="detailEditBtn">Editar</button>${waNumber.length >= 10 ? `<a class="secondary-btn" href="https://wa.me/${waNumber}?text=${waText}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div><div class="metric-grid" style="margin-top:16px">${metric("Garrafones mes", int(monthSales.reduce((a, s) => a + s.qty, 0)))}${metric("Compras mes", int(monthSales.length))}${metric("Fiado mes", money(monthSales.reduce((a, s) => a + s.credit, 0)))}${metric("Pagos mes", money(monthLedger.filter((l) => l.type === "payment").reduce((a, l) => a + l.payment, 0)))}</div><div class="ledger"><h3>Historial permanente</h3><div class="table-responsive"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Garrafones</th><th>Cargo</th><th>Pago</th><th>Saldo</th></tr></thead><tbody>${renderLedgerRows(id)}</tbody></table></div></div>`;
    const goSale = (qty = null) => {
      $("clientDetailDialog").close();
      beginSaleForClient(id, { quantity: qty });
    };
    $("detailSaleBtn").onclick = () => goSale();
    if ($("detailRepeatBtn"))
      $("detailRepeatBtn").onclick = () => goSale(last.qty);
    $("detailPayBtn").hidden = !can("register_payment");
    $("detailPayBtn").onclick = () => openPaymentDialog(id);
    $("detailEditBtn").hidden = !can("edit_client");
    $("detailEditBtn").onclick = () => openClientDialog(c);
    $("clientDetailDialog").showModal();
    $("detailEditBtn").onclick = () => openClientDialog(rawClient);
  }
  function renderLedgerRows(id) {
    let running = 0;
    const asc = state.ledger
      .filter((x) => x.clientId === id)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!asc.length)
      return '<tr><td colspan="6"><div class="empty">Sin movimientos.</div></td></tr>';
    const rows = asc
      .map((l) => {
        running += Number(l.charge || 0) - Number(l.payment || 0);
        return { ...l, running };
      })
      .reverse();
    return rows
      .map(
        (l) =>
          `<tr><td>${fmtDateTime(l.date)}</td><td>${esc(l.label)}</td><td>${l.qty || "-"}</td><td>${l.charge ? money(l.charge) : "-"}</td><td>${l.payment ? money(l.payment) : "-"}</td><td>${money(l.running)}</td></tr>`,
      )
      .join("");
  }

  function saleContainerEffect(qty = Number($("saleQty").value || 0)) {
    const mode = $("saleContainerMode").value;
    let emptyReturnQty = qty,
      damagedReturnQty = 0;
    if (mode === "none" || mode === "new") emptyReturnQty = 0;
    if (mode === "fewer" || mode === "more")
      emptyReturnQty = Number($("saleEmptyReturnQty").value || 0);
    if (mode === "damaged") {
      emptyReturnQty = 0;
      damagedReturnQty = Number($("saleDamagedReturnQty").value || 0);
    }
    return { mode, emptyReturnQty, damagedReturnQty };
  }
  function updateSaleContainerFields() {
    const qty = Math.max(0, Number($("saleQty").value || 0)),
      mode = $("saleContainerMode").value,
      customEmpty = mode === "fewer" || mode === "more",
      damaged = mode === "damaged";
    $("saleEmptyReturnWrap").classList.toggle("hidden", !customEmpty);
    $("saleDamagedReturnWrap").classList.toggle("hidden", !damaged);
    if (mode === "fewer" && Number($("saleEmptyReturnQty").value) >= qty)
      $("saleEmptyReturnQty").value = String(Math.max(0, qty - 1));
    if (mode === "more" && Number($("saleEmptyReturnQty").value) <= qty)
      $("saleEmptyReturnQty").value = String(qty + 1);
    if (damaged && Number($("saleDamagedReturnQty").value) <= 0)
      $("saleDamagedReturnQty").value = String(Math.max(1, qty));
    const effect = saleContainerEffect(qty),
      labels = {
        normal: "Intercambio normal 1:1",
        none: "Sin devolución",
        fewer: `${int(effect.emptyReturnQty)} vacío(s) recibidos`,
        more: `${int(effect.emptyReturnQty)} vacío(s) recibidos`,
        damaged: `${int(effect.damagedReturnQty)} dañado(s) recibidos`,
        new: "Envase adicional / nuevo",
      };
    $("saleContainerExchangeSummary").textContent = labels[mode];
  }
  function updateSaleSummary() {
    $$(".channel-option").forEach((b) =>
      b.classList.toggle(
        "active",
        b.dataset.channel === $("saleChannel").value,
      ),
    );
    const qty = Math.max(0, Number($("saleQty").value || 0)),
      price = Math.max(0, Number($("salePrice").value || 0)),
      total = qty * price,
      type = $("salePaymentType").value,
      c = selectedSaleClient(),
      expected = expectedSalePrice(c),
      exceptional = Math.abs(price - expected) > 0.009;
    $("salePriceReasonWrap").classList.toggle("hidden", !exceptional);
    if (!exceptional) $("salePriceReason").value = "";
    $("saleTotal").value = money(total);
    $("salePaidWrap").classList.toggle("hidden", type !== "mixto");
    if (type === "efectivo" || type === "transferencia")
      $("salePaid").value = total;
    if (type === "fiado") $("salePaid").value = 0;
    const paid =
      type === "mixto"
        ? Math.min(total, Math.max(0, Number($("salePaid").value || 0)))
        : type === "fiado"
          ? 0
          : total;
    const credit = Math.max(0, total - paid);
    updateSaleContainerFields();
    const containerEffect = saleContainerEffect(qty);
    $("saleSummary").innerHTML =
      `<strong>${qty} garrafón(es) · ${money(total)}</strong><br>Pagado: ${money(paid)} · Fiado: ${money(credit)}<br>Envases: ${int(containerEffect.emptyReturnQty)} vacío(s) · ${int(containerEffect.damagedReturnQty)} dañado(s)${exceptional ? `<br><span class="amount-danger">Precio esperado ${money(expected)}</span>` : ""}${c ? `<br>Cliente: ${esc(c.name)} · Saldo actual ${money(clientBalance(c.id))}${lastClientSale(c.id) ? `<br><button type="button" class="text-btn" id="repeatLastSale">Repetir ${lastClientSale(c.id).qty}</button>` : ""}` : `<br>Cliente: Público general`}`;
    const repeat = $("repeatLastSale");
    if (repeat)
      repeat.onclick = () => {
        $("saleQty").value = lastClientSale(c.id).qty;
        updateSaleSummary();
      };
    if (!isSaleSubmitting)
      $("saleSubmitBtn").textContent = saleContext
        ? `Registrar ${money(total)}`
        : "Registrar venta";
  }
  async function saveSale(e) {
    e.preventDefault();
    if (isSaleSubmitting) return;
    setSaleSubmitting(true);
    const fail = (message) => {
      setSaleSubmitting(false);
      if (message) toast(message, "error");
    };
    if (!requirePermission("create_sale")) return fail();
    const u = activeUser(),
      qty = Number($("saleQty").value),
      price = Number($("salePrice").value),
      total = qty * price,
      type = $("salePaymentType").value,
      client = selectedSaleClient(),
      expectedPrice = expectedSalePrice(client),
      priceReason = $("salePriceReason").value.trim(),
      containerEffect = saleContainerEffect(qty);
    if (!u) {
      fail();
      return openAccessChoice({ clearPending: true });
    }
    if (!Number.isInteger(qty) || qty <= 0 || price < 0)
      return fail("Revisa cantidad y precio");
    if (
      !Number.isInteger(containerEffect.emptyReturnQty) ||
      containerEffect.emptyReturnQty < 0 ||
      !Number.isInteger(containerEffect.damagedReturnQty) ||
      containerEffect.damagedReturnQty < 0
    )
      return fail("Revisa las cantidades de envases recibidos.");
    if (containerEffect.mode === "fewer" && containerEffect.emptyReturnQty >= qty)
      return fail("La devolución parcial debe ser menor que la venta.");
    if (containerEffect.mode === "more" && containerEffect.emptyReturnQty <= qty)
      return fail("Captura más vacíos que garrafones vendidos.");
    if (Math.abs(price - expectedPrice) > 0.009 && !can("override_sale_price"))
      return fail(`El precio autorizado es ${money(expectedPrice)}.`);
    if (Math.abs(price - expectedPrice) > 0.009 && !priceReason)
      return fail("Captura el motivo del precio especial.");
    if ((type === "fiado" || type === "mixto") && !client)
      return fail("El fiado requiere un cliente registrado");
    let paid =
      type === "fiado"
        ? 0
        : type === "mixto"
          ? Number($("salePaid").value || 0)
          : total;
    if (!Number.isFinite(paid) || paid < 0 || paid > total)
      return fail("El pago recibido no puede exceder el total");
    const credit = total - paid;
    if (
      credit > 0 &&
      !requirePermission("create_credit", "Tu rol no permite crear fiado.")
    )
      return fail();
    let channel = $("saleChannel").value;
    if (!adminMode && u.role === "repartidor") channel = u.center;
    if (!adminMode && u.role === "ventanilla") channel = "ventanilla";
    const round = activeRound(channel);
    if ((channel === "ruta1" || channel === "ruta2") && !round)
      return fail(
        `Inicia una ronda en ${CHANNELS[channel]} antes de registrar la venta.`,
      );
    if (round) {
      const metrics = roundMetrics(round);
      if (metrics.inconsistencyQty > 0)
        return fail(
          `Ronda con inconsistencia: se vendieron ${int(metrics.inconsistencyQty)} más de los cargados. Requiere ajuste administrativo.`,
        );
      if (qty > metrics.availableFull)
        return fail(
          `La ronda solo tiene ${int(metrics.availableFull)} garrafones llenos disponibles. Registra una recarga para continuar.`,
        );
    }
    const center = centerForChannel(channel),
      inventoryCheck = validateInventoryMovement(center, -qty);
    if (!inventoryCheck.valid)
      return fail(`Inventario insuficiente en ${inventoryLocationLabel(center)}`);
    const cashAmount =
        type === "efectivo" ? total : type === "mixto" ? paid : 0,
      cashCheck = requireOpenCashSession({
        method: cashAmount > 0 ? "efectivo" : type,
        amount: cashAmount,
      });
    if (cashCheck.required && !cashCheck.session) return fail();
    const previousState = structuredClone(state),
      date = nowISO(),
      cashSessionId = cashCheck.session?.id || null,
      sale = {
        id: uid("sale"),
        folio: nextFolio("sale", "V"),
        date,
        clientId: client?.id || null,
        clientName: client?.name || "Público general",
        channel,
        qty,
        price,
        unitPrice: price,
        total,
        paid,
        credit,
        paymentType: type,
        notes: $("saleNotes").value.trim(),
        priceReason: Math.abs(price - expectedPrice) > 0.009 ? priceReason : "",
        expectedPrice,
        userId: u.id,
        center,
        status: "active",
        cashSessionId,
        roundId: round?.id || null,
        containerMode: containerEffect.mode,
        emptyReturnQty: containerEffect.emptyReturnQty,
        damagedReturnQty: containerEffect.damagedReturnQty,
      },
      ledgerEntry = client
        ? {
            id: uid("led"),
            date,
            clientId: client.id,
            type:
              credit === total
                ? "sale_credit"
                : credit > 0
                  ? "sale_mixed"
                  : "sale_paid",
            label:
              credit === total
                ? `Venta fiada · ${CHANNELS[channel]}`
                : credit > 0
                  ? `Pago mixto · ${CHANNELS[channel]}`
                  : `Venta pagada · ${CHANNELS[channel]}`,
            qty,
            unitPrice: price,
            charge: total,
            payment: paid,
            method: type,
            notes: sale.notes,
            saleId: sale.id,
            channel,
            userId: u.id,
            cashSessionId,
          }
        : null;
    state.sales.push(sale);
    if (ledgerEntry) state.ledger.push(ledgerEntry);
    recordInventoryMovement(center, -qty, "venta", `Venta ${sale.id}`, null, {
      saleId: sale.id,
    });
    const emptyCenter =
      channel === "ruta1" || channel === "ruta2"
        ? `empty_${channel}`
        : "empty_local";
    if (sale.emptyReturnQty)
      recordInventoryMovement(
        emptyCenter,
        sale.emptyReturnQty,
        "sale_empty_received",
        `Intercambio de venta ${sale.id}`,
        null,
        { saleId: sale.id },
      );
    if (sale.damagedReturnQty)
      recordInventoryMovement(
        "danados",
        sale.damagedReturnQty,
        "sale_damaged_received",
        `Envase dañado de venta ${sale.id}`,
        null,
        { saleId: sale.id },
      );
    state.maintenance.count += qty;
    addActivity(
      `Venta: ${sale.clientName} · ${qty} garrafón(es) · ${money(total)}`,
      "sale",
    );
    audit(
      "sale",
      "sale",
      sale.id,
      `Venta ${sale.clientName}: ${qty} garrafones`,
      null,
      sale,
    );
    if (!(await commitState(previousState))) {
      setSaleSubmitting(false);
      return;
    }
    if (client) {
      const netContainers = qty - containerEffect.emptyReturnQty - containerEffect.damagedReturnQty;
      if (netContainers > 0) {
        client.containerDebt = (client.containerDebt || 0) + netContainers;
      }
    }
    resetSaleForm();
    renderAll();
    toast("Venta registrada correctamente");
    clearTimeout(saleReleaseTimer);
    saleReleaseTimer = setTimeout(() => setSaleSubmitting(false), 1200);
  }
  function scopedLatestSales(limit = 20) {
    const u = activeUser();
    return [...state.sales]
      .filter((s) => inCurrentWorkDay(s.date))
      .filter(
        (s) =>
          adminMode ||
          s.userId === u?.id ||
          (u?.role === "repartidor" && s.channel === u.center),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }
  function saleStatusLabel(s) {
    return s.status === "void"
      ? "ANULADA"
      : s.status === "superseded"
        ? "CORREGIDA"
        : Number(s.returnedQty || 0) >= Number(s.qty || 0)
          ? "DEVUELTA"
          : Number(s.returnedQty || 0) > 0
            ? "DEVOLUCIÓN PARCIAL"
            : "ACTIVA";
  }
  function saleAvailableToReturn(sale) {
    return Math.max(0, Number(sale?.qty || 0) - Number(sale?.returnedQty || 0));
  }
  function canReturnSale(sale) {
    return Boolean(sale && isEffectiveSale(sale) && saleAvailableToReturn(sale) > 0 && can("return_sale"));
  }
  function latestSalesMarkup(limit = 20, actions = true) {
    const arr = scopedLatestSales(limit);
    if (!arr.length) return '<div class="empty">Aún no hay ventas.</div>';
    let lastDayKey = null;
    return arr
      .map((s) => {
        const dayKey = new Date(s.date).toDateString();
        const divider =
          dayKey !== lastDayKey
            ? `<div class="sale-date-divider">${esc(relativeDayLabel(s.date))}</div>`
            : "";
        lastDayKey = dayKey;
        return `${divider}<div class="sale-card"><div class="list-main"><strong>${esc(s.folio || s.id)} · ${esc(s.clientName)} · ${int(s.qty)} garrafón(es)</strong><small>${fmtDateTime(s.date)} · ${CHANNELS[s.channel]} · ${esc(s.paymentType)} · ${esc(state.users.find((u) => u.id === s.userId)?.name || "")}</small><span class="status-tag ${s.status === "void" ? "void" : s.status === "superseded" ? "corrected" : ""}">${saleStatusLabel(s)}</span></div><div class="sale-card-actions"><strong>${money(Number(s.total || 0) - Number(s.returnedTotal || 0))}</strong>${actions ? `<button class="text-btn view-sale" data-id="${s.id}">Ver</button>${isEffectiveSale(s) && can("create_sale") ? `<button class="secondary-btn repeat-sale" data-id="${s.id}">Repetir</button>` : ""}${canReturnSale(s) ? `<button class="secondary-btn return-sale" data-id="${s.id}">Devolver</button>` : ""}${canCorrectSale(s) && !Number(s.returnedQty || 0) ? `<button class="secondary-btn correct-sale" data-id="${s.id}">Corregir</button>` : ""}` : ""}</div></div>`;
      })
      .join("");
  }
  function bindLatestSalesActions(root) {
    root
      .querySelectorAll(".view-sale")
      .forEach((b) => (b.onclick = () => openSaleDetail(b.dataset.id)));
    root
      .querySelectorAll(".correct-sale")
      .forEach((b) => (b.onclick = () => openSaleCorrection(b.dataset.id)));
    root
      .querySelectorAll(".return-sale")
      .forEach((b) => (b.onclick = () => returnSale(b.dataset.id)));
    root.querySelectorAll(".repeat-sale").forEach((button) => {
      button.onclick = () => {
        const sale = state.sales.find((item) => item.id === button.dataset.id);
        if (!sale) return;
        beginSaleForClient(sale.clientId, {
          quantity: sale.qty,
          channel: sale.channel,
          paymentType: sale.paymentType,
        });
      };
    });
  }
  function renderLatestSales() {
    $("latestSales").innerHTML = latestSalesMarkup(10, true);
    bindLatestSalesActions($("latestSales"));
  }
  function renderAllLatestSales() {
    $("allLatestSales").innerHTML = latestSalesMarkup(20, true);
    bindLatestSalesActions($("allLatestSales"));
  }
  function openSaleDetail(id) {
    const s = state.sales.find((x) => x.id === id);
    if (!s) return;
    const correction = state.saleCorrections.find(
      (c) => c.originalSaleId === s.id || c.newSaleId === s.id,
    );
    $("saleDetailContent").innerHTML =
      `<div class="detail-hero"><div><span class="status-tag ${s.status === "void" ? "void" : s.status === "superseded" ? "corrected" : ""}">${saleStatusLabel(s)}</span><h2>${esc(s.folio || s.id)}</h2><p>${fmtDateTime(s.date)} · ${esc(s.clientName)} · ${CHANNELS[s.channel]}</p></div><div><div class="muted">Total</div><div class="route-number">${money(s.total)}</div></div></div><div class="cash-summary-grid">${[
        "Cantidad|" + int(s.qty),
        "Precio|" + money(s.unitPrice ?? s.price),
        "Pago|" + s.paymentType,
        "Pagado|" + money(s.paid),
        "Fiado|" + money(s.credit),
        "Usuario|" + (state.users.find((u) => u.id === s.userId)?.name || "-"),
      ]
        .map((v) => {
          const [a, b] = v.split("|");
          return `<div class="cash-summary-item">${esc(a)}<strong>${esc(b)}</strong></div>`;
        })
        .join(
          "",
        )}</div>${s.notes ? `<p><strong>Notas:</strong> ${esc(s.notes)}</p>` : ""}${correction ? `<div class="info-box">Corrección ${esc(correction.folio)} · ${esc(correction.reason)}</div>` : ""}`;
    showManagedDialog($("saleDetailDialog"));
  }
  function returnSale(id) {
    if (!requirePermission("return_sale")) return;
    const sale = state.sales.find((item) => item.id === id);
    const available = saleAvailableToReturn(sale);
    if (!sale || !isEffectiveSale(sale) || available <= 0)
      return toast("Esta venta ya no tiene garrafones disponibles para devolver.", "error");
    $("saleReturnForm").reset();
    $("returnSaleId").value = sale.id;
    $("returnSaleQty").max = available;
    $("returnSaleQty").value = available;
    $("returnSaleSummary").innerHTML = `<strong>${esc(sale.folio || sale.id)}</strong> · ${esc(sale.clientName)}<br>Vendidos: ${int(sale.qty)} · Ya devueltos: ${int(sale.returnedQty || 0)} · Disponibles: <strong>${int(available)}</strong>`;
    updateSaleReturnAmounts();
    showManagedDialog($("saleReturnDialog"));
  }
  function proportionalReturnAmounts(sale, quantity) {
    const cumulative = Number(sale.returnedQty || 0) + quantity;
    const creditTarget = Math.round(Number(sale.credit || 0) * 100 * cumulative / Number(sale.qty || 1)) / 100;
    const credit = Math.max(0, creditTarget - Number(sale.returnedCredit || 0));
    const total = quantity * Number(sale.unitPrice ?? sale.price);
    return { total, credit, refund: Math.max(0, total - credit) };
  }
  function updateSaleReturnAmounts() {
    const sale = state.sales.find((item) => item.id === $("returnSaleId").value);
    if (!sale) return;
    const qty = Math.max(0, Number($("returnSaleQty").value || 0));
    const amounts = proportionalReturnAmounts(sale, qty);
    const method = amounts.refund > 0 ? (sale.paymentType === "transferencia" ? "transferencia" : "efectivo") : "sin reembolso";
    $("returnSaleAmounts").innerHTML = `Importe devuelto: <strong>${money(amounts.total)}</strong><br>Reembolso: ${money(amounts.refund)} (${esc(method)}) · Reversa de fiado: ${money(amounts.credit)}`;
  }
  async function saveSaleReturn(event) {
    event.preventDefault();
    if (!requirePermission("return_sale")) return;
    const sale = state.sales.find((item) => item.id === $("returnSaleId").value);
    const qty = Number($("returnSaleQty").value);
    const reason = $("returnSaleReason").value.trim();
    if (!sale || !Number.isInteger(qty) || qty < 1 || qty > saleAvailableToReturn(sale))
      return toast("La cantidad de devolución no es válida.", "error");
    if (!reason) return toast("El motivo es obligatorio.", "error");
    const amounts = proportionalReturnAmounts(sale, qty);
    const refundMethod = amounts.refund > 0 ? (sale.paymentType === "transferencia" ? "transferencia" : "efectivo") : "sin_reembolso";
    const cashCheck = requireOpenCashSession({ method: refundMethod, amount: amounts.refund });
    if (cashCheck.required && !cashCheck.session) return;
    const previousState = structuredClone(state);
    state.returns.push({
      id: uid("ret"), date: nowISO(), saleId: sale.id, clientId: sale.clientId,
      qty, total: amounts.total, refundAmount: amounts.refund,
      cashRefund: refundMethod === "efectivo" ? amounts.refund : 0,
      creditReversal: amounts.credit, refundMethod, reason,
      userId: activeUser().id, center: sale.center,
      cashSessionId: cashCheck.session?.id || null,
    });
    if (!(await commitState(previousState))) return;
    $("saleReturnDialog").close();
    renderAll();
    toast("Devolución registrada correctamente");
  }

  function openSaleCorrection(id) {
    const sale = state.sales.find((s) => s.id === id);
    if (!canCorrectSale(sale))
      return toast(
        "Esta venta ya no está en la ventana de corrección rápida. Requiere administrador.",
        "error",
      );
    if (sale.clientId && sale.credit > clientBalance(sale.clientId) + 0.001)
      return toast(
        "Esta venta tiene abonos posteriores y no puede corregirse automáticamente.",
        "error",
      );
    $("saleCorrectionForm").reset();
    $("correctionSaleId").value = sale.id;
    $("correctionOriginalSummary").innerHTML =
      `<strong>${esc(sale.folio || sale.id)}</strong> · ${fmtDateTime(sale.date)}<br>${esc(sale.clientName)} · ${int(sale.qty)} × ${money(sale.unitPrice ?? sale.price)} = ${money(sale.total)}<br>${esc(sale.paymentType)} · ${CHANNELS[sale.channel]}`;
    $("correctionClient").innerHTML =
      `<option value="">Público general</option>` +
      state.clients
        .filter((c) => c.active !== false)
        .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
        .join("");
    $("correctionClient").value = sale.clientId || "";
    $("correctionQty").value = sale.qty;
    $("correctionPrice").value = sale.unitPrice ?? sale.price;
    $("correctionPaymentType").value = sale.paymentType;
    $("correctionPaid").value = sale.paid;
    $("correctionChannel").value = sale.channel;
    $("correctionNotes").value = sale.notes || "";
    $("correctionReason").value = "";
    $("voidSaleBtn").classList.toggle(
      "hidden",
      !(adminMode && can("void_sale")),
    );
    showManagedDialog($("saleCorrectionDialog"));
  }
  function updateCorrectionPaid() {
    const type = $("correctionPaymentType").value,
      total =
        Number($("correctionQty").value || 0) *
        Number($("correctionPrice").value || 0);
    if (type === "efectivo" || type === "transferencia")
      $("correctionPaid").value = total;
    if (type === "fiado") $("correctionPaid").value = 0;
  }
  function correctionCashPlan(original, newCash, reason) {
    const originalSession = original.cashSessionId
        ? state.cashSessions.find((s) => s.id === original.cashSessionId)
        : null,
      oldCash = saleCashAmount(original),
      delta = newCash - oldCash;
    if (originalSession?.closedAt) {
      if (!(adminMode && activeUser()?.role === "administrador")) {
        toast(
          "La caja de esta venta ya está cerrada. Requiere administrador.",
          "error",
        );
        return null;
      }
      const current =
        Math.abs(delta) > 0.009 ? getOpenCashSession(activeUser()?.id) : null;
      if (Math.abs(delta) > 0.009 && !current) {
        requireOpenCashSession({ method: "efectivo", amount: Math.abs(delta) });
        return null;
      }
      return {
        cashSessionId: null,
        cashAccounting: "adjustment_only",
        adjustment:
          Math.abs(delta) > 0.009
            ? {
                id: uid("cashadj"),
                date: nowISO(),
                saleId: original.id,
                cashSessionId: originalSession.id,
                appliedCashSessionId: current.id,
                amount: delta,
                reason,
                userId: activeUser().id,
              }
            : null,
      };
    }
    if (
      originalSession &&
      !originalSession.closedAt &&
      originalSession.userId !== activeUser()?.id
    ) {
      toast(
        "La venta pertenece a la caja abierta de otro empleado. Debe corregirla ese empleado.",
        "error",
      );
      return null;
    }
    const current = newCash > 0 ? getOpenCashSession(activeUser()?.id) : null;
    if (newCash > 0 && !current) {
      requireOpenCashSession({ method: "efectivo", amount: newCash });
      return null;
    }
    return {
      cashSessionId: current?.id || null,
      cashAccounting: "normal",
      adjustment: null,
    };
  }
  function reverseSaleDebt(sale, date, reason, correctionId) {
    if (!sale.clientId || Number(sale.credit || 0) <= 0) return;
    state.ledger.push({
      id: uid("led"),
      date,
      clientId: sale.clientId,
      type: "sale_correction_reversal",
      label: `Reversa ${sale.folio || "venta"} · ${reason}`,
      qty: -sale.qty,
      charge: 0,
      payment: sale.credit,
      method: "corrección",
      notes: reason,
      saleId: sale.id,
      correctionId,
      userId: activeUser().id,
      cashSessionId: null,
    });
  }
  function saleLedgerFor(sale) {
    if (!sale.clientId) return null;
    return {
      id: uid("led"),
      date: sale.date,
      clientId: sale.clientId,
      type:
        sale.credit === sale.total
          ? "sale_credit"
          : sale.credit > 0
            ? "sale_mixed"
            : "sale_paid",
      label: `Venta corregida · ${sale.folio}`,
      qty: sale.qty,
      unitPrice: sale.unitPrice,
      charge: sale.total,
      payment: sale.paid,
      method: sale.paymentType,
      notes: sale.notes,
      saleId: sale.id,
      correctionId: sale.correctionId,
      channel: sale.channel,
      userId: sale.userId,
      cashSessionId: sale.cashSessionId,
    };
  }
  async function saveSaleCorrection(e) {
    e.preventDefault();
    const original = state.sales.find(
      (s) => s.id === $("correctionSaleId").value,
    );
    if (!canCorrectSale(original))
      return toast("Ya no tienes permiso para corregir esta venta.", "error");
    const reason = $("correctionReason").value.trim(),
      qty = Number($("correctionQty").value),
      price = Number($("correctionPrice").value),
      type = $("correctionPaymentType").value,
      client = clientById($("correctionClient").value),
      channel = $("correctionChannel").value,
      total = qty * price,
      paid =
        type === "fiado"
          ? 0
          : type === "mixto"
            ? Number($("correctionPaid").value)
            : total,
      credit = total - paid;
    if (!reason)
      return toast("El motivo de corrección es obligatorio.", "error");
    if (
      !Number.isInteger(qty) ||
      qty <= 0 ||
      price < 0 ||
      !Number.isFinite(paid) ||
      paid < 0 ||
      paid > total
    )
      return toast("Revisa cantidad, precio y pago.", "error");
    if (credit > 0 && !client)
      return toast("El fiado requiere un cliente registrado.", "error");
    if (credit > 0 && !client.phone && !client.address)
      return toast("El cliente fiado requiere teléfono o dirección.", "error");
    const newCenter = centerForChannel(channel),
      available =
        Number(state.inventory[newCenter] || 0) +
        (newCenter === original.center ? Number(original.qty) : 0);
    if (available < qty)
      return toast(
        `Inventario insuficiente en ${inventoryLocationLabel(newCenter)}.`,
        "error",
      );
    const newCash = type === "efectivo" ? total : type === "mixto" ? paid : 0,
      cashPlan = correctionCashPlan(original, newCash, reason);
    if (!cashPlan) return;
    const previousState = structuredClone(state),
      date = nowISO(),
      correction = {
        id: uid("corr"),
        folio: nextFolio("correction", "C"),
        date,
        originalSaleId: original.id,
        newSaleId: null,
        reason,
        userId: activeUser().id,
        before: structuredClone(original),
      };
    const beforeOriginal = structuredClone(original);
    original.status = "superseded";
    original.correctedAt = date;
    original.correctionId = correction.id;
    recordInventoryMovement(
      original.center,
      original.qty,
      "corrección_reversa",
      `Reversa ${original.folio}`,
      null,
      { saleId: original.id, correctionId: correction.id },
    );
    recordInventoryMovement(
      newCenter,
      -qty,
      "venta_corregida",
      `Corrección ${correction.folio}`,
      null,
      { correctionId: correction.id },
    );
    state.maintenance.count = Math.max(
      0,
      Number(state.maintenance.count || 0) - Number(original.qty) + qty,
    );
    reverseSaleDebt(original, date, reason, correction.id);
    const newSale = {
      id: uid("sale"),
      folio: nextFolio("sale", "V"),
      date,
      clientId: client?.id || null,
      clientName: client?.name || "Público general",
      channel,
      qty,
      price,
      unitPrice: price,
      total,
      paid,
      credit,
      paymentType: type,
      notes: $("correctionNotes").value.trim(),
      userId: activeUser().id,
      center: newCenter,
      status: "active",
      cashSessionId: cashPlan.cashSessionId,
      cashAccounting: cashPlan.cashAccounting,
      roundId:
        channel === original.channel
          ? original.roundId
          : activeRound(channel)?.id || null,
      originalSaleId: original.id,
      correctionId: correction.id,
    };
    state.sales.push(newSale);
    const ledger = saleLedgerFor(newSale);
    if (ledger) state.ledger.push(ledger);
    correction.newSaleId = newSale.id;
    correction.after = structuredClone(newSale);
    state.saleCorrections.push(correction);
    if (cashPlan.adjustment)
      state.cashAdjustments.push({
        ...cashPlan.adjustment,
        correctionId: correction.id,
      });
    addActivity(`Venta corregida: ${original.folio} → ${newSale.folio}`);
    audit("sale_corrected", "sale", original.id, reason, beforeOriginal, {
      original,
      newSale,
      correction,
    });
    if (!(await commitState(previousState))) return;
    $("saleCorrectionDialog").close();
    renderAll();
    toast(`Venta corregida: ${newSale.folio}`);
  }
  async function voidSaleFromCorrection() {
    const sale = state.sales.find((s) => s.id === $("correctionSaleId").value),
      reason = $("correctionReason").value.trim();
    if (!(adminMode && requirePermission("void_sale"))) return;
    if (!sale || !isEffectiveSale(sale)) return;
    if (!reason)
      return toast("El motivo de anulación es obligatorio.", "error");
    if (sale.clientId && sale.credit > clientBalance(sale.clientId) + 0.001)
      return toast(
        "La venta tiene abonos posteriores y no puede anularse automáticamente.",
        "error",
      );
    const cashPlan = correctionCashPlan(sale, 0, reason);
    if (!cashPlan) return;
    const previousState = structuredClone(state),
      before = structuredClone(sale),
      date = nowISO(),
      correction = {
        id: uid("corr"),
        folio: nextFolio("correction", "C"),
        date,
        originalSaleId: sale.id,
        newSaleId: null,
        reason,
        userId: activeUser().id,
        type: "void",
        before,
      };
    sale.status = "void";
    sale.voidedAt = date;
    sale.voidReason = reason;
    sale.correctionId = correction.id;
    recordInventoryMovement(
      sale.center,
      sale.qty,
      "anulación_venta",
      `Anulación ${sale.folio}`,
      null,
      { saleId: sale.id, correctionId: correction.id },
    );
    state.maintenance.count = Math.max(
      0,
      Number(state.maintenance.count || 0) - Number(sale.qty),
    );
    reverseSaleDebt(sale, date, reason, correction.id);
    state.saleCorrections.push(correction);
    if (cashPlan.adjustment)
      state.cashAdjustments.push({
        ...cashPlan.adjustment,
        correctionId: correction.id,
      });
    addActivity(`Venta anulada: ${sale.folio}`);
    audit("sale_voided", "sale", sale.id, reason, before, sale);
    if (!(await commitState(previousState))) return;
    if ($("saleVoidConfirmDialog").open) $("saleVoidConfirmDialog").close();
    $("saleCorrectionDialog").close();
    renderAll();
    toast(`Venta ${sale.folio} anulada`);
  }
  function openVoidSaleConfirmation() {
    const sale = state.sales.find((s) => s.id === $("correctionSaleId").value);
    const reason = $("correctionReason").value.trim();
    if (!(adminMode && requirePermission("void_sale"))) return;
    if (!sale || !isEffectiveSale(sale)) return;
    if (!reason) return toast("Escribe primero el motivo de anulación.", "error");
    $("saleVoidSummary").innerHTML = `<strong>${esc(sale.folio || sale.id)}</strong> · ${esc(sale.clientName)}<br>${int(saleAvailableToReturn(sale))} garrafón(es) pendientes · ${money(Number(sale.total || 0) - Number(sale.returnedTotal || 0))}<br>Motivo: ${esc(reason)}`;
    showManagedDialog($("saleVoidConfirmDialog"));
  }
  async function confirmVoidSale(event) {
    event.preventDefault();
    if (!(await requestAdminReauth("anular esta venta"))) return;
    await voidSaleFromCorrection();
  }

  function openPaymentDialog(id) {
    if (!requirePermission("register_payment")) return;
    const c = clientById(id);
    if (!c) return;
    const bal = clientBalance(id);
    if (bal <= 0)
      return toast("Este cliente no tiene saldo pendiente.", "error");
    $("paymentForm").reset();
    $("paymentClientId").value = id;
    $("paymentAmount").value = bal;
    $("paymentDialog").dataset.balance = String(bal);
    $("paymentClientSummary").innerHTML =
      `<strong>${esc(c.name)}</strong><br>Saldo pendiente: <span class="amount-danger">${money(bal)}</span><br>${ageLabel(debtAgeDays(id))}`;
    $("paymentDialog").showModal();
  }
  async function savePayment(e) {
    e.preventDefault();
    if (!requirePermission("register_payment")) return;
    const id = $("paymentClientId").value,
      amount = Number($("paymentAmount").value),
      bal = clientBalance(id),
      c = clientById(id),
      method = $("paymentMethod").value;
    if (!c || amount <= 0)
      return toast("El monto debe ser mayor a cero", "error");
    if (amount > bal + 0.001)
      return toast("El pago no puede exceder el saldo pendiente", "error");
    const cashCheck = requireOpenCashSession({ method, amount });
    if (cashCheck.required && !cashCheck.session) return;
    const previousState = structuredClone(state),
      entry = {
        id: uid("led"),
        folio: nextFolio("payment", "P"),
        date: nowISO(),
        clientId: id,
        type: "payment",
        label: "Pago / abono",
        qty: 0,
        charge: 0,
        payment: amount,
        method,
        notes: $("paymentNotes").value.trim(),
        userId: activeUser()?.id,
        cashSessionId: cashCheck.session?.id || null,
      };
    state.ledger.push(entry);
    addActivity(`Pago de fiado: ${c.name} · ${money(amount)}`, "payment");
    audit(
      "payment",
      "client",
      id,
      `Pago ${entry.folio} de ${money(amount)} de ${c.name}`,
      { balance: bal },
      { balance: bal - amount, entry },
    );
    if (!(await commitState(previousState))) return;
    $("paymentDialog").close();
    renderAll();
    if ($("clientDetailDialog").open) openClientDetail(id);
    toast(`Pago registrado: ${entry.folio}`);
  }
  function renderDebt() {
    const u = activeUser(),
      all = state.clients
        .map((c) => ({
          ...c,
          balance: clientBalance(c.id),
          age: debtAgeDays(c.id),
          last: lastClientMovement(c.id),
        }))
        .filter((c) => c.balance > 0.009 && clientInDebtScope(c, u))
        .sort((a, b) => b.balance - a.balance),
      arr = all.filter(
        (c) =>
          debtFilter === "all" ||
          (debtFilter === "7" && c.age <= 7) ||
          (debtFilter === "15" && c.age > 7 && c.age <= 15) ||
          (debtFilter === "30" && c.age > 30),
      ),
      total = all.reduce((a, c) => a + c.balance, 0);
    $("debtMetrics").innerHTML = [
      metric("Total pendiente", money(total), `${all.length} cliente(s)`),
      metric(
        "0-7 días",
        money(all.filter((c) => c.age <= 7).reduce((a, c) => a + c.balance, 0)),
      ),
      metric(
        "8-15 días",
        money(
          all
            .filter((c) => c.age > 7 && c.age <= 15)
            .reduce((a, c) => a + c.balance, 0),
        ),
      ),
      metric(
        "16-30 días",
        money(
          all
            .filter((c) => c.age > 15 && c.age <= 30)
            .reduce((a, c) => a + c.balance, 0),
        ),
      ),
      metric(
        "+30 días",
        money(all.filter((c) => c.age > 30).reduce((a, c) => a + c.balance, 0)),
      ),
    ].join("");
    $("debtTableBody").innerHTML = arr.length
      ? arr
          .map(
            (c) =>
              `<tr><td><strong>${c.frequent ? "★ " : ""}${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || "")}</small></td><td class="amount-danger">${money(c.balance)}</td><td>${ageLabel(c.age)}</td><td>${c.last ? fmtDateTime(c.last.date) : "-"}</td><td><button class="primary-btn pay-client" data-id="${c.id}">Cobrar</button> <button class="text-btn detail-client" data-id="${c.id}">Historial</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="5"><div class="empty">No hay clientes en este filtro.</div></td></tr>';
    $$(".pay-client").forEach((b) => {
      b.hidden = !can("register_payment");
      b.onclick = () => openPaymentDialog(b.dataset.id);
    });
    $$(".detail-client").forEach(
      (b) => (b.onclick = () => openClientDetail(b.dataset.id)),
    );
  }
  function renderContainerDebt() {
    const u = activeUser(),
      arr = state.clients
        .filter(
          (c) => Number(c.containerDebt || 0) > 0 && clientInDebtScope(c, u),
        )
        .sort((a, b) => Number(b.containerDebt) - Number(a.containerDebt)),
      total = arr.reduce((a, c) => a + Number(c.containerDebt || 0), 0);
    $("containerDebtMetrics").innerHTML = [
      metric(
        "Envases pendientes",
        int(total),
        `${arr.length} cliente(s)`,
      ),
    ].join("");
    $("containerDebtTableBody").innerHTML = arr.length
      ? arr
          .map(
            (c) =>
              `<tr><td><strong>${c.frequent ? "★ " : ""}${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || "")}</small></td><td class="amount-danger">${int(c.containerDebt)}</td><td>${esc(CHANNELS[c.route] || c.route || "-")}</td><td><button class="primary-btn return-containers" data-id="${c.id}">Registrar entrega</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="4"><div class="empty">Nadie debe envases por ahora.</div></td></tr>';
    $$(".return-containers").forEach((b) => {
      b.hidden = !can("view_client_debt");
      b.onclick = () => openContainerReturnDialog(b.dataset.id);
    });
  }
  function openContainerReturnDialog(id) {
    if (!requirePermission("view_client_debt")) return;
    const c = clientById(id);
    if (!c) return;
    const debt = Number(c.containerDebt || 0);
    if (debt <= 0)
      return toast("Este cliente no tiene envases pendientes.", "error");
    $("containerReturnForm").reset();
    $("containerReturnClientId").value = id;
    $("containerReturnQty").value = debt;
    $("containerReturnQty").max = String(debt);
    $("containerReturnLocation").value =
      c.route === "ruta1" || c.route === "ruta2" ? c.route : "local";
    $("containerReturnClientSummary").innerHTML =
      `<strong>${esc(c.name)}</strong><br>Debe: <span class="amount-danger">${int(debt)} garrafón(es)</span>`;
    showManagedDialog($("containerReturnDialog"));
  }
  async function saveContainerReturn(e) {
    e.preventDefault();
    if (!requirePermission("view_client_debt")) return;
    const id = $("containerReturnClientId").value,
      c = clientById(id),
      qty = Number($("containerReturnQty").value),
      location = $("containerReturnLocation").value,
      notes = $("containerReturnNotes").value.trim();
    if (!c) return;
    if (!Number.isInteger(qty) || qty <= 0)
      return toast("Captura una cantidad válida.", "error");
    const previousState = structuredClone(state),
      before = Number(c.containerDebt || 0),
      applied = Math.min(qty, Math.max(before, 0));
    recordInventoryMovement(
      `empty_${location}`,
      qty,
      "client_container_return",
      notes || "Entrega de envases",
      "client",
      { clientId: id },
    );
    c.containerDebt = Math.max(before - applied, 0);
    c.lastContainerReturnQty = qty;
    c.lastContainerReturnLocation = location;
    c.lastContainerReturnNotes = notes;
    audit(
      "client_containers_returned",
      "client",
      id,
      notes || "Entrega de envases",
      { containerDebt: before },
      { containerDebt: c.containerDebt, received: qty },
    );
    addActivity(
      `${c.name}: entregó ${qty} garrafón(es) vacío(s) · ${CHANNELS[location] || "Local"}`,
    );
    if (!(await commitState(previousState))) return;
    $("containerReturnDialog").close();
    renderAll();
    toast("Entrega de envases registrada");
  }

  function renderRoutes() {
    const u = activeUser(),
      ownRoute = !adminMode && u?.role === "repartidor";
    const routeScope = ownRoute ? [u.center] : ["ruta1", "ruta2"];
    const cashOpen = Boolean(getOpenCashSession(u?.id));
    $("routeStatusHeader").innerHTML = routeScope
      .map((route) => {
        const round = activeRound(route);
        const metrics = round ? roundMetrics(round) : null;
        const trackerStep = round ? (round.status === "regresada" ? 2 : 1) : 0;
        const trackerStepHtml = (index, label) =>
          `<div class="route-progress-step${trackerStep >= index ? " is-done" : ""}${trackerStep === index ? " is-current" : ""}"><span class="step-dot"></span><span class="step-label">${label}</span></div>`;
        const trackerLineHtml = (index) =>
          `<div class="route-progress-line${trackerStep >= index ? " is-done" : ""}"></div>`;
        const routeTrackerHtml = `<div class="route-progress-track">${trackerStepHtml(0, "Preparando")}${trackerLineHtml(1)}${trackerStepHtml(1, "En ruta")}${trackerLineHtml(2)}${trackerStepHtml(2, "Regreso")}</div>`;
        return `<section class="route-ops-header"><div class="route-ops-title"><div><span class="eyebrow">${esc(CHANNELS[route])}</span><h2>${round ? `Ronda ${int(round.number)}` : "Sin ronda activa"}</h2></div><span class="route-state ${round ? "is-active" : ""}">${round ? round.status === "regresada" ? "Regreso registrado" : "En ruta" : "Sin iniciar"}</span></div>${routeTrackerHtml}<div class="route-ops-metrics"><div><small>Llenos</small><strong class="${metrics?.inconsistencyQty ? "amount-danger" : ""}${!round && can("adjust_inventory") ? " route-stock-inline-edit" : ""}" ${!round && can("adjust_inventory") ? `data-inventory-quick="adjust" data-location="${route}" role="button" tabindex="0" title="Toca para corregir existencias"` : ""}>${metrics ? int(metrics.availableFull) : int(state.inventory[route] || 0)}</strong></div><div><small>Vacíos</small><strong class="${can("adjust_inventory") ? "route-stock-inline-edit" : ""}" ${can("adjust_inventory") ? `data-inventory-quick="adjust" data-location="empty_${route}" role="button" tabindex="0" title="Toca para corregir existencias"` : ""}>${int(state.inventory[`empty_${route}`] || 0)}</strong></div><div><small>Caja</small><strong>${cashOpen ? "Abierta" : "Cerrada"}</strong></div><div><small>Datos</small><strong>${state.central ? "Sincronizados" : "Pendientes"}</strong></div></div>${round ? `<button class="primary-btn wide" data-go="ventas" data-channel="${route}" ${metrics?.inconsistencyQty || round.status === "regresada" ? "disabled" : ""}>Nueva venta</button><div class="route-header-secondary"><button class="secondary-btn reload-round" data-id="${round.id}" ${round.status === "regresada" ? "disabled" : ""}>Recargar</button><button class="secondary-btn return-round" data-id="${round.id}" ${metrics?.inconsistencyQty && !adminMode ? "disabled" : ""}>${round.status === "regresada" ? "Cerrar ronda" : "Regreso"}</button>${adminMode && metrics?.inconsistencyQty ? `<button class="secondary-btn recover-round" data-id="${round.id}">Resolver ronda activa</button>` : ""}${adminMode && !metrics?.inconsistencyQty && round.status !== "regresada" ? `<button class="secondary-btn correct-round-load" data-id="${round.id}">Corregir carga</button>` : ""}<button class="secondary-btn" data-go="fiado">Cobrar</button>${adminMode && can("create_expense") ? `<button class="secondary-btn" data-go="gastos" data-expense-center="${route}">Registrar gasto</button>` : ""}${can("adjust_inventory") ? `<button class="text-btn" data-inventory-quick="adjust" data-location="empty_${route}">Corregir vacíos</button>` : ""}</div>` : `<button class="primary-btn wide route-start-round" type="button" data-route="${route}" ${can("rounds") ? "" : "disabled"}>Iniciar ronda</button>`}</section>`;
      })
      .join("");

    const routeClients = state.clients
      .filter(
        (client) =>
          client.active !== false && routeScope.includes(client.route),
      )
      .sort(
        (a, b) =>
          b.frequent - a.frequent || a.name.localeCompare(b.name),
      );
    $("routeClientsQuick").innerHTML = routeClients.length
      ? routeClients
          .slice(0, 24)
          .map((client) => {
            const balance = clientBalance(client.id);
            return `<article class="route-client-card"><div class="route-client-info"><div><strong>${client.frequent ? "★ " : ""}${esc(client.name)}</strong><small>${esc(client.address || client.phone || "Sin datos adicionales")}</small></div><span class="${balance > 0 ? "amount-danger" : "amount-success"}">${balance > 0 ? money(balance) : "Al corriente"}</span></div><div class="client-meta"><span>${esc(CHANNELS[client.route])}</span><span>${client.price != null ? `Especial ${money(expectedSalePrice(client))}` : money(expectedSalePrice(client))}</span></div><div class="route-client-actions"><button class="secondary-btn route-client-sale" data-id="${client.id}">Vender</button><button class="secondary-btn route-client-pay" data-id="${client.id}" ${balance > 0 && can("register_payment") ? "" : "disabled"}>Cobrar</button></div></article>`;
          })
          .join("")
      : '<div class="empty">No hay clientes asignados a esta ruta.</div>';
    $("startRoundBtn").hidden = !can("rounds");
    $("fillContainersBtn").hidden = !can("rounds");
    $("activeRounds").innerHTML = ["ruta1", "ruta2"]
      .filter((r) => !ownRoute || r === u.center)
      .map((route) => {
        const r = activeRound(route);
        if (!r)
          return `<div class="round-card"><span class="eyebrow">${CHANNELS[route]}</span><h3>Sin ronda activa</h3><p class="muted">Prepara una salida para comenzar.</p></div>`;
        const metrics = roundMetrics(r),
          pct = metrics.totalLoaded
            ? (metrics.netSold / metrics.totalLoaded) * 100
            : 0;
        return `<div class="round-card"><span class="eyebrow">${CHANNELS[route]}</span><h3>Ronda ${r.number} · ${r.status === "regresada" ? "Regreso registrado" : "En ruta"}</h3><div class="round-progress"><span style="width:${Math.min(100, pct)}%"></span></div><p>Carga inicial <strong>${int(metrics.initialLoad)}</strong> · Recargas <strong>${int(metrics.reloads)}</strong> · Total <strong>${int(metrics.totalLoaded)}</strong><br>Vendidos netos <strong>${int(metrics.netSold)}</strong> · Disponibles <strong class="${metrics.inconsistencyQty ? "amount-danger" : ""}">${int(metrics.availableFull)}</strong></p>${metrics.inconsistencyQty ? `<div class="danger-box">Ronda con inconsistencia: se vendieron ${int(metrics.inconsistencyQty)} más de los cargados. Requiere recuperación administrativa con motivo; no se modificarán ventas.</div>` : ""}<div class="dialog-actions"><button class="primary-btn" data-go="ventas" data-channel="${route}" ${metrics.inconsistencyQty || r.status === "regresada" ? "disabled" : ""}>Nueva venta</button><button class="secondary-btn reload-round" data-id="${r.id}" ${r.status === "regresada" ? "disabled" : ""}>Recargar ruta</button><button class="secondary-btn" data-go="fiado">Cobrar</button><button class="secondary-btn return-round" data-id="${r.id}" ${metrics.inconsistencyQty && !adminMode ? "disabled" : ""}>${r.status === "regresada" ? "Cerrar ronda" : "Regresar"}</button>${adminMode && metrics.inconsistencyQty ? `<button class="secondary-btn recover-round" data-id="${r.id}">Resolver ronda activa</button>` : ""}</div></div>`;
      })
      .join("");
    ["ruta1", "ruta2"].forEach((r, i) => {
      const card = $(`route${i + 1}Card`);
      card.hidden = ownRoute && r !== u.center;
      const sales = todaySales().filter(
          (s) => s.channel === r && (!ownRoute || s.userId === u.id),
        ),
        units = sales.reduce((a, s) => a + s.qty, 0),
        rev = sales.reduce((a, s) => a + s.total, 0),
        credit = sales.reduce((a, s) => a + s.credit, 0);
      card.innerHTML = `<div class="route-top"><div><span class="eyebrow">${CHANNELS[r]}</span><div class="route-number">${int(units)}</div><div class="muted">garrafones vendidos hoy</div></div><div><strong>${money(rev)}</strong><br><small class="muted">Fiado ${money(credit)}</small></div></div><hr style="border:0;border-top:1px solid #edf0f5;margin:18px 0"><div class="list-row"><span>Llenos en ruta</span><strong>${int(state.inventory[r])}</strong></div><div class="list-row"><span>Vacíos en ruta</span><strong>${int(state.inventory[`empty_${r}`] || 0)}</strong></div><button class="primary-btn wide" data-go="ventas" data-channel="${r}">Registrar venta</button>`;
    });
    const arr = todaySales().filter(
      (s) =>
        (s.channel === "ruta1" || s.channel === "ruta2") &&
        (!ownRoute || (s.channel === u.center && s.userId === u.id)),
    );
    $("routesActivity").innerHTML = arr.length
      ? arr
          .slice()
          .reverse()
          .map(
            (s) =>
              `<div class="list-row"><div class="list-main"><strong>${esc(s.folio || s.id)} · ${esc(s.clientName)} · ${s.qty}</strong><small>${CHANNELS[s.channel]} · ${fmtDateTime(s.date)}${s.roundId ? ` · Ronda ${state.rounds.find((r) => r.id === s.roundId)?.number || "-"}` : ""}</small></div><strong>${money(s.total)}</strong></div>`,
          )
          .join("")
      : '<div class="empty">Sin movimientos de ruta hoy.</div>';
    const history = state.rounds
      .filter(
        (r) =>
          adminMode || r.userId === u?.id || (ownRoute && r.route === u.center),
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 30);
    $("roundsHistory").innerHTML = history.length
      ? `<div class="table-responsive"><table><thead><tr><th>Fecha</th><th>Ruta</th><th>Ronda</th><th>Carga inicial</th><th>Recargas</th><th>Total</th><th>Vendidos netos</th><th>Esperados</th><th>Llenos regreso</th><th>Estado</th><th>Empleado</th></tr></thead><tbody>${history.map((r) => { const metrics = roundMetrics(r); return `<tr><td>${fmtDate(r.startedAt)}</td><td>${CHANNELS[r.route]}</td><td>${r.number}</td><td>${int(metrics.initialLoad)}</td><td>${int(metrics.reloads)}</td><td>${int(metrics.totalLoaded)}</td><td>${int(metrics.netSold)}</td><td>${int(metrics.availableFull)}</td><td>${int(r.returnedFullQty || 0)}</td><td>${metrics.inconsistencyQty ? `<span class="amount-danger">Inconsistente: ${int(metrics.inconsistencyQty)} de más. Ajuste administrativo requerido.</span>` : "Correcta"}</td><td>${esc(state.users.find((u) => u.id === r.userId)?.name || "-")}</td></tr>`; }).join("")}</tbody></table></div>`
      : '<div class="empty">Aún no hay rondas registradas.</div>';
    $("routeRoundActions").innerHTML = routeScope
      .map((route) => activeRound(route))
      .filter(Boolean)
      .map((round) => {
        const metrics = roundMetrics(round);
        return `<button class="secondary-btn wide return-round" data-id="${round.id}" ${metrics.inconsistencyQty && !adminMode ? "disabled" : ""}>${round.status === "regresada" ? "Cerrar" : "Regresar"} ronda ${int(round.number)}</button>${adminMode && metrics.inconsistencyQty ? `<button class="secondary-btn wide recover-round" data-id="${round.id}">Resolver ronda activa</button>` : ""}`;
      })
      .join("");
    $$(".route-start-round").forEach(
      (button) =>
        (button.onclick = () => openStartRoundDialog(button.dataset.route)),
    );
    $$(".route-client-sale").forEach(
      (button) =>
        (button.onclick = () => beginSaleForClient(button.dataset.id)),
    );
    $$(".route-client-pay").forEach(
      (button) =>
        (button.onclick = () => openPaymentDialog(button.dataset.id)),
    );
    $$(".return-round").forEach(
      (b) => (b.onclick = () => openReturnRound(b.dataset.id)),
    );
    $$(".recover-round").forEach(
      (b) => (b.onclick = () => openReturnRound(b.dataset.id, true)),
    );
    $$(".reload-round").forEach(
      (b) => (b.onclick = () => openReloadRound(b.dataset.id)),
    );
    $$(".correct-round-load").forEach(
      (b) => (b.onclick = () => openRoundLoadCorrection(b.dataset.id)),
    );
  }
  function openStartRoundDialog(requestedRoute = null) {
    if (!requirePermission("rounds")) return;
    $("startRoundForm").reset();
    const u = activeUser();
    $("roundRoute").value =
      u?.role === "repartidor" && ["ruta1", "ruta2"].includes(u.center)
        ? u.center
        : ["ruta1", "ruta2"].includes(requestedRoute)
          ? requestedRoute
          : "ruta1";
    $("roundRoute").disabled = u?.role === "repartidor" && !adminMode;
    $("roundLoadedQty").value = "";
    showManagedDialog($("startRoundDialog"));
  }
  function openFillContainersDialog() {
    if (!requirePermission("rounds")) return;
    const available = Math.max(0, Number(state.inventory.empty_local || 0));
    $("fillContainersForm").reset();
    $("fillAvailableQty").textContent = int(available);
    $("fillContainersQty").max = String(available);
    $("fillContainersQty").value = available > 0 ? String(available) : "";
    $("fillContainersQty").disabled = available === 0;
    $("fillContainersSubmit").disabled = available === 0;
    $("fillContainersSubmit").textContent =
      available > 0
        ? `Preparar ${int(available)} llenos`
        : "Sin vacíos disponibles";
    $("fillContainersHelp").textContent =
      available > 0
        ? `Puedes preparar hasta ${int(available)} garrafones. Lavado está incluido.`
        : "No hay garrafones vacíos disponibles en Local.";
    showManagedDialog($("fillContainersDialog"));
  }
  async function startRound(e) {
    e.preventDefault();
    if (!requirePermission("rounds")) return;
    const u = activeUser(),
      route = $("roundRoute").value,
      qty = Number($("roundLoadedQty").value);
    if (u.role === "repartidor" && !adminMode && route !== u.center)
      return toast("Solo puedes iniciar tu ruta asignada.", "error");
    if (activeRound(route))
      return toast(`${CHANNELS[route]} ya tiene una ronda activa.`, "error");
    if (!Number.isInteger(qty) || qty <= 0)
      return toast("Captura una carga válida.", "error");
    if (!validateInventoryMovement("local", -qty).valid)
      return toast("No hay suficientes garrafones llenos en Local.", "error");
    const previousState = structuredClone(state),
      todayRounds = state.rounds.filter(
        (r) => r.route === route && sameDay(r.startedAt),
      ),
      number =
        Math.max(0, ...todayRounds.map((r) => Number(r.number || 0))) + 1,
      round = {
        id: uid("round"),
        number,
        route,
        startedAt: nowISO(),
        endedAt: null,
        userId: u.id,
        loadedQty: qty,
        reloadQty: 0,
        totalLoadedQty: qty,
        availableFullQty: qty,
        inconsistencyQty: 0,
        returnedEmptyQty: 0,
        returnedFullQty: 0,
        soldQty: 0,
        damagedQty: 0,
        lostQty: 0,
        differenceQty: 0,
        notes: $("roundStartNotes").value.trim(),
        status: "en_ruta",
      };
    recordInventoryMovement(
      "local",
      -qty,
      "round_load",
      `Carga ${CHANNELS[route]} · Ronda ${number}`,
      route,
      { roundId: round.id },
    );
    recordInventoryMovement(
      route,
      qty,
      "round_load",
      `Salida desde Local · Ronda ${number}`,
      "local",
      { roundId: round.id },
    );
    state.rounds.push(round);
    addActivity(
      `${CHANNELS[route]} · Ronda ${number} iniciada con ${qty} llenos`,
    );
    audit(
      "round_started",
      "round",
      round.id,
      `Ronda ${number} ${CHANNELS[route]}`,
      null,
      round,
    );
    if (!(await commitState(previousState))) return;
    $("startRoundDialog").close();
    renderAll();
    toast(`Ronda ${number} iniciada`);
  }
  function openReloadRound(id) {
    if (!requirePermission("rounds")) return;
    const round = state.rounds.find((item) => item.id === id),
      metrics = roundMetrics(round);
    if (!round || round.status === "cerrada") return;
    $("reloadRoundForm").reset();
    $("reloadRoundId").value = id;
    $("reloadRoundSummary").innerHTML =
      `Ronda ${int(round.number)} · ${CHANNELS[round.route]}<br>` +
      `Carga inicial: <strong>${int(metrics.initialLoad)}</strong> · ` +
      `Recargas: <strong>${int(metrics.reloads)}</strong> · ` +
      `Vendidos netos: <strong>${int(metrics.netSold)}</strong> · ` +
      `Disponibles: <strong>${int(metrics.availableFull)}</strong>`;
    $("reloadRoundQty").value = "";
    $("reloadRoundQty").max = String(Number(state.inventory.local || 0));
    showManagedDialog($("reloadRoundDialog"));
  }
  async function reloadActiveRound(event) {
    event.preventDefault();
    if (!requirePermission("rounds")) return;
    const round = state.rounds.find(
        (item) => item.id === $("reloadRoundId").value,
      ),
      quantity = Number($("reloadRoundQty").value),
      notes = $("reloadRoundNotes").value.trim();
    if (!round || round.status === "cerrada")
      return toast("La ronda ya no está activa.", "error");
    if (!Number.isInteger(quantity) || quantity <= 0)
      return toast("Captura una recarga válida.", "error");
    if (!validateInventoryMovement("local", -quantity).valid)
      return toast(
        "No hay suficientes garrafones llenos en Local para esta recarga.",
        "error",
      );

    const previousState = structuredClone(state),
      before = structuredClone(round);
    recordInventoryMovement(
      "local",
      -quantity,
      "round_reload",
      `Recarga ${CHANNELS[round.route]} · Ronda ${round.number}`,
      round.route,
      { roundId: round.id },
    );
    recordInventoryMovement(
      round.route,
      quantity,
      "round_reload",
      `Desde Local · Ronda ${round.number}`,
      "local",
      { roundId: round.id },
    );
    round.reloadQty = Number(round.reloadQty || 0) + quantity;
    round.lastReloadNotes = notes;
    audit(
      "round_reloaded",
      "round",
      round.id,
      `Recarga de ${quantity} garrafones · ${CHANNELS[round.route]}`,
      before,
      structuredClone(round),
    );
    addActivity(
      `${CHANNELS[round.route]} · Ronda ${round.number} recargada con ${quantity} llenos`,
    );
    if (!(await commitState(previousState))) return;
    $("reloadRoundDialog").close();
    renderAll();
    toast(`Recarga de ${quantity} garrafones registrada`);
  }
  function openRoundLoadCorrection(id) {
    if (!requirePermission("rounds")) return;
    const round = state.rounds.find((item) => item.id === id);
    if (!round || round.status === "cerrada") return;
    const metrics = roundMetrics(round);
    if (metrics.inconsistencyQty)
      return toast(
        "Esta ronda tiene una inconsistencia; resuélvela con 'Resolver ronda activa'.",
        "error",
      );
    $("roundLoadCorrectionForm").reset();
    $("roundLoadCorrectionId").value = id;
    $("roundLoadCorrectionSummary").innerHTML =
      `Ronda ${int(round.number)} · ${CHANNELS[round.route]}<br>` +
      `Carga inicial: <strong>${int(metrics.initialLoad)}</strong> · ` +
      `Recargas: <strong>${int(metrics.reloads)}</strong> · ` +
      `Vendidos netos: <strong>${int(metrics.netSold)}</strong> · ` +
      `Disponibles actuales: <strong>${int(metrics.availableFull)}</strong>`;
    $("roundLoadCorrectionQty").min = String(metrics.netSold);
    $("roundLoadCorrectionQty").value = String(metrics.availableFull);
    updateRoundLoadCorrectionDifference();
    showManagedDialog($("roundLoadCorrectionDialog"));
  }
  function updateRoundLoadCorrectionDifference() {
    const round = state.rounds.find(
        (item) => item.id === $("roundLoadCorrectionId").value,
      ),
      metrics = round ? roundMetrics(round) : null;
    if (!metrics) return;
    const current = metrics.availableFull,
      next = Number($("roundLoadCorrectionQty").value),
      difference = Number.isFinite(next) ? next - current : 0;
    $("roundLoadCorrectionDifference").innerHTML =
      `<strong>${int(current)} → ${Number.isFinite(next) ? int(next) : "—"}</strong> · Diferencia <strong class="${difference < 0 ? "amount-danger" : "amount-success"}">${difference > 0 ? "+" : ""}${int(difference)}</strong>`;
  }
  async function saveRoundLoadCorrection(event) {
    event.preventDefault();
    if (!requirePermission("rounds")) return;
    const round = state.rounds.find(
      (item) => item.id === $("roundLoadCorrectionId").value,
    );
    if (!round || round.status === "cerrada")
      return toast("La ronda ya no está activa.", "error");
    const metrics = roundMetrics(round);
    if (metrics.inconsistencyQty)
      return toast(
        "Esta ronda tiene una inconsistencia; resuélvela con 'Resolver ronda activa'.",
        "error",
      );
    const newAvailable = Number($("roundLoadCorrectionQty").value),
      reason = $("roundLoadCorrectionReason").value.trim();
    if (!Number.isInteger(newAvailable) || newAvailable < metrics.netSold)
      return toast(
        `El nuevo total no puede ser menor a lo ya vendido (${int(metrics.netSold)}).`,
        "error",
      );
    if (!reason) return toast("Escribe el motivo de la corrección.", "error");
    const delta = newAvailable - metrics.availableFull;
    if (delta === 0) return toast("No hay ningún cambio que guardar.", "error");
    if (delta > 0 && !validateInventoryMovement("local", -delta).valid)
      return toast(
        "No hay suficientes garrafones llenos en Local para esta corrección.",
        "error",
      );
    const previousState = structuredClone(state),
      before = structuredClone(round);
    recordInventoryMovement(
      "local",
      -delta,
      "round_load_correction",
      reason,
      round.route,
      { roundId: round.id },
    );
    recordInventoryMovement(
      round.route,
      delta,
      "round_load_correction",
      reason,
      "local",
      { roundId: round.id },
    );
    round.reloadQty = Number(round.reloadQty || 0) + delta;
    audit(
      "round_load_corrected",
      "round",
      round.id,
      reason,
      before,
      structuredClone(round),
    );
    addActivity(
      `${CHANNELS[round.route]} · Ronda ${round.number}: carga corregida (${delta > 0 ? "+" : ""}${int(delta)})`,
    );
    if (!(await commitState(previousState))) return;
    $("roundLoadCorrectionDialog").close();
    renderAll();
    toast("Carga de la ronda corregida");
  }
  function traceRoundReturn(stage, detail = {}) {
    console.info(stage, detail);
    const trace = $("roundReturnTrace");
    if (!trace) return;
    trace.hidden = false;
    trace.className = stage === "rpc-error" ? "danger-box" : "info-box";
    trace.textContent =
      stage === "route-return-click"
        ? "Preparando regreso…"
        : stage === "rpc-start"
          ? "Guardando en la central…"
          : stage === "rpc-success"
            ? "Operación guardada correctamente."
            : stage === "rpc-error"
              ? detail.message || "No se pudo guardar la operación."
              : stage;
  }
  function canRecoverRound(round) {
    return Boolean(
      adminMode && activeUser()?.role === "administrador" && round,
    );
  }
  function openReturnRound(id, recovery = false) {
    traceRoundReturn("route-return-click", { round_id: id });
    console.info("round_id", id);
    const round = state.rounds.find((r) => r.id === id);
    if (!round || round.status === "cerrada")
      return toast("La ronda ya no está activa.", "error");
    const metrics = roundMetrics(round),
      isReturned = round.status === "regresada",
      requiresRecovery = metrics.inconsistencyQty > 0;
    if (requiresRecovery && !canRecoverRound(round))
      return toast(
        "Esta ronda es inconsistente y solo un Administrador puede resolverla.",
        "error",
      );
    $("returnRoundForm").reset();
    $("returnRoundId").value = id;
    $("returnRoundDialogTitle").textContent = isReturned
      ? "Cerrar ronda"
      : recovery || requiresRecovery
        ? "Resolver ronda activa"
        : "Registrar regreso";
    $("roundReturnSummary").innerHTML =
      `<strong>${esc(CHANNELS[round.route])} · Ronda ${int(round.number)}</strong><br>` +
      `ID: <code>${esc(round.id)}</code><br>` +
      `Apertura: <strong>${fmtDateTime(round.startedAt)}</strong><br>` +
      `Carga inicial: <strong>${int(metrics.initialLoad)}</strong> · ` +
      `Recargas: <strong>${int(metrics.reloads)}</strong><br>` +
      `Vendidos netos: <strong>${int(metrics.netSold)}</strong><br>` +
      `Llenos esperados de regreso: <strong>${int(Math.max(0, metrics.availableFull))}</strong><br>` +
      `Regreso registrado: <strong>${isReturned ? "Sí" : "No"}</strong> · ` +
      `Estado: <strong>${isReturned ? "Listo para cerrar" : "En ruta"}</strong>`;
    const warning = $("roundReturnWarning");
    warning.hidden = !requiresRecovery;
    warning.textContent = requiresRecovery
      ? `Inconsistencia detectada: hay ${int(metrics.inconsistencyQty)} ventas por encima de la carga registrada. Las ventas no se modificarán; captura el regreso físico y explica el motivo.`
      : "";
    $("roundRecoveryReasonField").hidden = !requiresRecovery || isReturned;
    $("roundRecoveryReason").required = requiresRecovery && !isReturned;
    $("roundReturnedFull").value = isReturned
      ? int(round.returnedFullQty || 0)
      : int(Math.max(0, metrics.availableFull));
    $("roundReturnedEmpty").value = isReturned
      ? int(round.returnedEmptyQty || 0)
      : int(metrics.netSold);
    $("roundDamaged").value = int(round.damagedQty || 0);
    $("roundLost").value = 0;
    $("roundReturnNotes").value = round.notes || "";
    ["roundReturnedFull", "roundReturnedEmpty", "roundDamaged"].forEach(
      (field) => ($(field).disabled = isReturned),
    );
    $("roundReturnNotes").disabled = isReturned;
    $("returnRoundSubmitBtn").textContent = isReturned
      ? "Cerrar ronda"
      : "Registrar regreso";
    $("returnRoundSubmitBtn").disabled = false;
    $("roundReturnTrace").hidden = true;
    showManagedDialog($("returnRoundDialog"));
  }
  async function closeRound(e) {
    e.preventDefault();
    if (!requirePermission("rounds")) return;
    const submit = $("returnRoundSubmitBtn"),
      round = state.rounds.find((r) => r.id === $("returnRoundId").value);
    if (!round || round.status === "cerrada")
      return toast("La ronda ya fue cerrada.", "error");
    if (submit.disabled) return;
    submit.disabled = true;
    const previousState = structuredClone(state),
      before = structuredClone(round),
      metrics = roundMetrics(round);

    if (round.status === "regresada") {
      traceRoundReturn("rpc-start", { round_id: round.id, action: "close" });
      round.status = "cerrada";
      round.endedAt = nowISO();
      round.closedBy = activeUser()?.id || null;
      round.closeNotes = round.notes || "";
      addActivity(`${CHANNELS[round.route]} · Ronda ${round.number} cerrada`);
      audit("round_closed", "round", round.id, `Ronda ${round.number} cerrada`, before, round);
      if (!(await commitState(previousState))) {
        submit.disabled = false;
        return traceRoundReturn("rpc-error", {
          round_id: round.id,
          message: lastCommitError?.userMessage || lastCommitError?.message,
        });
      }
      traceRoundReturn("rpc-success", { round_id: round.id, action: "close" });
      $("returnRoundDialog").close();
      renderAll();
      return toast(`Ronda ${round.number} cerrada. La ruta está disponible.`);
    }

    const full = Number($("roundReturnedFull").value),
      empty = Number($("roundReturnedEmpty").value),
      damaged = Number($("roundDamaged").value),
      recoveryReason = $("roundRecoveryReason").value.trim(),
      requiresRecovery = metrics.inconsistencyQty > 0;
    if ([full, empty, damaged].some((n) => !Number.isInteger(n) || n < 0)) {
      submit.disabled = false;
      return toast("Las cantidades deben ser enteras y no negativas.", "error");
    }
    if (requiresRecovery && (!canRecoverRound(round) || !recoveryReason)) {
      submit.disabled = false;
      return toast("El Administrador debe escribir el motivo de recuperación.", "error");
    }
    const expected = Math.max(0, metrics.availableFull),
      difference = expected - full - damaged;
    if (!requiresRecovery && difference !== 0) {
      submit.disabled = false;
      return toast(
        difference > 0
          ? `Faltan asignar ${int(difference)} garrafones entre llenos y dañados.`
          : `Se capturaron ${int(-difference)} garrafones de más.`,
        "error",
      );
    }
    if (Number(state.inventory[round.route] || 0) < full + damaged) {
      submit.disabled = false;
      return toast("El inventario de ruta no alcanza para registrar el regreso.", "error");
    }
    if (full) {
      recordInventoryMovement(round.route, -full, "round_return_full", `Regreso Ronda ${round.number}`, "local", { roundId: round.id });
      recordInventoryMovement("local", full, "round_return_full", `Desde ${CHANNELS[round.route]} · Ronda ${round.number}`, round.route, { roundId: round.id });
    }
    if (damaged) {
      recordInventoryMovement(round.route, -damaged, "round_damaged", `Dañados Ronda ${round.number}`, "danados", { roundId: round.id });
      recordInventoryMovement("danados", damaged, "round_damaged", `Desde ${CHANNELS[round.route]}`, round.route, { roundId: round.id });
    }
    if (empty) {
      const emptyRoute = `empty_${round.route}`;
      if (Number(state.inventory[emptyRoute] || 0) < empty) {
        submit.disabled = false;
        return toast("Los vacíos capturados superan los disponibles en la ruta.", "error");
      }
      recordInventoryMovement(emptyRoute, -empty, "round_return_empty", `Regreso Ronda ${round.number}`, "empty_local", { roundId: round.id });
      recordInventoryMovement("empty_local", empty, "round_return_empty", `Desde ${CHANNELS[round.route]} · Ronda ${round.number}`, emptyRoute, { roundId: round.id });
    }
    round.returnedAt = nowISO();
    round.soldQty = metrics.netSold;
    round.returnedFullQty = full;
    round.returnedEmptyQty = empty;
    round.damagedQty = damaged;
    round.lostQty = 0;
    round.differenceQty = difference;
    round.notes = $("roundReturnNotes").value.trim();
    round.recoveryReason = recoveryReason;
    round.status = "regresada";
    addActivity(`${CHANNELS[round.route]} · Regreso de ronda ${round.number} registrado`);
    audit("round_returned", "round", round.id, `Regreso Ronda ${round.number}`, before, round);
    traceRoundReturn("rpc-start", { round_id: round.id, action: "return" });
    if (!(await commitState(previousState))) {
      submit.disabled = false;
      return traceRoundReturn("rpc-error", {
        round_id: round.id,
        message: lastCommitError?.userMessage || lastCommitError?.message,
      });
    }
    traceRoundReturn("rpc-success", { round_id: round.id, action: "return" });
    renderAll();
    openReturnRound(round.id);
    toast(`Regreso de ronda ${round.number} registrado. Ya puedes cerrarla.`);
  }
  async function fillContainers(e) {
    e.preventDefault();
    if (!requirePermission("rounds")) return;
    const qty = Number($("fillContainersQty").value),
      notes = $("fillContainersNotes").value.trim();
    if (!Number.isInteger(qty) || qty <= 0)
      return toast("Captura una cantidad válida.", "error");
    if (!validateInventoryMovement("lavado", -qty).valid)
      return toast("No hay suficientes vacíos en Lavado.", "error");
    const configured = state.supplies.filter(
      (s) => s.active !== false && Number(s.consumptionPerUnit) > 0,
    );
    for (const supply of configured) {
      const needed = Number(supply.consumptionPerUnit) * qty;
      if (Number(supply.currentStock) < needed)
        return toast(`Insumo insuficiente: ${supply.name}.`, "error");
    }
    const previousState = structuredClone(state),
      fillId = uid("fill");
    recordInventoryMovement(
      "lavado",
      -qty,
      "containers_filled",
      "Vacíos procesados",
      null,
      { fillId },
    );
    recordInventoryMovement(
      "local",
      qty,
      "containers_filled",
      "Llenos disponibles",
      "lavado",
      { fillId },
    );
    configured.forEach((s) => {
      const amount = Number(s.consumptionPerUnit) * qty;
      s.currentStock -= amount;
      state.supplyMovements.unshift({
        id: uid("supmov"),
        date: nowISO(),
        supplyId: s.id,
        type: "production",
        quantity: -amount,
        balance: s.currentStock,
        costPerUnit: s.costPerUnit,
        userId: activeUser().id,
        reason: `Llenado de ${qty} garrafones`,
        fillId,
      });
    });
    state.maintenance.count += qty;
    audit(
      "containers_filled",
      "inventory",
      fillId,
      `Llenado de ${qty} garrafones`,
      {
        lavado: Number(previousState.inventory.lavado),
        local: Number(previousState.inventory.local),
      },
      { lavado: state.inventory.lavado, local: state.inventory.local, notes },
    );
    if (!(await commitState(previousState))) return;
    $("fillContainersDialog").close();
    renderAll();
    toast(`${qty} garrafones llenos disponibles`);
  }
  function renderWindow() {
    const u = activeUser(),
      own = !adminMode && u?.role === "ventanilla",
      sales = todaySales().filter(
        (s) => s.channel === "ventanilla" && (!own || s.userId === u.id),
      );
    $("windowMetrics").innerHTML = [
      metric("Garrafones", int(sales.reduce((a, s) => a + s.qty, 0)), "Hoy"),
      metric("Ventas", money(sales.reduce((a, s) => a + s.total, 0)), "Hoy"),
      metric(
        "Cobrado",
        money(sales.reduce((a, s) => a + s.paid, 0)),
        "Al vender",
      ),
      metric(
        "Fiado",
        money(sales.reduce((a, s) => a + s.credit, 0)),
        "Generado",
      ),
    ].join("");
    $("windowSales").innerHTML = sales.length
      ? sales
          .slice()
          .reverse()
          .slice(0, 8)
          .map(
            (s) =>
              `<div class="sale-card compact-sale-card"><div class="list-main"><strong>${esc(s.clientName)} · ${s.qty} garrafón(es)</strong><small>${fmtDateTime(s.date)}</small></div><div class="sale-card-actions"><strong>${money(s.total)}</strong><button class="text-btn view-sale" data-id="${s.id}">Ver</button>${isEffectiveSale(s) && can("create_sale") ? `<button class="secondary-btn repeat-sale" data-id="${s.id}">Repetir</button>` : ""}</div></div>`,
          )
          .join("")
      : '<div class="empty">Sin ventas de ventanilla hoy.</div>';
    bindLatestSalesActions($("windowSales"));
  }

  function renderCash() {
    const user = activeUser(),
      session = getOpenCashSession(user?.id);
    if (session) {
      const m = cashMovementsForSession(session);
      $("cashSessionPanel").innerHTML =
        `<div class="metric-grid" style="grid-template-columns:1fr 1fr">${metric("Fondo inicial", money(session.openingAmount))}${metric("Efectivo esperado", money(m.expected))}${metric("+ Ventas efectivo", money(m.cashSales))}${metric("+ Cobros fiado", money(m.cashDebtPayments))}${metric("- Gastos", money(m.cashExpenses))}${metric("- Devoluciones", money(m.cashReturns))}${metric("Otros / ajustes", money(m.otherIncome - m.withdrawals + m.cashAdjustments))}${metric("Entregas netas", money(m.cashIncoming - m.cashOutgoing))}</div><button id="closeCashBtn" class="primary-btn wide">Cerrar caja</button>`;
      $("closeCashBtn").hidden = !can("close_cash");
      $("closeCashBtn").onclick = () => openCloseCashDialog(session);
    } else {
      $("cashSessionPanel").innerHTML =
        `<div class="empty">No hay una caja abierta para <strong>${esc(user?.name || "")}</strong>.</div><button id="openCashBtn" class="primary-btn wide" style="margin-top:12px">Abrir caja</button>`;
      $("openCashBtn").hidden = !can("open_cash");
      $("openCashBtn").onclick = () => showManagedDialog($("cashOpenDialog"));
    }
    const ownOnly = !can("view_all_cash");
    $("cashBreakdownTitle").textContent = "Resumen de esta caja";
    if (session) {
      const m = cashMovementsForSession(session);
      $("cashBreakdown").innerHTML =
        `<div class="list-row"><span>Efectivo cobrado</span><strong>${money(m.cashSales + m.cashDebtPayments)}</strong></div><div class="list-row"><span>Transferencias</span><strong>${money(m.nonCashTransfers)}</strong></div><div class="list-row"><span>Fiado generado</span><strong>${money(m.creditGenerated)}</strong></div><div class="list-row"><span>Fiado recuperado</span><strong>${money(m.debtPaymentsTotal)}</strong></div><div class="info-box"><small>Solo movimientos de esta sesión desde ${fmtDateTime(session.openedAt)} hasta ahora.</small></div>`;
    } else {
      $("cashBreakdown").innerHTML =
        '<div class="empty">Abre una caja para ver su resumen.</div>';
    }
    $("cashMovementForm").classList.toggle("hidden", !session || !adminMode);
    $("cashDeliveryForm").classList.toggle(
      "hidden",
      !session || !can("cash_delivery"),
    );
    const destinations = state.cashSessions.filter(
      (s) => !s.closedAt && s.id !== session?.id,
    );
    $("cashDeliveryDestination").innerHTML = destinations.length
      ? destinations
          .map((s) => {
            const owner = state.users.find((u) => u.id === s.userId);
            return `<option value="${s.id}">${esc(owner?.name || "Usuario")} · ${esc(centerLabel(s.center))}</option>`;
          })
          .join("")
      : '<option value="">No hay otra caja abierta</option>';
    renderDailyCashSummary();
    const hist = state.cashSessions
      .filter((s) => !ownOnly || s.userId === user?.id)
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    $("cashSessionsHistory").innerHTML = hist.length
      ? `<div class="table-responsive"><table><thead><tr><th>Fecha</th><th>Empleado</th><th>Centro</th><th>Apertura</th><th>Ventas efectivo</th><th>Cobros</th><th>Gastos</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th></th></tr></thead><tbody>${hist
          .map((s) => {
            const owner = state.users.find((u) => u.id === s.userId),
              m = cashMovementsForSession(s),
              difference = s.closedAt
                ? Number(
                    s.difference ??
                      Number(s.countedAmount || 0) -
                        Number(s.expectedAmount ?? m.expected),
                  )
                : null;
            return `<tr><td>${fmtDate(s.openedAt)}</td><td>${esc(owner?.name || "Usuario")}</td><td>${esc(centerLabel(s.center))}</td><td>${fmtDateTime(s.openedAt)}</td><td>${money(m.cashSales)}</td><td>${money(m.cashDebtPayments)}</td><td>${money(m.cashExpenses)}</td><td>${money(s.expectedAmount ?? m.expected)}</td><td>${s.closedAt ? money(s.countedAmount) : "Abierta"}</td><td class="${difference != null && Math.abs(difference) > 0.009 ? "amount-danger" : "amount-success"}">${difference == null ? "-" : money(difference)}</td><td><button class="text-btn cash-detail" data-id="${s.id}">Ver detalle</button></td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : '<div class="empty">No hay cortes registrados.</div>';
    $$(".cash-detail").forEach(
      (b) => (b.onclick = () => openCashDetail(b.dataset.id)),
    );
  }
  function renderDailyCashSummary() {
    const user = activeUser(),
      ownOnly = !can("view_all_cash"),
      sessions = state.cashSessions.filter(
        (s) => sameDay(s.openedAt) && (!ownOnly || s.userId === user?.id),
      ),
      sales = todaySales().filter((s) => !ownOnly || s.userId === user?.id),
      payments = state.ledger.filter(
        (l) =>
          sameDay(l.date) &&
          l.type === "payment" &&
          (!ownOnly || l.userId === user?.id),
      ),
      expenses = todayExpenses().filter(
        (e) => !ownOnly || e.userId === user?.id,
      ),
      centers = ownOnly ? [user?.center] : ["local", "ruta1", "ruta2"];
    const cards = centers.filter(Boolean).map((center) => {
      const ss = sessions.filter((s) => s.center === center),
        expected = ss.reduce(
          (a, s) =>
            a + Number(s.expectedAmount ?? cashMovementsForSession(s).expected),
          0,
        );
      return `<div class="cash-summary-item">${esc(centerLabel(center))}<strong>${money(expected)}</strong><small>${ss.filter((s) => !s.closedAt).length ? "Caja abierta" : ss.length ? "Cerrada" : "Sin corte"}</small></div>`;
    });
    const totalCash =
        sales.reduce((a, s) => a + saleCashAmount(s), 0) +
        payments
          .filter((p) => p.method === "efectivo")
          .reduce((a, p) => a + p.payment, 0) -
        expenses
          .filter(
            (e) =>
              e.affectsCash !== false &&
              String(e.method).toLowerCase() === "efectivo",
          )
          .reduce((a, e) => a + e.amount, 0),
      transfers =
        sales
          .filter((s) => s.paymentType === "transferencia")
          .reduce((a, s) => a + s.total, 0) +
        payments
          .filter((p) => p.method === "transferencia")
          .reduce((a, p) => a + p.payment, 0),
      credit = sales.reduce((a, s) => a + s.credit, 0),
      recovered = payments.reduce((a, p) => a + p.payment, 0),
      differences = sessions
        .filter((s) => s.closedAt)
        .reduce((a, s) => a + Number(s.difference || 0), 0);
    $("dailyCashSummary").innerHTML =
      `<div class="cash-summary-grid">${cards.join("")}<div class="cash-summary-item">Total efectivo operativo<strong>${money(totalCash)}</strong></div><div class="cash-summary-item">Transferencias<strong>${money(transfers)}</strong></div><div class="cash-summary-item">Fiado generado<strong>${money(credit)}</strong></div><div class="cash-summary-item">Fiado recuperado<strong>${money(recovered)}</strong></div><div class="cash-summary-item">Gastos<strong>${money(expenses.reduce((a, e) => a + e.amount, 0))}</strong></div><div class="cash-summary-item">Diferencias<strong>${money(differences)}</strong></div></div>`;
  }
  function openCashDetail(id) {
    const s = state.cashSessions.find((x) => x.id === id);
    if (!s) return;
    const m = cashMovementsForSession(s),
      owner = state.users.find((u) => u.id === s.userId);
    $("cashDetailContent").innerHTML =
      `<div class="detail-hero"><div><span class="eyebrow">${s.closedAt ? "CORTE CERRADO" : "CAJA ABIERTA"}</span><h2>${esc(owner?.name || "Usuario")}</h2><p>${esc(centerLabel(s.center))} · ${fmtDateTime(s.openedAt)}${s.closedAt ? ` → ${fmtDateTime(s.closedAt)}` : ""}</p></div><div><div class="muted">Esperado</div><div class="route-number">${money(s.expectedAmount ?? m.expected)}</div></div></div><div class="cash-summary-grid">${[
        ["Fondo inicial", s.openingAmount],
        ["Ventas efectivo", m.cashSales],
        ["Cobros fiado", m.cashDebtPayments],
        ["Otros ingresos", m.otherIncome],
        ["Gastos efectivo", -m.cashExpenses],
        ["Devoluciones", -m.cashReturns],
        ["Retiros", -m.withdrawals],
        ["Ajustes posteriores", m.cashAdjustments],
        ["Entradas internas", m.cashIncoming],
        ["Entregas internas", -m.cashOutgoing],
        ["Transferencias informativas", m.nonCashTransfers],
        ["Fiado generado", m.creditGenerated],
      ]
        .map(
          ([label, value]) =>
            `<div class="cash-summary-item">${label}<strong>${money(value)}</strong></div>`,
        )
        .join(
          "",
        )}</div>${s.closedAt ? `<div class="info-box">Contado: <strong>${money(s.countedAmount)}</strong><br>Diferencia: <strong>${money(s.difference)}</strong><br>Motivo: ${esc(s.differenceReason || "Sin diferencia")}</div>` : ""}`;
    showManagedDialog($("cashDetailDialog"));
  }
  function renderReports() {
    // El <select> se genera dentro de esta misma funcion, asi que en el primer
    // render todavia no existe: se cae al periodo por defecto.
    const period = $("reportPeriod")?.value || "dia";
    const now = new Date();
    let startDate, endDate = now;

    if (period === "dia") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "semana") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const sales = state.sales
      .filter(isEffectiveSale)
      .map(netSale)
      .filter((s) => {
        const d = new Date(s.date);
        return d >= startDate && d <= endDate;
      });
    const expenses = state.expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= startDate && d <= endDate;
    });
    const payments = state.ledger.filter((l) => {
      const d = new Date(l.date);
      return d >= startDate && d <= endDate && l.type === "payment";
    });

    const totalSales = sales.reduce((a, s) => a + s.total, 0);
    const collected = sales.reduce((a, s) => a + s.paid, 0) + payments.reduce((a, p) => a + p.payment, 0);
    const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
    const totalCredit = sales.reduce((a, s) => a + s.credit, 0);
    const unreturnedContainers = (s) =>
      Math.max(
        0,
        Number(s.qty || 0) -
          Number(s.emptyReturnQty ?? s.qty ?? 0) -
          Number(s.damagedReturnQty || 0),
      );
    const totalUnreturned = sales.reduce(
      (a, s) => a + unreturnedContainers(s),
      0,
    );

    const byChannel = Object.keys(CHANNELS).map((k) => ({
      channel: CHANNELS[k],
      sales: sales.filter((s) => s.channel === k).reduce((a, s) => a + s.total, 0),
      units: sales.filter((s) => s.channel === k).reduce((a, s) => a + s.qty, 0),
      unreturned: sales
        .filter((s) => s.channel === k)
        .reduce((a, s) => a + unreturnedContainers(s), 0),
    }));

    const clientsWithDebt = state.clients
      .filter((c) => clientBalance(c.id) > 0.009)
      .sort((a, b) => clientBalance(b.id) - clientBalance(a.id))
      .slice(0, 10);

    const clientsWithContainerDebt = state.clients
      .filter((c) => Number(c.containerDebt || 0) > 0)
      .sort((a, b) => Number(b.containerDebt || 0) - Number(a.containerDebt || 0))
      .slice(0, 10);

    const html = `
      <div class="reports-header">
        <h2>Reportes</h2>
        <div class="report-filters">
          <label>
            Período:
            <select id="reportPeriod">
              <option value="dia" ${period === "dia" ? "selected" : ""}>Hoy</option>
              <option value="semana" ${period === "semana" ? "selected" : ""}>Últimos 7 días</option>
              <option value="mes" ${period === "mes" ? "selected" : ""}>Este mes</option>
            </select>
          </label>
        </div>
      </div>

      <div class="reports-metrics">
        <div class="metric-card">
          <span class="label">Ventas totales</span>
          <strong>${money(totalSales)}</strong>
          <small>${int(sales.length)} transacciones</small>
        </div>
        <div class="metric-card">
          <span class="label">Cobrado</span>
          <strong>${money(collected)}</strong>
          <small>Efectivo + transferencias</small>
        </div>
        <div class="metric-card">
          <span class="label">Gastos</span>
          <strong>${money(totalExpenses)}</strong>
          <small>${int(expenses.length)} registros</small>
        </div>
        <div class="metric-card">
          <span class="label">Fiado generado</span>
          <strong>${money(totalCredit)}</strong>
          <small>A recuperar</small>
        </div>
        <div class="metric-card">
          <span class="label">Garrafones no regresados</span>
          <strong>${int(totalUnreturned)}</strong>
          <small>En el período seleccionado</small>
        </div>
      </div>

      <div class="reports-section">
        <h3>Por canal</h3>
        <div class="table-responsive">
          <table class="reports-table">
            <thead>
              <tr><th>Canal</th><th>Garrafones</th><th>No regresados</th><th>Ventas</th></tr>
            </thead>
            <tbody>
              ${byChannel.map((c) => `<tr><td>${c.channel}</td><td>${int(c.units)}</td><td class="${c.unreturned > 0 ? "amount-danger" : ""}">${int(c.unreturned)}</td><td>${money(c.sales)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="reports-section">
        <h3>Top 10 - Clientes con deuda</h3>
        <div class="table-responsive">
          <table class="reports-table">
            <thead>
              <tr><th>Cliente</th><th>Deuda</th></tr>
            </thead>
            <tbody>
              ${clientsWithDebt.map((c) => `<tr><td>${esc(c.name)}</td><td>${money(clientBalance(c.id))}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="reports-section">
        <h3>Top 10 - Garrafones pendientes por cliente</h3>
        <div class="table-responsive">
          <table class="reports-table">
            <thead>
              <tr><th>Cliente</th><th>Garrafones</th></tr>
            </thead>
            <tbody>
              ${clientsWithContainerDebt.map((c) => `<tr><td>${esc(c.name)}</td><td>${int(c.containerDebt || 0)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const container = $("reportsContent");
    if (!container) return;
    container.innerHTML = html;
    // renderReports vive dentro del IIFE, asi que no se puede llamar desde un
    // onchange inline: se reengancha el listener despues de pintar el select.
    $("reportPeriod")?.addEventListener("change", renderReports);
  }
  async function openCash(e) {
    e.preventDefault();
    if (!requirePermission("open_cash")) return;
    const u = activeUser(),
      amount = Number($("cashOpenAmount").value || 0);
    if (!u) return;
    if (amount < 0)
      return toast("El efectivo inicial no puede ser negativo.", "error");
    if (getOpenCashSession(u.id))
      return toast("Ya existe una caja abierta para este usuario", "error");
    const previousState = structuredClone(state),
      session = {
        id: uid("cash"),
        userId: u.id,
        center: u.center,
        openedAt: nowISO(),
        openingAmount: amount,
        closedAt: null,
        status: "abierta",
      };
    state.cashSessions.push(session);
    addActivity(`Caja abierta por ${u.name}`);
    audit(
      "open_cash",
      "cash",
      session.id,
      `Caja abierta con ${money(amount)}`,
      null,
      session,
    );
    if (!(await commitState(previousState))) return;
    $("cashOpenDialog").close();
    renderCash();
    toast("Caja abierta");
  }
  function openCloseCashDialog(session) {
    if (!requirePermission("close_cash")) return;
    if (!session || session.userId !== activeUser()?.id)
      return toast("No puedes cerrar la caja de otro usuario.", "error");
    const m = cashMovementsForSession(session);
    $("cashCloseSummary").innerHTML =
      `Fondo inicial: ${money(session.openingAmount)}<br>+ Ventas efectivo: ${money(m.cashSales)}<br>+ Cobros: ${money(m.cashDebtPayments)}<br>+ Otros ingresos / entregas: ${money(m.otherIncome + m.cashIncoming)}<br>- Gastos: ${money(m.cashExpenses)}<br>- Devoluciones / retiros / entregas: ${money(m.cashReturns + m.withdrawals + m.cashOutgoing)}<br>+ Ajustes posteriores: ${money(m.cashAdjustments)}<hr><strong>Efectivo esperado: ${money(m.expected)}</strong><br><small>Transferencias: ${money(m.nonCashTransfers)} · Fiado generado: ${money(m.creditGenerated)} (informativos)</small>`;
    $("cashCountedAmount").value = "";
    $("cashDifferenceReason").value = "";
    $("cashCloseComparison").classList.add("hidden");
    $("cashCloseComparison").innerHTML = "";
    $("cashCloseDialog").dataset.sessionId = session.id;
    $("cashCloseDialog").dataset.expected = String(m.expected);
    showManagedDialog($("cashCloseDialog"));
  }
  function updateCashCloseComparison() {
    const raw = $("cashCountedAmount").value;
    if (raw === "") {
      $("cashCloseComparison").classList.add("hidden");
      return;
    }
    const expected = Number($("cashCloseDialog").dataset.expected || 0),
      counted = Number(raw),
      diff = counted - expected;
    $("cashCloseComparison").innerHTML =
      `Esperado: <strong>${money(expected)}</strong><br>Contado: <strong>${money(counted)}</strong><br>Diferencia: <strong class="${Math.abs(diff) < 0.009 ? "amount-success" : "amount-danger"}">${money(diff)}</strong>`;
    $("cashCloseComparison").classList.remove("hidden");
  }
  async function closeCash(e) {
    e.preventDefault();
    if (!requirePermission("close_cash")) return;
    const s = state.cashSessions.find(
      (x) => x.id === $("cashCloseDialog").dataset.sessionId,
    );
    if (!s || s.userId !== activeUser()?.id)
      return toast("No puedes cerrar la caja de otro usuario.", "error");
    const raw = $("cashCountedAmount").value;
    if (raw === "") return toast("Captura el efectivo contado.", "error");
    const before = structuredClone(s),
      m = cashMovementsForSession(s),
      counted = Number(raw),
      diff = counted - m.expected,
      reason = $("cashDifferenceReason").value.trim();
    if (!Number.isFinite(counted) || counted < 0)
      return toast("El efectivo contado no puede ser negativo.", "error");
    if (Math.abs(diff) > 0.009 && !reason)
      return toast("Debes explicar la diferencia de caja", "error");
    const previousState = structuredClone(state);
    s.closedAt = nowISO();
    s.countedAmount = counted;
    s.expectedAmount = m.expected;
    s.difference = diff;
    s.differenceReason = reason;
    s.status = "cerrada";
    addActivity(`Caja cerrada · diferencia ${money(diff)}`);
    audit(
      "close_cash",
      "cash",
      s.id,
      `Caja cerrada; diferencia ${money(diff)}`,
      before,
      s,
    );
    if (!(await commitState(previousState))) return;
    $("cashCloseDialog").close();
    renderCash();
    toast("Caja cerrada");
  }
  function openCloseWorkDayDialog() {
    if (!requirePermission("close_work_day")) return;
    const activeRoundsWithIssues = state.rounds.filter(
      (r) => r.status !== "cerrada" && roundMetrics(r)?.inconsistencyQty > 0,
    );
    const button = $("closeWorkDayConfirmBtn");
    button.disabled = activeRoundsWithIssues.length > 0;
    if (activeRoundsWithIssues.length > 0) {
      $("closeWorkDayAlert").innerHTML = `⚠️ No se puede cerrar jornada: hay ${activeRoundsWithIssues.length} ronda(s) con inconsistencias sin resolver.`;
    } else {
      $("closeWorkDayAlert").innerHTML = "";
    }
    showManagedDialog($("closeWorkDayDialog"));
  }
  async function closeWorkDay(e) {
    if (e) e.preventDefault();
    if (!requirePermission("close_work_day")) return;
    const button = $("closeWorkDayConfirmBtn");
    if (button) button.disabled = true;
    const previousState = structuredClone(state);
    const timestamp = nowISO();
    let closedCount = 0;
    // Marca explicita de la operacion. Sin ella, cerrar una jornada que no
    // tiene cajas ni rondas abiertas produce un diff que solo toca activity y
    // audit, y el despachador de operational-store no sabe que comando central
    // invocar: aborta con "Esta operacion todavia no tiene un comando central
    // seguro". La marca es transitoria; la proyeccion del servidor no la
    // devuelve, asi que se limpia sola en el siguiente commit.
    state.workDayClosedAt = timestamp;
    state.cashSessions.forEach((session) => {
      if (!session.closedAt) {
        session.closedAt = timestamp;
        session.status = "cerrada";
        session.autoClosedWorkDay = true;
        const m = cashMovementsForSession(session);
        session.countedAmount = m.expected;
        session.expectedAmount = m.expected;
        session.difference = 0;
        session.differenceReason = "Cierre automático de jornada";
        closedCount++;
      }
    });
    state.rounds.forEach((round) => {
      if (round.status !== "cerrada") {
        round.status = "cerrada";
        round.endedAt = timestamp;
        round.closedBy = activeUser()?.id || null;
        round.autoClosedWorkDay = true;
        closedCount++;
      }
    });
    addActivity(
      `Jornada cerrada automáticamente · ${closedCount} elemento(s) cerrado(s)`,
    );
    audit(
      "close_work_day",
      "workday",
      "daily",
      `Jornada cerrada · ${closedCount} elemento(s)`,
      previousState,
      state,
    );
    if (!(await commitState(previousState))) {
      if (button) button.disabled = false;
      return;
    }
    $("closeWorkDayDialog").close();
    renderAll();
    toast(`Jornada cerrada · ${closedCount} elemento(s)`);
  }
  async function saveCashMovement(e) {
    e.preventDefault();
    if (!(adminMode && requirePermission("cash_adjustments"))) return;
    const session = getOpenCashSession(activeUser()?.id),
      type = $("cashMovementType").value,
      amount = Number($("cashMovementAmount").value),
      reason = $("cashMovementReason").value.trim();
    if (!session)
      return toast("Abre tu caja para registrar el movimiento.", "error");
    if (amount <= 0 || !reason)
      return toast("Captura monto y motivo.", "error");
    if (
      type === "withdrawal" &&
      amount > cashMovementsForSession(session).expected + 0.001
    )
      return toast("El retiro excede el efectivo esperado.", "error");
    const previousState = structuredClone(state),
      movement = {
        id: uid("cashmov"),
        date: nowISO(),
        cashSessionId: session.id,
        type,
        amount,
        reason,
        userId: activeUser().id,
      };
    state.cashMovements.push(movement);
    audit(
      type === "income" ? "cash_income" : "cash_withdrawal",
      "cash",
      movement.id,
      reason,
      null,
      movement,
    );
    if (!(await commitState(previousState))) return;
    $("cashMovementForm").reset();
    renderCash();
    toast("Movimiento de caja registrado");
  }
  async function saveCashDelivery(e) {
    e.preventDefault();
    if (!requirePermission("cash_delivery")) return;
    const from = getOpenCashSession(activeUser()?.id),
      to = state.cashSessions.find(
        (s) => s.id === $("cashDeliveryDestination").value && !s.closedAt,
      ),
      amount = Number($("cashDeliveryAmount").value),
      notes = $("cashDeliveryNotes").value.trim();
    if (!from || !to)
      return toast("Se requieren dos cajas abiertas para la entrega.", "error");
    if (amount <= 0) return toast("Captura un monto válido.", "error");
    if (amount > cashMovementsForSession(from).expected + 0.001)
      return toast(
        "La entrega excede el efectivo esperado de la caja origen.",
        "error",
      );
    const previousState = structuredClone(state),
      transfer = {
        id: uid("cashtransfer"),
        date: nowISO(),
        fromCashSessionId: from.id,
        toCashSessionId: to.id,
        fromCenter: from.center,
        toCenter: to.center,
        amount,
        deliveredBy: activeUser().id,
        receivedBy: to.userId,
        notes,
      };
    state.cashTransfers.push(transfer);
    audit(
      "cash_delivery",
      "cash_transfer",
      transfer.id,
      `Entrega interna de ${money(amount)}`,
      null,
      transfer,
    );
    if (!(await commitState(previousState))) return;
    $("cashDeliveryForm").reset();
    renderCash();
    toast("Entrega de efectivo registrada sin duplicar ingresos");
  }

  function populateLocationSelects() {
    const inventoryOptions = Object.entries(INVENTORY_LOCATION_LABELS)
      .filter(([key]) => key !== "lavado")
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("");
    ["transferFrom", "transferTo", "adjustLocation"].forEach(
      (id) => {
        const select = $(id);
        if (!select || select.innerHTML === inventoryOptions) return;
        const previousValue = select.value;
        select.innerHTML = inventoryOptions;
        if ([...select.options].some((option) => option.value === previousValue))
          select.value = previousValue;
      },
    );
    const expenseCenter = $("expenseCenter"),
      expenseOptions = ["local", "ruta1", "ruta2"]
        .map((center) => `<option value="${center}">${centerLabel(center)}</option>`)
        .join("");
    if (expenseCenter && expenseCenter.innerHTML !== expenseOptions) {
      const previousValue = expenseCenter.value;
      expenseCenter.innerHTML = expenseOptions;
      if (
        [...expenseCenter.options].some(
          (option) => option.value === previousValue,
        )
      )
        expenseCenter.value = previousValue;
    }
  }
  function renderInventory() {
    const preserveScroll =
        currentView === "inventario" &&
        $("view-inventario")?.classList.contains("active"),
      preservedScrollY = preserveScroll ? window.scrollY : null;
    populateLocationSelects();
    const groups = [
      ["Local", ["local", "empty_local", "danados"]],
      ["Ruta 1", ["ruta1", "empty_ruta1"]],
      ["Ruta 2", ["ruta2", "empty_ruta2"]],
    ];
    $("inventoryCards").innerHTML = groups
      .map(
        ([title, locations]) =>
          `<article class="inventory-location-card"><div class="inventory-location-head"><span class="eyebrow">UBICACIÓN</span><h3>${esc(title)}</h3></div>${locations
            .map((location) => {
              const label = location === "danados"
                  ? "Dañados"
                  : location.startsWith("empty_")
                      ? "Vacíos"
                      : "Llenos",
                canTransfer = location !== "danados";
              return `<div class="inventory-stock-row"><div><span>${label}</span><strong>${int(state.inventory[location] || 0)}</strong></div><div class="inventory-row-actions">${location === "empty_local" && can("rounds") ? `<button class="primary-btn" data-inventory-quick="fill" data-location="empty_local">Preparar llenos</button>` : ""}${can("adjust_inventory") ? `<button class="text-btn" data-inventory-quick="adjust" data-location="${location}">Ajustar</button>` : ""}${can("transfer_inventory") && canTransfer ? `<button class="text-btn" data-inventory-quick="transfer" data-location="${location}">Transferir</button>` : ""}</div></div>`;
            })
            .join("")}</article>`,
      )
      .join("");
    const arr = state.inventoryMovements.slice(0, 30);
    $("inventoryMovements").innerHTML = arr.length
      ? arr
          .map(
            (m) =>
              `<div class="list-row"><div class="list-main"><strong>${inventoryLocationLabel(m.location)} · ${m.delta > 0 ? "+" : ""}${m.delta}</strong><small>${esc(m.type)} · ${fmtDateTime(m.date)} · ${esc(m.notes || "")}</small></div><strong>${int(m.balance)}</strong></div>`,
          )
          .join("")
      : '<div class="empty">No hay movimientos de inventario.</div>';
    if (preserveScroll && window.scrollY !== preservedScrollY)
      window.scrollTo({
        top: preservedScrollY,
        left: 0,
        behavior: "auto",
      });
  }

  function inventoryStockType(location) {
    if (location === "danados") return "damaged";
    if (location === "lavado" || location.startsWith("empty_")) return "empty";
    return "full";
  }
  function openInventoryAdjustQuick(location) {
    if (!requirePermission("adjust_inventory")) return;
    if (!Object.hasOwn(INVENTORY_LOCATION_LABELS, location)) return;
    const current = Number(state.inventory[location] || 0);
    $("inventoryAdjustQuickForm").reset();
    $("inventoryAdjustQuickLocation").value = location;
    $("inventoryAdjustQuickTitle").textContent = inventoryLocationLabel(location);
    $("inventoryAdjustQuickCurrent").textContent = int(current);
    $("inventoryAdjustQuickQty").value = String(current);
    updateInventoryAdjustQuickDifference();
    showManagedDialog($("inventoryAdjustQuickDialog"));
  }
  function updateInventoryAdjustQuickDifference() {
    const location = $("inventoryAdjustQuickLocation").value,
      current = Number(state.inventory[location] || 0),
      next = Number($("inventoryAdjustQuickQty").value),
      difference = Number.isFinite(next) ? next - current : 0;
    $("inventoryAdjustQuickDifference").innerHTML =
      `<strong>${int(current)} → ${Number.isFinite(next) ? int(next) : "—"}</strong> · Diferencia <strong class="${difference < 0 ? "amount-danger" : "amount-success"}">${difference > 0 ? "+" : ""}${int(difference)}</strong>`;
  }
  function submitInventoryAdjustQuick(event) {
    event.preventDefault();
    const location = $("inventoryAdjustQuickLocation").value;
    $("adjustLocation").value = location;
    $("adjustQty").value = $("inventoryAdjustQuickQty").value;
    $("adjustReason").value = $("inventoryAdjustQuickReason").value.trim();
    $("inventoryAdjustQuickDialog").close();
    $("inventoryAdjustForm").requestSubmit();
  }
  function openInventoryTransferQuick(location) {
    if (!requirePermission("transfer_inventory")) return;
    if (!Object.hasOwn(INVENTORY_LOCATION_LABELS, location)) return;
    const stockType = inventoryStockType(location),
      destinations = Object.keys(INVENTORY_LOCATION_LABELS).filter(
        (candidate) =>
          candidate !== location && inventoryStockType(candidate) === stockType,
      );
    if (!destinations.length)
      return toast("No hay destinos compatibles para esta existencia.", "error");
    $("inventoryTransferQuickForm").reset();
    $("inventoryTransferQuickFrom").value = location;
    $("inventoryTransferQuickTitle").textContent =
      `${inventoryLocationLabel(location)} · ${int(state.inventory[location] || 0)} disponibles`;
    $("inventoryTransferQuickTo").innerHTML = destinations
      .map(
        (destination) =>
          `<option value="${destination}">${esc(inventoryLocationLabel(destination))}</option>`,
      )
      .join("");
    showManagedDialog($("inventoryTransferQuickDialog"));
  }
  function submitInventoryTransferQuick(event) {
    event.preventDefault();
    $("transferFrom").value = $("inventoryTransferQuickFrom").value;
    $("transferTo").value = $("inventoryTransferQuickTo").value;
    $("transferQty").value = $("inventoryTransferQuickQty").value;
    $("inventoryTransferQuickDialog").close();
    $("transferForm").requestSubmit();
  }
  async function saveTransfer(e) {
    e.preventDefault();
    e.stopPropagation();
    const form = e.currentTarget;
    if (!(form instanceof HTMLFormElement) || form.id !== "transferForm")
      return;
    if (!requirePermission("transfer_inventory")) return;
    const from = form.elements.namedItem("transferFrom")?.value || "",
      to = form.elements.namedItem("transferTo")?.value || "",
      qty = Number(form.elements.namedItem("transferQty")?.value);
    if (!from || !to)
      return toast("Selecciona origen y destino", "error");
    if (from === to)
      return toast("Origen y destino deben ser distintos", "error");
    if (!Number.isInteger(qty) || qty <= 0)
      return toast("Cantidad inválida", "error");
    const fromCheck = validateInventoryMovement(from, -qty),
      toCheck = validateInventoryMovement(to, qty);
    if (!fromCheck.valid)
      return toast(
        "Inventario insuficiente. La transferencia no fue aplicada.",
        "error",
      );
    if (!toCheck.valid)
      return toast("Movimiento de destino inválido.", "error");
    const previousState = structuredClone(state),
      before = { from: fromCheck.current, to: toCheck.current };
    recordInventoryMovement(
      from,
      -qty,
      "transferencia",
      `Hacia ${inventoryLocationLabel(to)}`,
      to,
    );
    recordInventoryMovement(
      to,
      qty,
      "transferencia",
      `Desde ${inventoryLocationLabel(from)}`,
      from,
    );
    const after = { from: state.inventory[from], to: state.inventory[to] };
    addActivity(
      `Transferencia: ${qty} garrafones ${inventoryLocationLabel(from)} → ${inventoryLocationLabel(to)}`,
    );
    audit(
      "inventory_transfer",
      "inventory",
      `${from}_${to}`,
      `Transferencia de ${qty} garrafones`,
      before,
      after,
    );
    if (!(await commitState(previousState))) return;
    renderAll();
    toast("Transferencia registrada");
  }
  async function saveInventoryAdjustment(e) {
    e.preventDefault();
    e.stopPropagation();
    const form = e.currentTarget;
    if (
      !(form instanceof HTMLFormElement) ||
      form.id !== "inventoryAdjustForm"
    )
      return;
    if (!requirePermission("adjust_inventory")) return;
    const loc = form.elements.namedItem("adjustLocation")?.value || "",
      newQty = Number(form.elements.namedItem("adjustQty")?.value),
      reason = String(
        form.elements.namedItem("adjustReason")?.value || "",
      ).trim(),
      previous = Number(state.inventory[loc] || 0);
    if (!loc || !Object.hasOwn(INVENTORY_LOCATION_LABELS, loc))
      return toast("Selecciona una ubicación válida", "error");
    if (!Number.isInteger(newQty) || newQty < 0)
      return toast(
        "El nuevo total debe ser un entero mayor o igual a cero",
        "error",
      );
    if (!reason) return toast("Escribe el motivo del ajuste", "error");
    const previousState = structuredClone(state),
      delta = newQty - previous,
      movement = recordInventoryMovement(loc, delta, "ajuste", reason, null, {
        previousValue: previous,
        newValue: newQty,
        difference: delta,
      });
    if (!movement)
      return toast("El ajuste produciría inventario inválido.", "error");
    addActivity(`Ajuste de inventario en ${inventoryLocationLabel(loc)}: ${int(newQty)}`);
    audit(
      "inventory_adjustment",
      "inventory",
      loc,
      reason,
      { value: previous },
      { value: newQty, difference: delta, movementId: movement.id },
    );
    if (!(await commitState(previousState))) return;
    renderAll();
    form.elements.namedItem("adjustReason").value = "";
    toast("Inventario ajustado");
  }

  function renderSupplies() {
    if (!$("suppliesTableBody")) return;
    const supplies = state.supplies.filter((s) => s.active !== false),
      value = supplies.reduce(
        (a, s) => a + Number(s.currentStock || 0) * Number(s.costPerUnit || 0),
        0,
      ),
      low = supplies.filter(
        (s) => Number(s.currentStock) <= Number(s.minimumStock),
      );
    $("suppliesMetrics").innerHTML = [
      metric("Insumos activos", int(supplies.length)),
      metric(
        "Stock bajo",
        int(low.length),
        low.length ? "Requiere atención" : "Sin alertas",
      ),
      metric("Valor estimado", money(value), "Existencia × costo"),
    ].join("");
    $("suppliesTableBody").innerHTML = supplies.length
      ? supplies
          .map(
            (s) =>
              `<tr><td><strong>${esc(s.name)}</strong>${Number(s.currentStock) <= Number(s.minimumStock) ? '<br><span class="low-stock">Stock bajo</span>' : ""}</td><td>${esc(s.category || "-")}</td><td>${esc(s.unit)}</td><td>${int(s.currentStock)}</td><td>${int(s.minimumStock)}</td><td>${money(Number(s.currentStock) * Number(s.costPerUnit))}</td><td><button class="text-btn edit-supply" data-id="${s.id}">Editar</button> <button class="secondary-btn move-supply" data-id="${s.id}">Movimiento</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="7"><div class="empty">No hay insumos registrados.</div></td></tr>';
    const movements = state.supplyMovements.slice(0, 80);
    $("supplyMovementsHistory").innerHTML = movements.length
      ? movements
          .map((m) => {
            const s = state.supplies.find((x) => x.id === m.supplyId);
            return `<div class="list-row"><div class="list-main"><strong>${esc(s?.name || "Insumo")} · ${m.quantity > 0 ? "+" : ""}${int(m.quantity)} ${esc(s?.unit || "")}</strong><small>${fmtDateTime(m.date)} · ${esc(m.type)} · ${esc(m.reason || "")}</small></div><strong>Saldo ${int(m.balance)}</strong></div>`;
          })
          .join("")
      : '<div class="empty">Sin movimientos de insumos.</div>';
    $$(".edit-supply").forEach(
      (b) =>
        (b.onclick = () =>
          openSupplyDialog(state.supplies.find((s) => s.id === b.dataset.id))),
    );
    $$(".move-supply").forEach(
      (b) => (b.onclick = () => openSupplyMovement(b.dataset.id)),
    );
  }
  function openSupplyDialog(supply = null) {
    if (!requirePermission("supplies")) return;
    if (!adminMode || activeUser()?.role !== "administrador")
      return toast(
        "La configuración de insumos requiere modo administrador.",
        "error",
      );
    $("supplyForm").reset();
    $("supplyDialogTitle").textContent = supply
      ? "Editar insumo"
      : "Nuevo insumo";
    $("supplyId").value = supply?.id || "";
    $("supplyName").value = supply?.name || "";
    $("supplyCategory").value = supply?.category || "";
    $("supplyUnit").value = supply?.unit || "pieza";
    $("supplyInitialStock").value = supply?.currentStock ?? 0;
    $("supplyInitialStock").disabled = Boolean(supply);
    $("supplyMinimumStock").value = supply?.minimumStock ?? 0;
    $("supplyCost").value = supply?.costPerUnit ?? 0;
    $("supplySupplier").value = supply?.supplier || "";
    $("supplyConsumptionPerUnit").value = supply?.consumptionPerUnit ?? 0;
    $("supplyNotes").value = supply?.notes || "";
    showManagedDialog($("supplyDialog"));
  }
  async function saveSupply(e) {
    e.preventDefault();
    if (!requirePermission("supplies")) return;
    if (!adminMode || activeUser()?.role !== "administrador")
      return toast(
        "La configuración de insumos requiere modo administrador.",
        "error",
      );
    const id = $("supplyId").value,
      existing = state.supplies.find((s) => s.id === id),
      name = $("supplyName").value.trim(),
      initial = Number($("supplyInitialStock").value || 0),
      minimum = Number($("supplyMinimumStock").value || 0),
      cost = Number($("supplyCost").value || 0),
      consumption = Number($("supplyConsumptionPerUnit").value || 0);
    if (!name || !$("supplyUnit").value)
      return toast("Nombre y unidad son obligatorios.", "error");
    if (
      [initial, minimum, cost, consumption].some(
        (n) => !Number.isFinite(n) || n < 0,
      )
    )
      return toast("Las cantidades y costos no pueden ser negativos.", "error");
    const previousState = structuredClone(state),
      obj = {
        id: id || window.PurificadoraCrypto.safeRandomUUID(),
        name,
        category: $("supplyCategory").value.trim(),
        unit: $("supplyUnit").value,
        currentStock: existing ? existing.currentStock : initial,
        minimumStock: minimum,
        costPerUnit: cost,
        supplier: $("supplySupplier").value.trim(),
        consumptionPerUnit: consumption,
        active: existing?.active !== false,
        notes: $("supplyNotes").value.trim(),
        createdAt: existing?.createdAt || nowISO(),
        updatedAt: nowISO(),
      };
    if (existing)
      state.supplies[state.supplies.findIndex((s) => s.id === id)] = obj;
    else {
      state.supplies.push(obj);
      if (initial > 0)
        state.supplyMovements.unshift({
          id: uid("supmov"),
          date: nowISO(),
          supplyId: obj.id,
          type: "initial",
          quantity: initial,
          balance: initial,
          costPerUnit: cost,
          userId: activeUser().id,
          reason: "Existencia inicial",
        });
    }
    audit(
      existing ? "supply_updated" : "supply_created",
      "supply",
      obj.id,
      `${existing ? "Insumo actualizado" : "Insumo creado"}: ${obj.name}`,
      existing,
      obj,
    );
    if (!(await commitState(previousState))) return;
    $("supplyDialog").close();
    renderAll();
    toast("Insumo guardado");
  }
  function openSupplyMovement(id) {
    if (!requirePermission("supplies")) return;
    const supply = state.supplies.find((s) => s.id === id);
    if (!supply) return;
    $("supplyMovementForm").reset();
    $("supplyMovementSupplyId").value = id;
    $("supplyMovementTitle").textContent = `Movimiento · ${supply.name}`;
    $("supplyMovementType").value = "purchase";
    $("supplyPurchaseUnitCost").value = supply.costPerUnit || 0;
    $("supplyPurchaseSupplier").value = supply.supplier || "";
    $("supplyMovementReason").value = "";
    updateSupplyMovementFields();
    showManagedDialog($("supplyMovementDialog"));
  }
  function updateSupplyMovementFields() {
    const type = $("supplyMovementType").value;
    $("supplyPurchaseFields").classList.toggle("hidden", type !== "purchase");
    $("supplyMovementQtyLabel").firstChild.textContent =
      type === "adjust" ? "Cantidad real" : "Cantidad";
    $("supplyMovementQty").value = "";
  }
  async function saveSupplyMovement(e) {
    e.preventDefault();
    if (!requirePermission("supplies")) return;
    const supply = state.supplies.find(
        (s) => s.id === $("supplyMovementSupplyId").value,
      ),
      type = $("supplyMovementType").value,
      qty = Number($("supplyMovementQty").value),
      reason = $("supplyMovementReason").value.trim();
    if (!supply || !Number.isFinite(qty) || qty < 0 || !reason)
      return toast("Completa cantidad y motivo.", "error");
    let delta =
      type === "adjust"
        ? qty - Number(supply.currentStock)
        : type === "consume"
          ? -qty
          : qty;
    if (type !== "adjust" && qty <= 0)
      return toast("La cantidad debe ser mayor a cero.", "error");
    if (Number(supply.currentStock) + delta < 0)
      return toast(
        `No hay existencia suficiente. El saldo sigue en ${int(supply.currentStock)}.`,
        "error",
      );
    const method = $("supplyPurchaseMethod").value,
      affectsCash =
        type === "purchase" && $("supplyPurchaseAffectsCash").value === "true",
      unitCost =
        type === "purchase"
          ? Number($("supplyPurchaseUnitCost").value || 0)
          : Number(supply.costPerUnit || 0),
      total = type === "purchase" ? qty * unitCost : 0,
      cashCheck = requireOpenCashSession({
        method: affectsCash ? method : "sin_efectivo",
        amount: affectsCash ? total : 0,
      });
    if (cashCheck.required && !cashCheck.session) return;
    const previousState = structuredClone(state),
      before = Number(supply.currentStock);
    supply.currentStock = before + delta;
    if (type === "purchase" && unitCost >= 0) supply.costPerUnit = unitCost;
    const movement = {
      id: uid("supmov"),
      date: nowISO(),
      supplyId: supply.id,
      type,
      quantity: delta,
      balance: supply.currentStock,
      costPerUnit: unitCost,
      totalCost: total,
      supplier:
        type === "purchase" ? $("supplyPurchaseSupplier").value.trim() : "",
      method: type === "purchase" ? method : null,
      affectsCash,
      userId: activeUser().id,
      reason,
      cashSessionId: cashCheck.session?.id || null,
    };
    state.supplyMovements.unshift(movement);
    if (type === "purchase") {
      state.expenses.push({
        id: uid("exp"),
        date: movement.date,
        concept: `Compra de insumo: ${supply.name}`,
        amount: total,
        center: activeUser().center,
        method,
        affectsCash,
        userId: activeUser().id,
        cashSessionId: movement.cashSessionId,
        sourceSupplyMovementId: movement.id,
        notes: reason,
      });
      audit(
        "supply_purchased",
        "supply",
        supply.id,
        reason,
        { stock: before },
        { stock: supply.currentStock, movement },
      );
    } else if (type === "consume")
      audit(
        "supply_consumed",
        "supply",
        supply.id,
        reason,
        { stock: before },
        { stock: supply.currentStock, movement },
      );
    else
      audit(
        "supply_adjusted",
        "supply",
        supply.id,
        reason,
        { stock: before },
        { stock: supply.currentStock, movement },
      );
    if (!(await commitState(previousState))) return;
    $("supplyMovementDialog").close();
    renderAll();
    toast("Movimiento de insumo registrado");
  }

  function renderMaintenance() {
    const count = Number(state.maintenance.count || 0),
      threshold = Number(state.settings.maintenanceThreshold || 375),
      pct = Math.min(100, (count / threshold) * 100);
    $("maintenanceCount").textContent = int(count);
    $("maintenanceProgress").style.width = `${pct}%`;
    $("maintenanceThreshold").value = threshold;
    $("maintenanceStatus").innerHTML =
      count >= threshold
        ? `<strong class="amount-danger">Mantenimiento requerido.</strong>`
        : count >= threshold * 0.85
          ? `<strong style="color:var(--warning)">Próximo a mantenimiento: faltan ${int(threshold - count)} garrafones.</strong>`
          : `Faltan ${int(threshold - count)} garrafones para el umbral.`;
    const h = state.maintenance.history;
    $("maintenanceHistory").innerHTML = h.length
      ? h
          .map(
            (x) =>
              `<div class="list-row"><div class="list-main"><strong>Mantenimiento registrado</strong><small>${fmtDateTime(x.date)} · ${esc(state.users.find((u) => u.id === x.userId)?.name || "")}</small></div><strong>${int(x.previousCount)} garrafones</strong></div>`,
          )
          .join("")
      : '<div class="empty">Aún no se ha registrado mantenimiento.</div>';
  }
  async function resetMaintenance() {
    if (!requirePermission("maintenance")) return;
    if (!confirm("¿Registrar mantenimiento realizado y reiniciar el contador?"))
      return;
    const previousState = structuredClone(state),
      previous = state.maintenance.count,
      entry = {
        id: uid("mnt"),
        date: nowISO(),
        previousCount: previous,
        userId: activeUser().id,
      };
    state.maintenance.history.unshift(entry);
    state.maintenance.count = 0;
    addActivity("Mantenimiento registrado y contador reiniciado");
    audit(
      "maintenance",
      "maintenance",
      entry.id,
      "Mantenimiento realizado",
      { count: previous },
      { count: 0 },
    );
    if (!(await commitState(previousState))) return;
    renderMaintenance();
    toast("Mantenimiento registrado");
  }
  async function saveMaintenanceThreshold() {
    if (!requirePermission("maintenance")) return;
    const n = Number($("maintenanceThreshold").value),
      previous = state.settings.maintenanceThreshold;
    if (n < 1) return toast("Umbral inválido", "error");
    const previousState = structuredClone(state);
    state.settings.maintenanceThreshold = n;
    audit(
      "maintenance_settings",
      "settings",
      "maintenanceThreshold",
      "Umbral de mantenimiento actualizado",
      { value: previous },
      { value: n },
    );
    if (!(await commitState(previousState))) return;
    renderMaintenance();
    toast("Umbral guardado");
  }

  function renderExpenses() {
    populateLocationSelects();
    const u = activeUser(),
      ym = monthKey(nowISO()),
      all = state.expenses.filter((e) => adminMode || e.userId === u?.id),
      arr = all.filter((e) => sameMonth(e.date, ym)),
      total = arr.reduce((a, e) => a + e.amount, 0);
    $("expenseSummary").innerHTML =
      `<div class="maintenance-count" style="font-size:48px">${money(total)}</div><p class="muted">${arr.length} gasto(s) registrados este mes</p>`;
    $("expenseHistory").innerHTML = all.length
      ? [...all]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 50)
          .map(
            (e) =>
              `<div class="list-row"><div class="list-main"><strong>${esc(e.concept)}</strong><small>${centerLabel(e.center)} · ${fmtDateTime(e.date)} · ${esc(e.method)} · ${e.affectsCash !== false ? "Salió de caja" : "No afectó caja"}</small></div><strong>${money(e.amount)}</strong></div>`,
          )
          .join("")
      : '<div class="empty">No hay gastos registrados.</div>';
  }
  async function saveExpense(e) {
    e.preventDefault();
    if (!requirePermission("create_expense")) return;
    const u = activeUser(),
      affectsCash = $("expenseAffectsCash").value === "true",
      method = $("expenseMethod").value,
      amount = Number($("expenseAmount").value);
    if (!$("expenseConcept").value.trim() || amount <= 0)
      return toast("Completa concepto y monto", "error");
    const cashCheck = requireOpenCashSession({
      method: affectsCash ? method : "sin_efectivo",
      amount: affectsCash ? amount : 0,
    });
    if (cashCheck.required && !cashCheck.session) return;
    const previousState = structuredClone(state),
      obj = {
        id: uid("exp"),
        date: nowISO(),
        concept: $("expenseConcept").value.trim(),
        amount,
        center: adminMode ? $("expenseCenter").value : u.center,
        method,
        affectsCash,
        notes: $("expenseNotes").value.trim(),
        userId: u.id,
        cashSessionId: cashCheck.session?.id || null,
      };
    state.expenses.push(obj);
    addActivity(`Gasto: ${obj.concept} · ${money(obj.amount)}`);
    audit(
      "expense",
      "expense",
      obj.id,
      `Gasto ${obj.concept}: ${money(obj.amount)}`,
      null,
      obj,
    );
    if (!(await commitState(previousState))) return;
    $("expenseForm").reset();
    $("expenseAffectsCash").value = "true";
    renderExpenses();
    renderDashboard();
    toast("Gasto registrado");
  }

  function permissionInputs() {
    return [...$("userPermissions").querySelectorAll('input[type="checkbox"]')];
  }
  function updatePermissionCount() {
    const count = permissionInputs().filter((input) => input.checked).length;
    $("userPermissionCount").textContent =
      `${count} ${count === 1 ? "permiso" : "permisos"}`;
  }
  function applyRolePermissions(role) {
    const allowed = ROLE_PERMISSIONS[role] || [];
    permissionInputs().forEach(
      (input) => (input.checked = allowed.includes(input.value)),
    );
    updatePermissionCount();
  }
  function getActiveAdministrators() {
    return state.users.filter(
      (u) => u.active !== false && u.role === "administrador",
    );
  }
  function protectsLastAdministrator(user) {
    return (
      user?.active !== false &&
      user?.role === "administrador" &&
      getActiveAdministrators().length <= 1
    );
  }
  function operatorUsername(name, currentId = "") {
    const base =
      normalizeClientText(name).replace(/\s+/g, ".").slice(0, 32) || "usuario";
    let candidate = base;
    let suffix = 2;
    while (
      state.users.some(
        (user) =>
          user.id !== currentId &&
          String(user.username || "").toLowerCase() === candidate,
      )
    ) {
      candidate = `${base.slice(0, 35)}${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
  function updateUserRoleFields() {
    const isRoute = $("userRole").value === "repartidor";
    $("userRouteField").classList.toggle("hidden", !isRoute);
    if (!isRoute) $("userCenter").value = "ruta1";
  }
  function generateUserPin() {
    const values = new Uint16Array(1);
    globalThis.crypto.getRandomValues(values);
    const input = $("userPin");
    input.type = "text";
    input.value = String(1000 + (values[0] % 9000));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    $("generateUserPinBtn").textContent = "Generado ✓";
    $("userPinHint").textContent =
      "PIN generado. Anótalo antes de crear el empleado.";
    input.focus();
  }
  function updateUserPinCopyState() {
    $("copyUserPinBtn").disabled = !/^\d{4,8}$/.test(
      $("userPin").value.trim(),
    );
  }
  async function copyUserPin() {
    const input = $("userPin"),
      pin = input.value.trim();
    if (!/^\d{4,8}$/.test(pin))
      return toast("Primero genera o escribe un PIN válido.", "error");
    try {
      await navigator.clipboard.writeText(pin);
      toast("PIN copiado");
    } catch {
      input.select();
      toast("PIN seleccionado. Usa Copiar en tu dispositivo.");
    }
  }
  function openUserDialog(user = null) {
    if (!requirePermission("users")) return;
    $("userForm").reset();
    $("userId").value = user?.id || "";
    $("userDialogTitle").textContent = user
      ? "Editar empleado"
      : "Agregar empleado";
    $("userSaveBtn").textContent = user ? "Guardar cambios" : "Crear empleado";
    $("userName").value = user?.name || "";
    $("userUsername").value = user?.username || "";
    $("userRole").value = user?.role || "ventanilla";
    $("userCenter").value = ["ruta1", "ruta2"].includes(user?.center)
      ? user.center
      : "ruta1";
    $("userPin").value = "";
    $("userPin").type = "password";
    $("generateUserPinBtn").textContent = "Generar";
    $("copyUserPinBtn").disabled = true;
    $("userPin").required = !user?.pinConfigured;
    $("userPinHint").textContent = user?.pinConfigured
      ? "Déjalo vacío para conservar el PIN actual."
      : "Se solicitará al iniciar turno.";
    const selected = user
      ? permissionsFor(user)
      : ROLE_PERMISSIONS.ventanilla || [];
    permissionInputs().forEach(
      (input) => (input.checked = selected.includes(input.value)),
    );
    updatePermissionCount();
    updateUserRoleFields();
    $("userAdvancedSettings").open = false;
    showManagedDialog($("userDialog"));
  }
  function openUserPinDialog(user) {
    openUserDialog(user);
    $("userDialogTitle").textContent = `Nuevo PIN · ${user.name}`;
    $("userSaveBtn").textContent = "Guardar PIN";
    generateUserPin();
  }
  function openDeleteUserDialog(user) {
    if (!requirePermission("users") || !user) return;
    if (user.id === activeUser()?.id)
      return toast(
        "No puedes eliminar al administrador que está usando la aplicación.",
        "error",
      );
    if (protectsLastAdministrator(user))
      return toast(
        "No puedes eliminar al último administrador activo. Crea otro administrador antes de continuar.",
        "error",
      );
    pendingUserDeleteId = user.id;
    $("deleteUserMessage").textContent = `¿Eliminar a ${user.name}?`;
    showManagedDialog($("deleteUserDialog"));
  }
  function closeDeleteUserDialog() {
    pendingUserDeleteId = null;
    if ($("deleteUserDialog").open) $("deleteUserDialog").close();
  }
  async function confirmDeleteUser() {
    if (!requirePermission("users")) return;
    const user = state.users.find((item) => item.id === pendingUserDeleteId);
    if (!user) return closeDeleteUserDialog();
    if (user.id === activeUser()?.id || protectsLastAdministrator(user)) {
      closeDeleteUserDialog();
      return toast("Este administrador está protegido y no se puede eliminar.", "error");
    }
    const previousState = structuredClone(state);
    state.users = state.users.filter((item) => item.id !== user.id);
    if (!(await commitState(previousState))) return;
    closeDeleteUserDialog();
    populateEmployeeLogin();
    renderAll();
    toast("Empleado eliminado");
  }
  function renderUsers() {
    const pinStatus = (u) => (u.pinConfigured || u.pin ? "Configurado" : "Pendiente");
    const actionButtons = (u) =>
      `<button class="text-btn edit-user" data-id="${u.id}">Editar</button><button class="text-btn change-user-pin" data-id="${u.id}">Cambiar PIN</button>${u.id === activeUser()?.id ? "" : `<button class="text-btn toggle-user" data-id="${u.id}">${u.active ? "Desactivar" : "Activar"}</button><button class="text-btn danger delete-user" data-id="${u.id}">Eliminar</button>`}`;
    $("usersTableBody").innerHTML = state.users
      .map(
        (u) =>
          `<tr><td><strong>${esc(u.name)}</strong><br><small class="muted">Usuario: ${esc(u.username)}</small></td><td>${esc(roleLabel(u.role))}</td><td>${pinStatus(u)}</td><td>${u.active ? "Activo" : "Inactivo"}</td><td>${actionButtons(u)}</td></tr>`,
      )
      .join("");
    $("usersCards").innerHTML = state.users
      .map(
        (u) =>
          `<article class="user-card"><div class="user-card-head"><div><strong>${esc(u.name)}</strong><br><small class="muted">Usuario: ${esc(u.username)}</small></div><span class="status-tag ${u.active ? "" : "void"}">${u.active ? "Activo" : "Inactivo"}</span></div><div class="user-card-meta"><span class="pill">${esc(roleLabel(u.role))}</span><span class="pill">PIN: ${pinStatus(u)}</span>${u.role === "repartidor" ? `<span class="pill">${esc(centerLabel(u.center))}</span>` : ""}</div><div class="user-card-actions">${actionButtons(u)}</div></article>`,
      )
      .join("");
    $$(".edit-user").forEach(
      (b) =>
        (b.onclick = () =>
          openUserDialog(state.users.find((x) => x.id === b.dataset.id))),
    );
    $$(".change-user-pin").forEach(
      (button) =>
        (button.onclick = () =>
          openUserPinDialog(
            state.users.find((user) => user.id === button.dataset.id),
          )),
    );
    $$(".toggle-user").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!requirePermission("users")) return;
          const u = state.users.find((x) => x.id === b.dataset.id);
          if (u.active && protectsLastAdministrator(u))
            return toast(
              "No puedes desactivar al último administrador activo. Crea otro administrador antes de continuar.",
              "error",
            );
          const previousState = structuredClone(state),
            before = structuredClone(u);
          u.active = !u.active;
          audit(
            u.active ? "activate_user" : "deactivate_user",
            "user",
            u.id,
            `${u.active ? "Activado" : "Desactivado"}: ${u.name}`,
            before,
            u,
          );
          if (!(await commitState(previousState))) return;
          renderAll();
          toast("Estado de usuario actualizado");
        }),
    );
    $$(".delete-user").forEach(
      (button) =>
        (button.onclick = () =>
          openDeleteUserDialog(
            state.users.find((user) => user.id === button.dataset.id),
          )),
    );
  }
  async function saveUser(e) {
    e.preventDefault();
    if (!requirePermission("users")) return;
    const id = $("userId").value,
      previous = state.users.find((u) => u.id === id),
      selectedPermissions = permissionInputs()
        .filter((input) => input.checked)
        .map((input) => input.value),
      name = $("userName").value.trim(),
      pin = $("userPin").value.trim(),
      obj = {
        id: id || window.PurificadoraCrypto.safeRandomUUID(),
        name,
        username:
          $("userUsername").value.trim().toLowerCase() ||
          operatorUsername(name, id),
        role: $("userRole").value,
        center:
          $("userRole").value === "repartidor"
            ? $("userCenter").value
            : "local",
        pin,
        pinConfigured: previous?.pinConfigured || Boolean(pin),
        permissions: selectedPermissions,
        active: previous?.active !== false,
      };
    if (!obj.name) return toast("Escribe el nombre del empleado.", "error");
    if (!previous?.pinConfigured && !obj.pin)
      return toast("Asigna un PIN para iniciar turno.", "error");
    if (obj.pin && !/^\d{4,8}$/.test(obj.pin))
      return toast("El PIN debe contener de 4 a 8 números", "error");
    if (
      state.users.some(
        (u) =>
          u.id !== id &&
          u.username.toLowerCase() === obj.username.toLowerCase(),
      )
    )
      return toast("Ese usuario ya existe", "error");
    obj.permissions = migratePermissions(obj.permissions, obj.role);
    if (obj.role === "administrador")
      obj.permissions = [
        ...new Set([
          ...obj.permissions,
          "view_global_debt",
          ...ESSENTIAL_ADMIN_PERMISSIONS,
        ]),
      ];
    if (
      previous &&
      protectsLastAdministrator(previous) &&
      (obj.role !== "administrador" ||
        ESSENTIAL_ADMIN_PERMISSIONS.some((p) => !obj.permissions.includes(p)))
    )
      return toast(
        "No puedes modificar el rol del último administrador activo. Crea otro administrador antes de continuar.",
        "error",
      );
    const comparableUser = (user) =>
      JSON.stringify({
        name: user?.name || "",
        username: user?.username || "",
        role: user?.role || "",
        center: user?.center || "local",
        permissions: user?.permissions || [],
        active: user?.active !== false,
      });
    if (previous && !obj.pin && comparableUser(previous) === comparableUser(obj)) {
      $("userDialog").close();
      toast("No hay cambios por guardar.");
      return;
    }
    const previousState = structuredClone(state);
    if (id) {
      state.users[state.users.findIndex((u) => u.id === id)] = obj;
      addActivity(`Empleado actualizado: ${obj.name}`);
      audit(
        "employee_updated",
        "user",
        obj.id,
        `Empleado actualizado: ${obj.name}`,
        previous,
        obj,
      );
    } else {
      state.users.push(obj);
      addActivity(`Empleado creado: ${obj.name}`);
      audit(
        "employee_created",
        "user",
        obj.id,
        `Empleado creado: ${obj.name}`,
        null,
        obj,
      );
    }
    if (!(await commitState(previousState))) return;
    if (obj.id === employeeSession?.userId && obj.role !== "administrador") {
      adminMode = false;
      clearTimeout(adminTimer);
      document.body.classList.remove("admin-mode");
    }
    $("userDialog").close();
    populateEmployeeLogin();
    renderAll();
    toast("Empleado guardado");
  }

  function renderSettings() {
    $("businessName").value = state.settings.businessName;
    $("defaultPrice").value = state.settings.defaultPrice;
  }
  async function saveSettings() {
    if (!(adminMode && requirePermission("settings")))
      return toast(
        "Activa el modo administrador para cambiar el precio general.",
        "error",
      );
    if (!(await requestAdminReauth("guardar precio y configuración"))) return;
    const name = $("businessName").value.trim(),
      price = Number($("defaultPrice").value);
    if (!name || price < 0) return toast("Revisa los datos", "error");
    const previousState = structuredClone(state),
      before = {
        businessName: state.settings.businessName,
        defaultPrice: state.settings.defaultPrice,
      },
      after = { businessName: name, defaultPrice: price };
    state.settings.businessName = name;
    state.settings.defaultPrice = price;
    audit(
      before.defaultPrice !== price ? "price_changed" : "settings",
      "settings",
      "general",
      before.defaultPrice !== price
        ? `Precio general actualizado a ${money(price)}`
        : "Configuración general actualizada",
      before,
      after,
    );
    if (!(await commitState(previousState))) return;
    resetSaleForm();
    toast("Precio y configuración guardados");
  }
  function exportBackup() {
    if (!requirePermission("backups")) return;
    audit("export_backup", "system", "backup", "Respaldo exportado");
    saveState();
    const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `purificadora-trujillo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function validateBackup(data) {
    const required = [
      "users",
      "clients",
      "sales",
      "ledger",
      "expenses",
      "cashSessions",
      "inventory",
      "inventoryMovements",
      "maintenance",
    ];
    if (!data || typeof data !== "object" || !Number.isInteger(data.version))
      throw new Error("Versión inválida");
    required.forEach((k) => {
      if (!(k in data)) throw new Error(`Falta ${k}`);
    });
    [
      "users",
      "clients",
      "sales",
      "ledger",
      "expenses",
      "cashSessions",
      "inventoryMovements",
    ].forEach((k) => {
      if (!Array.isArray(data[k])) throw new Error(`${k} debe ser una lista`);
    });
    const coreLocations = ["local", "ruta1", "ruta2", "lavado", "danados"];
    if (
      !data.inventory ||
      coreLocations.some(
        (k) =>
          !Number.isFinite(Number(data.inventory[k])) ||
          Number(data.inventory[k]) < 0,
      )
    )
      throw new Error("Inventario inválido");
    if (!data.settings || !Number.isFinite(Number(data.settings.defaultPrice)))
      throw new Error("Configuración inválida");
    return true;
  }
  async function importBackup(e) {
    if (!requirePermission("backups")) {
      e.target.value = "";
      return;
    }
    if (state.central) {
      e.target.value = "";
      return toast(
        "La operación central no admite importar un respaldo local. El archivo no modificó Supabase.",
        "error",
      );
    }
    if (!(await requestAdminReauth("restaurar un respaldo"))) {
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const previousState = structuredClone(state);
      try {
        const parsed = JSON.parse(r.result);
        validateBackup(parsed);
        const currentUser = activeUser(),
          candidate = hydrateState(parsed);
        candidate.revision = loadedRevision;
        state = candidate;
        if (
          !state.users.some((u) => u.id === employeeSession?.userId && u.active)
        ) {
          employeeSession = null;
          sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
        }
        audit(
          "import_backup",
          "system",
          "backup",
          `Respaldo restaurado por ${currentUser?.name || "usuario"}`,
        );
        if (!saveState())
          throw new Error("No se pudo verificar la escritura del respaldo");
        renderAll();
        showView("dashboard");
        toast("Respaldo restaurado");
        if (!employeeSession) openAccessChoice({ clearPending: true });
      } catch (err) {
        state = previousState;
        renderAll();
        console.error(err);
        toast(`No se pudo importar: ${err.message}`, "error");
      }
    };
    r.readAsText(file);
    e.target.value = "";
  }
  function resetApp() {
    if (!requirePermission("reset_data")) return;
    $("resetDataForm").reset();
    $("resetDataError").textContent = "";
    updateResetButton();
    $("resetDataDialog").showModal();
  }
  function updateResetButton() {
    const ok =
      /^\d{4,8}$/.test($("resetAdminPin").value.trim()) &&
      $("resetConfirmText").value.trim() === "BORRAR";
    $("confirmResetBtn").disabled = !ok;
  }
  async function confirmResetApp(e) {
    e.preventDefault();
    if (!recoveryRequired && !requirePermission("reset_data")) return;
    if (state.central) {
      $("resetDataError").textContent =
        "El reinicio de datos centrales está bloqueado. No se modificó Supabase.";
      return;
    }
    if (
      !(await validateAdminPin($("resetAdminPin").value.trim())) ||
      $("resetConfirmText").value.trim() !== "BORRAR"
    ) {
      $("resetDataError").textContent =
        "PIN incorrecto o confirmación inválida.";
      updateResetButton();
      return;
    }
    const previousState = structuredClone(state),
      actor = activeUser(),
      wasRecovery = recoveryRequired;
    recoveryRequired = false;
    state = defaultState();
    state.revision = loadedRevision;
    audit(
      "reset_data",
      "system",
      "all",
      `Datos borrados por ${actor?.name || "administrador"}`,
      { erased: true },
      { freshInstall: true },
    );
    if (!saveState({ skipConflict: wasRecovery })) {
      state = previousState;
      recoveryRequired = wasRecovery;
      renderAll();
      return toast(
        "No se pudo reiniciar el sistema. Los datos anteriores no fueron confirmados como borrados.",
        "error",
      );
    }
    $("resetDataDialog").close();
    employeeSession = { userId: "usr_admin", startedAt: nowISO() };
    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, "usr_admin");
    renderAll();
    showView("dashboard");
    toast("Datos locales eliminados y sistema reiniciado");
  }
  function validPreviousState() {
    const raw = localStorage.getItem(PREVIOUS_STORAGE_KEY);
    if (!raw) return false;
    try {
      validateBackup(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }
  function downloadRawState() {
    const blob = new Blob([recoveryRaw], { type: "text/plain;charset=utf-8" }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `purificadora-datos-sin-procesar-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function restorePreviousState() {
    if (state.central) {
      return toast(
        "La operación central no puede reemplazarse con una copia local. Supabase no fue modificado.",
        "error",
      );
    }
    const raw = localStorage.getItem(PREVIOUS_STORAGE_KEY);
    try {
      const parsed = JSON.parse(raw || "");
      validateBackup(parsed);
      const restored = hydrateState(parsed);
      localStorage.setItem(STORAGE_KEY, raw);
      state = restored;
      loadedRevision = restored.revision;
      recoveryRequired = false;
      recoveryRaw = "";
      stateConflict = false;
      if (!saveState({ skipConflict: true }))
        throw new Error("No se pudo verificar la restauración");
      $("recoveryDialog").close();
      sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
      employeeSession = null;
      renderAll();
      openAccessChoice({ clearPending: true });
      toast("Última copia válida restaurada");
    } catch (error) {
      console.error(error);
      toast(
        "No se pudo restaurar la copia anterior. Descarga los datos sin procesar.",
        "error",
      );
    }
  }
  function openRecoveryReset() {
    $("recoveryDialog").close();
    $("resetDataForm").reset();
    $("resetDataError").textContent = "";
    updateResetButton();
    $("resetDataDialog").showModal();
  }
  function handleExternalStorageChange(event) {
    if (state.central) return;
    if (
      ![STORAGE_KEY, LEGACY_STORAGE_KEY].includes(event.key) ||
      !event.newValue
    )
      return;
    if (event.key === LEGACY_STORAGE_KEY)
      return showStorageConflict(Number.MAX_SAFE_INTEGER);
    try {
      const revision = Number(JSON.parse(event.newValue).revision || 0);
      if (revision > loadedRevision) showStorageConflict(revision);
    } catch {
      showStorageConflict(Number.MAX_SAFE_INTEGER);
    }
  }
  function reloadExternalState() {
    if (state.central) {
      $("storageConflictDialog")?.close();
      return toast(
        "La operación central se actualiza desde Supabase, no desde otra pestaña local.",
        "error",
      );
    }
    try {
      const raw =
          localStorage.getItem(STORAGE_KEY) ??
          localStorage.getItem(LEGACY_STORAGE_KEY),
        parsed = JSON.parse(raw || "");
      validateBackup(parsed);
      state = hydrateState(parsed);
      loadedRevision = state.revision;
      stateConflict = false;
      externalRevision = 0;
      $("storageConflictDialog").close();
      if (
        !state.users.some((u) => u.id === employeeSession?.userId && u.active)
      ) {
        sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
        employeeSession = null;
      }
      renderAll();
      showView("dashboard");
      if (!employeeSession) openAccessChoice({ clearPending: true });
      toast("Datos recargados desde la otra pestaña");
    } catch (error) {
      console.error(error);
      toast("No se pudieron recargar los datos externos.", "error");
    }
  }
  function renderAudit() {
    if (!$("auditList")) return;
    const q = $("auditSearch").value.trim().toLowerCase(),
      items = state.audit.filter((a) =>
        [a.userName, a.action, a.entity, a.description].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    const today = state.audit.filter((a) => sameDay(a.timestamp)).length,
      users = new Set(state.audit.map((a) => a.userId).filter(Boolean)).size;
    $("auditMetrics").innerHTML = [
      metric("Eventos", int(state.audit.length), "Historial conservado"),
      metric("Hoy", int(today), "Acciones auditadas"),
      metric("Usuarios", int(users), "Con actividad"),
    ].join("");
    $("auditList").innerHTML = items.length
      ? items
          .slice(0, 300)
          .map(
            (a) =>
              `<div class="audit-item"><div class="list-main"><strong>${esc(a.description || a.action)}</strong><small>${fmtDateTime(a.timestamp)} · ${esc(a.userName || "Sin sesión")} · ${esc(a.action)} · ${esc(a.entity)}${a.entityId ? ` #${esc(a.entityId)}` : ""}</small></div>${a.before != null || a.after != null ? `<details><summary>Ver cambios</summary><pre>${esc(JSON.stringify({ antes: a.before, después: a.after }, null, 2))}</pre></details>` : ""}</div>`,
          )
          .join("")
      : '<div class="empty">No hay eventos que coincidan.</div>';
  }

  function applyCentralState(projection, profile) {
    const pendingSaleDraft = captureSaleDraftForRefresh();
    const sidebarWasOpen = $("sidebar")?.classList.contains("open") === true;
    const previousEmployeeId = employeeSession?.userId || null;
    const wasAdminMode = adminMode;
    state = hydrateState(projection);
    state.central = true;
    recoveryRequired = false;
    stateConflict = false;
    externalRevision = 0;
    const employeeStillValid = state.users.find(
      (user) => user.id === previousEmployeeId && user.active,
    );
    employeeSession = employeeStillValid
      ? { userId: employeeStillValid.id, startedAt: nowISO() }
      : null;
    state.activeUserId = employeeStillValid?.id || null;
    if (employeeStillValid)
      sessionStorage.setItem(EMPLOYEE_SESSION_KEY, employeeStillValid.id);
    else sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    if ($("storageConflictDialog")?.open) $("storageConflictDialog").close();
    adminMode = Boolean(
      wasAdminMode && employeeStillValid?.role === "administrador",
    );
    document.body.classList.toggle("admin-mode", adminMode);
    resetSaleForm();
    renderAll();
    if (employeeStillValid)
      showView(currentView || "dashboard", {
        preserveSidebar: sidebarWasOpen,
      });
    else $("sidebar")?.classList.remove("open");
    restoreSaleDraftAfterRefresh(pendingSaleDraft);
  }

  function lockCentralState() {
    employeeSession = null;
    adminMode = false;
    document.body.classList.remove("admin-mode");
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    centralAccessState = "unavailable";
    updateAccessChoiceStatus();
    toast(
      "La cuenta central se desconectó. Inicia sesión para continuar.",
      "error",
    );
  }

  window.PurificadoraApp = Object.freeze({
    getState: () => structuredClone(state),
    applyCentralState,
    lockCentralState,
  });

  init();
})();
