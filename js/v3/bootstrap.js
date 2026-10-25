import {
  supabase as client,
  SUPABASE_CONFIG,
  SUPABASE_CLIENT_BUILD,
  getDeviceId,
  getDeviceName,
  setRememberDevicePreference,
  REMEMBERED_EMAIL_KEY,
} from "../data/supabase-client.js?v=20261025-movil-ventanas";
import { OperationalStore } from "../data/operational-store.js?v=20261025-movil-ventanas";
import { profilesRepository } from "../data/profiles-repository.js?v=20261025-movil-ventanas";
import { clientsRepository } from "../data/clients-repository.js?v=20261025-movil-ventanas";
import { salesRepository } from "../data/sales-repository.js?v=20261025-movil-ventanas";
import { ledgerRepository } from "../data/ledger-repository.js?v=20261025-movil-ventanas";
import { cashRepository } from "../data/cash-repository.js?v=20261025-movil-ventanas";
import { roundsRepository } from "../data/rounds-repository.js?v=20261025-movil-ventanas";
import { inventoryRepository } from "../data/inventory-repository.js?v=20261025-movil-ventanas";
import { returnsRepository } from "../data/returns-repository.js?v=20261025-movil-ventanas";
import { correctionsRepository } from "../data/corrections-repository.js?v=20261025-movil-ventanas";
import { suppliesRepository } from "../data/supplies-repository.js?v=20261025-movil-ventanas";
import { maintenanceRepository } from "../data/maintenance-repository.js?v=20261025-movil-ventanas";
import { workDaysRepository } from "../data/work-days-repository.js?v=20261025-movil-ventanas";
import { toCents, fromCents, formatMoney } from "./money.js?v=20261025-movil-ventanas";

const BOOTSTRAP_BUILD = "20261025-movil-ventanas";
const APP_BUILD =
  document.querySelector('meta[name="app-build"]')?.content || "No disponible";
const APP_SCRIPT_BUILD = window.PurificadoraAppScriptBuild || "No cargado";
const CENTRAL_AUTH_UI_BUILD =
  window.PurificadoraCentralAuthUi?.BUILD || "No cargado";
const store = new OperationalStore();
let refreshTimer = null;
let realtimeChannel = null;
let refreshInFlight = false;
let queuedRefreshSource = null;
let realtimeRefreshTimer = null;
let sessionResumeInFlight = false;
let lastSnapshotWriteAt = 0;
const CENTRAL_REFRESH_INTERVAL_MS = 10000;
const CENTRAL_CONFIGURED_KEY = "purificadora_v3_central_configured";
const CENTRAL_AUTH_REQUIRED_EVENT = "purificadora:central-auth-required";
const REALTIME_STATUSES = Object.freeze([
  "SUBSCRIBED",
  "CHANNEL_ERROR",
  "TIMED_OUT",
  "CLOSED",
]);
const REALTIME_TABLES = Object.freeze([
  "profiles",
  "clients",
  "cash_sessions",
  "rounds",
  "sales",
  "sale_corrections",
  "sale_returns",
  "sale_cash_adjustments",
  "payments",
  "ledger_entries",
  "cash_movements",
  "expenses",
  "inventory_locations",
  "inventory_movements",
  "supplies",
  "supply_movements",
  "maintenance_events",
  "settings",
  "audit_log",
]);
const diagnosticState = {
  userId: null,
  profileId: null,
  role: null,
  centralMode: false,
  lastServerRefresh: null,
  realtime: "CLOSED",
  realtimeError: null,
  lastReceivedEvent: null,
  lastQueryRowCount: null,
  lastRefreshSource: null,
  lastAuthUiEvent: null,
  serviceWorkerBuild: "Consultando",
  cacheVersion: "Consultando",
  buildStatus: "Verificando",
};

function emitCentralAccessState(ready, reason = "") {
  window.dispatchEvent(
    new CustomEvent("purificadora:central-access", {
      detail: {
        ready: Boolean(ready),
        reason: String(reason || ""),
        profileId: ready ? diagnosticState.profileId : null,
        role: ready ? diagnosticState.role : null,
      },
    }),
  );
}

function sanitizeDiagnosticError(error) {
  const source = error?.message || error?.error || error?.reason || error;
  if (!source) return null;
  return String(source)
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]")
    .replace(/sb_[A-Za-z0-9_-]+/g, "[key]")
    .slice(0, 240);
}

function ensureDiagnosticPanel() {
  const existing = document.getElementById("v3DiagnosticPanel");
  if (existing) return existing;
  const host = document.getElementById("v3DiagnosticHost");
  if (!host) return null;
  const panel = document.createElement("details");
  panel.id = "v3DiagnosticPanel";
  panel.className = "v3-diagnostic-panel";
  panel.open = true;
  panel.innerHTML =
    '<summary>Diagnóstico central</summary><pre id="v3DiagnosticContent"></pre>';
  host.appendChild(panel);
  return panel;
}

function renderDiagnosticPanel() {
  const panel = ensureDiagnosticPanel();
  if (!panel) return;
  const content = panel.querySelector("#v3DiagnosticContent");
  const formatTime = (value) =>
    value ? new Date(value).toLocaleTimeString() : "Nunca";
  content.textContent = [
    `App URL: ${window.location.origin}${window.location.pathname}`,
    `App build: ${APP_BUILD}`,
    `App script build: ${APP_SCRIPT_BUILD}`,
    `Bootstrap build: ${BOOTSTRAP_BUILD}`,
    `Central auth UI build: ${CENTRAL_AUTH_UI_BUILD}`,
    `supabase-client build: ${SUPABASE_CLIENT_BUILD}`,
    `Service worker build: ${diagnosticState.serviceWorkerBuild}`,
    `Service-worker/cache version: ${diagnosticState.cacheVersion}`,
    `Build status: ${diagnosticState.buildStatus}`,
    `Project URL: ${SUPABASE_CONFIG.url}`,
    `User ID: ${diagnosticState.userId || "Sin sesión"}`,
    `Profile ID: ${diagnosticState.profileId || "No disponible"}`,
    `Role: ${diagnosticState.role || "No disponible"}`,
    `Central mode: ${diagnosticState.centralMode}`,
    `Last server refresh: ${formatTime(diagnosticState.lastServerRefresh)}`,
    `Last refresh source: ${diagnosticState.lastRefreshSource || "Ninguno"}`,
    `Realtime: ${diagnosticState.realtime}`,
    `Realtime error: ${diagnosticState.realtimeError || "Ninguno"}`,
    `Last received event: ${diagnosticState.lastReceivedEvent || "Ninguno"}`,
    `Last query row count: ${diagnosticState.lastQueryRowCount ?? "Sin consulta"} (sales)`,
    `Auth UI event: ${diagnosticState.lastAuthUiEvent || "Ninguno"}`,
  ].join("\n");
  // Resumen de la cola offline (asincrono, se anexa sin bloquear).
  window.PurificadoraOfflineStore?.queueSummary?.()
    .then((summary) => {
      if (!panel.isConnected) return;
      content.textContent += `\nCola offline: ${summary.total} total · ${summary.pending} pendientes · ${summary.failed} con error/conflicto`;
      if (summary.total) {
        const detail = Object.entries(summary.byType)
          .map(([type, count]) => `${type}(${count})`)
          .join(", ");
        content.textContent += `\n  ${detail}`;
      }
    })
    .catch(() => {});
}

async function invalidateMixedBuilds(reason) {
  diagnosticState.buildStatus = `MEZCLA DETECTADA: ${reason}`;
  renderDiagnosticPanel();
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("purificadora-trujillo-"))
          .map((key) => caches.delete(key)),
      );
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    const reloadKey = `purificadora-build-reload-${BOOTSTRAP_BUILD}`;
    if (navigator.onLine && !sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, "1");
      await Promise.race([
        new Promise((resolve) =>
          navigator.serviceWorker.addEventListener("controllerchange", resolve, {
            once: true,
          }),
        ),
        new Promise((resolve) => window.setTimeout(resolve, 1800)),
      ]);
      const url = new URL(window.location.href);
      url.searchParams.set("build", BOOTSTRAP_BUILD);
      window.location.replace(url.href);
    }
  } catch (error) {
    diagnosticState.buildStatus = `ERROR AL INVALIDAR: ${sanitizeDiagnosticError(error)}`;
    renderDiagnosticPanel();
  }
}

function verifyBuildConsistency() {
  const localBuilds = [
    APP_BUILD,
    APP_SCRIPT_BUILD,
    BOOTSTRAP_BUILD,
    CENTRAL_AUTH_UI_BUILD,
  ];
  const localMismatch = localBuilds.some((build) => build !== BOOTSTRAP_BUILD);
  const swKnown = !["Consultando", "Sin controlador", "Sin respuesta"].includes(
    diagnosticState.serviceWorkerBuild,
  );
  const swMismatch =
    swKnown && diagnosticState.serviceWorkerBuild !== BOOTSTRAP_BUILD;
  if (localMismatch || swMismatch) {
    const reason = [
      `app=${APP_BUILD}`,
      `app-script=${APP_SCRIPT_BUILD}`,
      `bootstrap=${BOOTSTRAP_BUILD}`,
      `central-auth-ui=${CENTRAL_AUTH_UI_BUILD}`,
      `sw=${diagnosticState.serviceWorkerBuild}`,
    ].join(", ");
    invalidateMixedBuilds(reason);
    return false;
  }
  diagnosticState.buildStatus = swKnown ? "COINCIDEN" : "CÓDIGO COINCIDE; SW PENDIENTE";
  renderDiagnosticPanel();
  return true;
}

function inspectServiceWorkerBuild() {
  if (!("serviceWorker" in navigator)) {
    diagnosticState.serviceWorkerBuild = "No compatible";
    diagnosticState.cacheVersion = "No compatible";
    verifyBuildConsistency();
    return;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "PURIFICADORA_BUILD") return;
    diagnosticState.serviceWorkerBuild = event.data.build || "Sin respuesta";
    diagnosticState.cacheVersion = event.data.cache || "Sin respuesta";
    verifyBuildConsistency();
  });
  const requestBuild = () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      diagnosticState.serviceWorkerBuild = "Sin controlador";
      diagnosticState.cacheVersion = "Sin controlador";
      verifyBuildConsistency();
      return;
    }
    controller.postMessage({ type: "GET_PURIFICADORA_BUILD" });
  };
  requestBuild();
  navigator.serviceWorker.ready.then(requestBuild).catch((error) => {
    diagnosticState.serviceWorkerBuild = `ERROR: ${sanitizeDiagnosticError(error)}`;
    diagnosticState.cacheVersion = "No disponible";
    renderDiagnosticPanel();
  });
}

function ensureBackendBadge() {
  const existing = document.getElementById("v3BackendBadge");
  if (existing) return existing;
  const badge = document.createElement("button");
  badge.id = "v3BackendBadge";
  badge.type = "button";
  badge.className = "status-badge central-status-btn offline";
  badge.textContent = "Central verificando…";
  badge.title = "Abrir conexión con la cuenta central";
  badge.setAttribute("aria-haspopup", "dialog");
  document
    .getElementById("onlineBadge")
    ?.insertAdjacentElement("afterend", badge);
  return badge;
}

function setBackendStatus(text, connected = false) {
  const badge = ensureBackendBadge();
  const centralConnected = /Central conectado|Cuenta conectada/i.test(text);
  const noConnection = /sin conexión/i.test(text);
  badge.hidden = centralConnected || noConnection;
  badge.textContent = /expirada/i.test(text)
    ? "Reconectar"
    : /disponible|inicia sesión|verificando/i.test(text)
      ? "Conectar"
      : text;
  badge.setAttribute("aria-label", text);
  badge.classList.toggle("offline", !connected);
}

function setAuthButton(session, profile = null) {
  const button = document.getElementById("v3OpenAuthBtn");
  if (!button) return;
  const notice = document.getElementById("centralSessionNotice");
  const wasConfigured = localStorage.getItem(CENTRAL_CONFIGURED_KEY) === "true";
  if (session) localStorage.setItem(CENTRAL_CONFIGURED_KEY, "true");
  button.textContent = session
    ? "En línea"
    : wasConfigured
      ? "Reconectar cuenta central"
      : "Conectar cuenta central";
  button.hidden = false;
  button.disabled = Boolean(session);
  button.classList.toggle("v3-authenticated", Boolean(session));
  button.classList.toggle("is-connected", Boolean(session));
  if (notice) {
    notice.hidden = Boolean(session);
    notice.textContent = session
      ? ""
      : wasConfigured
        ? "Sesión central expirada. Reconecta la cuenta para continuar."
        : "Configura la cuenta central una sola vez en este dispositivo.";
    notice.classList.toggle("is-connected", Boolean(session));
  }
}

async function hydrateOperationalState(source = "manual") {
  if (refreshInFlight) {
    queuedRefreshSource = source;
    return null;
  }
  const app = window.PurificadoraApp;
  if (!app) return null;
  refreshInFlight = true;
  try {
    const projection = await store.load(app.getState());
    app.applyCentralState(projection, store.profile);
    diagnosticState.profileId = store.profile?.id || null;
    diagnosticState.role = store.profile?.role || null;
    diagnosticState.centralMode = projection?.central === true;
    diagnosticState.lastServerRefresh = new Date().toISOString();
    diagnosticState.lastQueryRowCount = projection?.sales?.length ?? 0;
    diagnosticState.lastRefreshSource = source;
    renderDiagnosticPanel();
    setBackendStatus("Central conectado · operación V3 online", true);
    emitCentralAccessState(true, source);
    // Espejo local para el modo offline (con throttle para no escribir a cada
    // poll de 10 s).
    const offlineApi = window.PurificadoraOfflineStore;
    if (offlineApi) {
      const now = Date.now();
      if (!lastSnapshotWriteAt || now - lastSnapshotWriteAt > 15000) {
        lastSnapshotWriteAt = now;
        offlineApi
          .saveSnapshot(projection, { profile: store.profile, source })
          .catch((error) =>
            console.warn("No se pudo guardar el espejo offline", error),
          );
        offlineApi.setCachedProfile(store.profile).catch(() => {});
        offlineApi.setLastSyncAt().catch(() => {});
      }
    }
    return projection;
  } finally {
    refreshInFlight = false;
    if (queuedRefreshSource) {
      const nextSource = queuedRefreshSource;
      queuedRefreshSource = null;
      window.setTimeout(() => {
        hydrateOperationalState(nextSource).catch((error) =>
          console.warn(
            "No se pudo actualizar la proyeccion central",
            sanitizeDiagnosticError(error),
          ),
        );
      }, 0);
    }
  }
}

function scheduleRealtimeRefresh(source = "realtime") {
  if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => {
    realtimeRefreshTimer = null;
    hydrateOperationalState(source).catch((error) =>
      console.warn(
        "No se pudo actualizar la proyeccion central",
        sanitizeDiagnosticError(error),
      ),
    );
  }, 150);
}

function handleRealtimeEvent(payload) {
  diagnosticState.lastReceivedEvent = `${payload.eventType || "EVENT"} public.${payload.table || "?"} · ${new Date().toLocaleTimeString()}`;
  renderDiagnosticPanel();
  scheduleRealtimeRefresh(`realtime:${payload.table || "unknown"}`);
}

function updateRealtimeStatus(status, error = null) {
  const reportedStatus = String(status || "CLOSED").toUpperCase();
  const exactStatus = REALTIME_STATUSES.includes(reportedStatus)
    ? reportedStatus
    : "CHANNEL_ERROR";
  diagnosticState.realtime = exactStatus;
  diagnosticState.realtimeError = sanitizeDiagnosticError(
    error ||
      (reportedStatus !== exactStatus
        ? `Unexpected channel status: ${reportedStatus}`
        : null),
  );
  renderDiagnosticPanel();
  if (exactStatus !== "SUBSCRIBED") {
    console.warn("Supabase Realtime subscription", {
      status: exactStatus,
      error: diagnosticState.realtimeError,
    });
  }
}

function startCentralRefresh() {
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        hydrateOperationalState("polling").catch((error) =>
          console.warn(
            "No se pudo actualizar la proyección central",
            sanitizeDiagnosticError(error),
          ),
        );
    }, CENTRAL_REFRESH_INTERVAL_MS);
  }
  if (!realtimeChannel) {
    let channel = client.channel(`purificadora-v3-${getDeviceId()}`);
    REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        handleRealtimeEvent,
      );
    });
    realtimeChannel = channel.subscribe(updateRealtimeStatus);
  }
}

async function stopCentralRefresh() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
  if (realtimeChannel) await client.removeChannel(realtimeChannel);
  realtimeChannel = null;
  if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = null;
  diagnosticState.realtime = "CLOSED";
  diagnosticState.realtimeError = null;
  renderDiagnosticPanel();
}

async function checkBackend() {
  try {
    const { data } = await client.auth.getSession();
    diagnosticState.userId = data.session?.user?.id || null;
    setAuthButton(data.session, null);
    const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/health`, {
      headers: { apikey: SUPABASE_CONFIG.publishableKey },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let profile = null;
    if (data.session) {
      try {
        profile = await currentProfile();
      } catch (error) {
        console.warn("Perfil central no disponible", error);
      }
    }
    setAuthButton(data.session, profile);
    diagnosticState.profileId = profile?.id || null;
    diagnosticState.role = profile?.role || null;
    diagnosticState.centralMode = false;
    renderDiagnosticPanel();
    setBackendStatus(
      data.session
        ? "Cuenta conectada · cargando operación central"
        : localStorage.getItem(CENTRAL_CONFIGURED_KEY) === "true"
          ? "Sesión central expirada"
          : "Central disponible · inicia sesión",
      true,
    );
    if (data.session && profile?.active) {
      await hydrateOperationalState("startup");
      startCentralRefresh();
    } else {
      emitCentralAccessState(false, data.session ? "profile-inactive" : "no-session");
    }
    return true;
  } catch (error) {
    console.warn("Backend central no disponible", error);
    setBackendStatus("Central sin conexión", false);
    diagnosticState.centralMode = false;
    diagnosticState.realtime = "CLOSED";
    diagnosticState.realtimeError = sanitizeDiagnosticError(error);
    renderDiagnosticPanel();
    const restored = await restoreOfflineSnapshot();
    if (!restored) emitCentralAccessState(false, "backend-unavailable");
    return false;
  }
}

// Abre la app con los datos del ultimo sync guardados localmente (modo offline).
async function restoreOfflineSnapshot() {
  const app = window.PurificadoraApp;
  const offlineApi = window.PurificadoraOfflineStore;
  if (!app || !offlineApi) return false;
  // Si ya hay estado local persistido (operaciones offline guardadas en
  // localStorage), se prefiere; si no, el snapshot de IndexedDB.
  const current =
    typeof app.getState === "function" ? app.getState() : null;
  const currentRev = Number(current?.revision || 0);
  const snapshot = await offlineApi.loadSnapshot();
  const snapshotRev = Number(snapshot?.state?.revision || 0);
  const source =
    current && currentRev > 0 && currentRev >= snapshotRev
      ? current
      : snapshot?.state;
  if (!source) return false;
  const profile =
    (await offlineApi.getCachedProfile()) || snapshot?.meta?.profile || null;
  app.applyCentralState(source, profile, { offline: true });
  setBackendStatus(
    "Sin conexión · operando con datos locales (última sincronización)",
    false,
  );
  emitCentralAccessState(false, "offline-cache");
  renderPendingQueueBadge();
  renderQueuePanel();
  return true;
}

// Reenvia la cola de operaciones offline al servidor, en orden, reutilizando
// el mismo operationId (idempotente) para no duplicar en reintentos.
const syncHandlers = {
  register_sale: (sale, opId) =>
    salesRepository.create({ ...sale, operationId: opId }),
  register_payment: (payment, opId) =>
    ledgerRepository.registerPayment({ ...payment, operationId: opId }),
  create_client: (client, opId) =>
    clientsRepository.create({ ...client, operationId: opId }),
  update_client: (client, opId) =>
    clientsRepository.update({ ...client, operationId: opId }),
  open_cash_session: (session, opId) =>
    cashRepository.open({ ...session, operationId: opId }),
  close_cash_session: (session, opId) =>
    cashRepository.close({ ...session, operationId: opId }),
  register_cash_movement: (movement, opId) =>
    cashRepository.movement({ ...movement, operationId: opId }),
  create_expense: (expense, opId) =>
    cashRepository.createExpense({ ...expense, operationId: opId }),
  start_round: (round, opId) =>
    roundsRepository.start({ ...round, operationId: opId }),
  reload_round: (round, opId) =>
    roundsRepository.reload({ ...round, operationId: opId }),
  register_round_return: (round, opId) =>
    roundsRepository.registerReturn({ ...round, operationId: opId }),
  finalize_round_close: (round, opId) =>
    roundsRepository.finalize({ ...round, operationId: opId }),
  transfer_inventory: (movement, opId) =>
    inventoryRepository.transfer({ ...movement, operationId: opId }),
  adjust_inventory: (movement, opId) =>
    inventoryRepository.adjust({ ...movement, operationId: opId }),
  return_sale: (entry, opId) =>
    returnsRepository.create({ ...entry, operationId: opId }),
  void_sale: ({ correction, cashSessionId }, opId) =>
    correctionsRepository.void(
      { ...correction, operationId: opId },
      cashSessionId,
    ),
  correct_sale: ({ correction, replacement, cashSessionId }, opId) =>
    correctionsRepository.correct(
      { ...correction, operationId: opId },
      { ...replacement, operationId: opId },
      cashSessionId,
    ),
  return_client_containers: (payload, opId) =>
    clientsRepository.returnContainers({ ...payload, operationId: opId }),
  upsert_supply: (supply, opId) =>
    suppliesRepository.save({ ...supply, operationId: opId }),
  register_supply_movement: (movement, opId) =>
    suppliesRepository.movement({ ...movement, operationId: opId }),
  register_maintenance_service: (entry, opId) =>
    maintenanceRepository.register({ ...entry, operationId: opId }),
  fill_containers: (payload, opId) =>
    inventoryRepository.fill({ ...payload, operationId: opId }),
  close_work_day: ({ notes }, opId) =>
    workDaysRepository.close(notes || "", opId),
};

async function syncQueuedOperations() {
  const offlineApi = window.PurificadoraOfflineStore;
  if (!offlineApi) return { synced: 0, failed: 0, conflict: 0 };
  const queue = await offlineApi.listQueue();
  const pending = queue.filter(
    (op) => op.status !== "synced" && op.status !== "conflict",
  );
  if (!pending.length) return { synced: 0, failed: 0, conflict: 0 };
  let synced = 0;
  let failed = 0;
  let conflict = 0;
  for (const op of pending) {
    const handler = syncHandlers[op.type];
    if (!handler) {
      await offlineApi.updateQueueEntry(op.id, {
        status: "failed",
        lastError: `Sin sincronizador para ${op.type}`,
      });
      failed++;
      continue;
    }
    await offlineApi.updateQueueEntry(op.id, {
      status: "syncing",
      attempts: Number(op.attempts || 0) + 1,
    });
    try {
      await handler(op.payload, op.id);
      await offlineApi.updateQueueEntry(op.id, {
        status: "synced",
        lastError: null,
      });
      synced++;
    } catch (error) {
      const text = String(error?.message || error?.code || error || "");
      const isConflict = ["idempotency_conflict"].some((key) =>
        text.includes(key),
      );
      const status = isConflict ? "conflict" : "failed";
      await offlineApi.updateQueueEntry(op.id, {
        status,
        lastError: text.slice(0, 240),
      });
      if (isConflict) conflict++;
      else failed++;
      // Ante un error transitorio (red, permisos), se detiene y se reintenta
      // en la siguiente reconexion; los conflictos de idempotencia se saltan.
      if (!isConflict) break;
    }
  }
  if (synced) {
    await offlineApi.setLastSyncAt();
    hydrateOperationalState("sync-complete").catch(() => {});
  }
  renderPendingQueueBadge();
  renderQueuePanel();
  return { synced, failed, conflict };
}

// Badge del topbar: "· N pendiente(s)" + boton Sincronizar cuando hay cola.
function renderPendingQueueBadge() {
  const countEl = document.getElementById("offlinePendingCount");
  const syncBtn = document.getElementById("syncNowBtn");
  const offlineApi = window.PurificadoraOfflineStore;
  if ((!countEl && !syncBtn) || !offlineApi) return;
  offlineApi
    .pendingCount()
    .then((count) => {
      if (countEl) {
        countEl.textContent = count ? ` · ${count} pendiente(s)` : "";
        countEl.classList.toggle("has-pending", Boolean(count));
      }
      if (syncBtn) syncBtn.classList.toggle("hidden", !count);
    })
    .catch(() => {});
}

// Sincronizacion manual: la cola se reenvia aunque no haya evento online.
async function syncNow() {
  const offlineApi = window.PurificadoraOfflineStore;
  if (!offlineApi) return { synced: 0, failed: 0, conflict: 0 };
  const summary = await offlineApi.queueSummary();
  if (!summary.total) {
    toastV3("No hay operaciones pendientes por sincronizar.");
    return { synced: 0, failed: 0, conflict: 0 };
  }
  const result = await syncQueuedOperations();
  const pieces = [];
  if (result.synced) pieces.push(`${result.synced} sincronizadas`);
  if (result.conflict) pieces.push(`${result.conflict} en conflicto`);
  if (result.failed) pieces.push(`${result.failed} con error`);
  toastV3(
    pieces.length
      ? `Sincronización: ${pieces.join(", ")}.`
      : "Sincronización sin cambios.",
  );
  return result;
}

function toastV3(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastV3._timer);
  toastV3._timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

// ------------------------------------------------------------------ cola --
// Seccion interactiva en Diagnostico para revisar la cola offline:
// ver pendientes, reintentar fallidas y descartar conflictos.

function escText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureQueuePanel() {
  const panel = ensureDiagnosticPanel();
  if (!panel) return null;
  let box = document.getElementById("v3QueuePanel");
  if (box) return box;
  box = document.createElement("div");
  box.id = "v3QueuePanel";
  box.className = "v3-queue-panel";
  panel.appendChild(box);
  return box;
}

function renderQueuePanel() {
  const box = ensureQueuePanel();
  const offlineApi = window.PurificadoraOfflineStore;
  if (!box || !offlineApi) return;
  offlineApi
    .listQueue()
    .then((queue) => {
      if (!queue.length) {
        box.innerHTML =
          '<div class="v3-queue-empty">Sin operaciones pendientes de sincronizar.</div>';
        return;
      }
      const rows = queue
        .map((entry) => {
          const statusClass = ["conflict", "failed", "syncing"].includes(
            entry.status,
          )
            ? entry.status
            : "";
          const canRetry = entry.status === "failed";
          const canDiscard =
            entry.status === "conflict" || entry.status === "failed";
          const error = entry.lastError ? escText(entry.lastError) : "";
          return `<div class="v3-queue-row ${statusClass}">
            <div><strong>${escText(entry.type)}</strong> <span class="v3-queue-status">${escText(entry.status)}</span></div>
            <div class="v3-queue-meta">${new Date(entry.createdAt).toLocaleString()}</div>
            ${error ? `<div class="v3-queue-error" title="${error}">${error}</div>` : ""}
            <div class="v3-queue-actions">
              ${canRetry ? `<button type="button" data-retry="${escText(entry.id)}">Reintentar</button>` : ""}
              ${canDiscard ? `<button type="button" data-discard="${escText(entry.id)}" class="danger">Descartar</button>` : ""}
            </div>
          </div>`;
        })
        .join("");
      box.innerHTML = `<div class="v3-queue-head">Cola offline (${queue.length})</div>${rows}`;
      box
        .querySelectorAll("[data-retry]")
        .forEach((b) => (b.onclick = () => retryQueueEntry(b.dataset.retry)));
      box
        .querySelectorAll("[data-discard]")
        .forEach(
          (b) => (b.onclick = () => discardQueueEntry(b.dataset.discard)),
        );
    })
    .catch(() => {});
}

async function retryQueueEntry(id) {
  const offlineApi = window.PurificadoraOfflineStore;
  if (!offlineApi) return;
  await offlineApi.updateQueueEntry(id, { status: "pending", lastError: null });
  renderQueuePanel();
  await syncQueuedOperations();
}

async function discardQueueEntry(id) {
  const offlineApi = window.PurificadoraOfflineStore;
  if (!offlineApi) return;
  await offlineApi.removeQueueEntry(id);
  renderQueuePanel();
  renderPendingQueueBadge();
  toastV3("Operación descartada de la cola.");
}

// Al volver la conexion: sincronizar la cola y recuperar la central.
window.addEventListener("online", () => {
  syncQueuedOperations().then(() => {
    checkBackend().catch(() => {});
  });
});
window.addEventListener("offline", () => {
  setBackendStatus("Sin conexión · operando con datos locales", false);
  emitCentralAccessState(false, "offline");
});
window.addEventListener("purificadora:queue-changed", () => {
  renderPendingQueueBadge();
  renderQueuePanel();
});
document.getElementById("syncNowBtn")?.addEventListener("click", () => {
  syncNow().catch((error) => toastV3(error?.message || "No se pudo sincronizar."));
});

async function signIn(email, password) {
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  if (!result.data?.session?.user?.id) {
    throw new Error("Supabase no devolviÃ³ una sesiÃ³n vÃ¡lida.");
  }
  diagnosticState.userId = result.data.session.user.id;
  localStorage.setItem(CENTRAL_CONFIGURED_KEY, "true");
  diagnosticState.realtimeError = null;
  renderDiagnosticPanel();
  await registerCurrentDevice();
  await hydrateOperationalState("sign-in");
  startCentralRefresh();
  setBackendStatus("Central conectado · operación V3 online", true);
  return result.data;
}

async function signOut() {
  await stopCentralRefresh();
  const { error } = await client.auth.signOut();
  if (error) throw error;
  setAuthButton(null);
  window.PurificadoraApp?.lockCentralState();
  setBackendStatus("Central disponible · inicia sesión", true);
  diagnosticState.userId = null;
  diagnosticState.profileId = null;
  diagnosticState.role = null;
  diagnosticState.centralMode = false;
  renderDiagnosticPanel();
}

async function currentProfile() {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function registerCurrentDevice() {
  const { data, error } = await client.rpc("register_device", {
    p_device_id: getDeviceId(),
    p_name: getDeviceName(),
  });
  if (error) throw error;
  return data;
}

function showPasswordRecoveryDialog() {
  const authDialog = document.getElementById("v3AuthDialog");
  const recoveryDialog = document.getElementById("v3PasswordRecoveryDialog");
  const errorBox = document.getElementById("v3PasswordRecoveryError");
  if (!recoveryDialog) return;
  if (authDialog?.open) authDialog.close();
  if (errorBox) errorBox.textContent = "";
  if (!recoveryDialog.open) recoveryDialog.showModal();
  document.getElementById("v3NewPassword")?.focus();
}

async function resumeCentralSession(session) {
  if (!session || sessionResumeInFlight) return;
  sessionResumeInFlight = true;
  try {
    const profile = await currentProfile();
    if (!profile?.active) {
      emitCentralAccessState(false, "profile-inactive");
      return;
    }
    setAuthButton(session, profile);
    await hydrateOperationalState("auth-session");
    startCentralRefresh();
  } catch (error) {
    console.warn(
      "No se pudo restaurar la sesión central",
      sanitizeDiagnosticError(error),
    );
    emitCentralAccessState(false, "session-invalid");
  } finally {
    sessionResumeInFlight = false;
  }
}

client.auth.onAuthStateChange((event, session) => {
  diagnosticState.userId = session?.user?.id || null;
  if (!session) {
    diagnosticState.profileId = null;
    diagnosticState.role = null;
    diagnosticState.centralMode = false;
    diagnosticState.realtime = "CLOSED";
    diagnosticState.realtimeError = null;
    emitCentralAccessState(false, "signed-out");
  }
  renderDiagnosticPanel();
  setBackendStatus(
    session
      ? "Cuenta conectada · sincronizando"
      : localStorage.getItem(CENTRAL_CONFIGURED_KEY) === "true"
        ? "Sesión central expirada"
        : "Central disponible · inicia sesión",
    true,
  );
  setAuthButton(session);
  if (
    session &&
    ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)
  ) {
    window.setTimeout(() => resumeCentralSession(session), 0);
  }
  if (!session) window.setTimeout(() => stopCentralRefresh(), 0);
  if (event === "PASSWORD_RECOVERY") {
    window.setTimeout(showPasswordRecoveryDialog, 0);
  }
});

window.addEventListener(CENTRAL_AUTH_REQUIRED_EVENT, () => {
  window.setTimeout(async () => {
    await stopCentralRefresh();
    try {
      await client.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn(
        "No se pudo limpiar la sesión central vencida",
        sanitizeDiagnosticError(error),
      );
    }
    diagnosticState.userId = null;
    diagnosticState.profileId = null;
    diagnosticState.role = null;
    diagnosticState.centralMode = false;
    diagnosticState.realtime = "CLOSED";
    diagnosticState.realtimeError = "Sesión central vencida";
    setAuthButton(null);
    setBackendStatus("Sesión central expirada", true);
    renderDiagnosticPanel();
    emitCentralAccessState(false, "session-expired");
    window.PurificadoraApp?.lockCentralState();
  }, 0);
});

window.addEventListener("focus", () => {
  if (store.profile) hydrateOperationalState("focus").catch(() => {});
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && store.profile)
    hydrateOperationalState("visibility").catch(() => {});
});

function bindAuthUi() {
  const openButton = document.getElementById("v3OpenAuthBtn");
  const topbarAuthButton = ensureBackendBadge();
  const dialog = document.getElementById("v3AuthDialog");
  const form = document.getElementById("v3AuthForm");
  const errorBox = document.getElementById("v3AuthError");
  const noticeBox = document.getElementById("v3AuthNotice");
  const submitButton = document.getElementById("v3AuthSubmitBtn");
  const emailInput = document.getElementById("v3AuthEmail");
  const passwordInput = document.getElementById("v3AuthPassword");
  const togglePasswordButton = document.getElementById("v3TogglePasswordBtn");
  const forgotPasswordButton = document.getElementById("v3ForgotPasswordBtn");
  const recoveryDialog = document.getElementById("v3PasswordRecoveryDialog");
  const recoveryForm = document.getElementById("v3PasswordRecoveryForm");
  const recoveryErrorBox = document.getElementById("v3PasswordRecoveryError");
  const recoverySubmitButton = document.getElementById(
    "v3PasswordRecoverySubmitBtn",
  );
  if (!dialog || !form) return;

  if (emailInput) {
    emailInput.value = localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
  }

  const clearAuthMessages = () => {
    if (errorBox) errorBox.textContent = "";
    if (noticeBox) {
      noticeBox.textContent = "";
      noticeBox.classList.add("hidden");
    }
  };

  const showAuthNotice = (message) => {
    if (!noticeBox) return;
    noticeBox.textContent = message;
    noticeBox.classList.remove("hidden");
  };

  [openButton, topbarAuthButton].filter(Boolean).forEach((button) => {
    button.disabled = false;
    button.setAttribute("aria-controls", "v3AuthDialog");
    button.setAttribute("aria-haspopup", "dialog");
  });
  window.PurificadoraCentralAuthUi?.subscribeTrace((line) => {
    diagnosticState.lastAuthUiEvent = `${line} · ${new Date().toLocaleTimeString()}`;
    renderDiagnosticPanel();
  });

  togglePasswordButton?.addEventListener("click", () => {
    const passwordInput = document.getElementById("v3AuthPassword");
    const showPassword = passwordInput.type === "password";
    passwordInput.type = showPassword ? "text" : "password";
    togglePasswordButton.textContent = showPassword ? "Ocultar" : "Mostrar";
    togglePasswordButton.setAttribute("aria-pressed", String(showPassword));
    passwordInput.focus();
  });

  forgotPasswordButton?.addEventListener("click", async () => {
    clearAuthMessages();
    const emailInput = document.getElementById("v3AuthEmail");
    if (!emailInput) return;
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      if (errorBox) errorBox.textContent = "Escribe primero un correo válido.";
      emailInput.focus();
      return;
    }

    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = "Enviando enlace…";
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      showAuthNotice(
        "Enlace enviado. Abre el correo de recuperación en este mismo dispositivo y crea tu contraseña nueva.",
      );
    } catch (error) {
      if (errorBox) errorBox.textContent =
        error?.message || "No se pudo enviar el enlace de recuperación.";
    } finally {
      forgotPasswordButton.disabled = false;
      forgotPasswordButton.textContent = "Olvidé mi contraseña";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthMessages();
    if (submitButton) submitButton.disabled = true;
    if (submitButton) submitButton.textContent = "Conectando…";
    try {
      const emailEl = document.getElementById("v3AuthEmail");
      const passEl = document.getElementById("v3AuthPassword");
      if (!emailEl || !passEl) return;
      const email = emailEl.value.trim();
      const password = passEl.value;
      setRememberDevicePreference();
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      const authData = await signIn(email, password);
      const profile = await currentProfile();
      if (!profile?.active)
        throw new Error("La cuenta no tiene un perfil operativo activo.");
      setAuthButton(authData.session, profile);
      passEl.value = "";
      dialog.close();
    } catch (error) {
      try {
        await client.auth.signOut();
      } catch {}
      await stopCentralRefresh();
      setAuthButton(null);
      diagnosticState.userId = null;
      diagnosticState.profileId = null;
      diagnosticState.role = null;
      diagnosticState.centralMode = false;
      diagnosticState.realtime = "CLOSED";
      diagnosticState.realtimeError = sanitizeDiagnosticError(error);
      renderDiagnosticPanel();
      if (errorBox) errorBox.textContent =
        error?.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos. Escribe manualmente la contraseña nueva; no uses una contraseña guardada de Supabase."
          : error?.message || "No se pudo conectar la cuenta central.";
    } finally {
      if (submitButton) submitButton.disabled = false;
      if (submitButton) submitButton.textContent = "Conectar";
    }
  });

  recoveryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (recoveryErrorBox) recoveryErrorBox.textContent = "";
    const newPassEl = document.getElementById("v3NewPassword");
    const confirmEl = document.getElementById("v3ConfirmPassword");
    if (!newPassEl || !confirmEl) return;
    const password = newPassEl.value;
    const confirmation = confirmEl.value;
    if (password.length < 8) {
      if (recoveryErrorBox) recoveryErrorBox.textContent =
        "La contraseña debe tener al menos 8 caracteres.";
      return;
    }
    if (password !== confirmation) {
      if (recoveryErrorBox) recoveryErrorBox.textContent = "Las contraseñas no coinciden.";
      return;
    }

    if (recoverySubmitButton) recoverySubmitButton.disabled = true;
    if (recoverySubmitButton) recoverySubmitButton.textContent = "Guardando…";
    try {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session)
        throw new Error(
          "El enlace de recuperación venció. Solicita uno nuevo.",
        );
      const email = sessionData.session.user.email || "";
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      await client.auth.signOut({ scope: "local" });
      newPassEl.value = "";
      confirmEl.value = "";
      if (recoveryDialog?.open) recoveryDialog?.close?.();
      const authEmailEl = document.getElementById("v3AuthEmail");
      if (authEmailEl) authEmailEl.value = email;
      const authPassEl = document.getElementById("v3AuthPassword");
      if (authPassEl) authPassEl.value = "";
      clearAuthMessages();
      showAuthNotice(
        "Contraseña actualizada. Ya puedes entrar con la contraseña nueva.",
      );
      if (dialog && !dialog.open) dialog.showModal();
      authPassEl?.focus();
    } catch (error) {
      if (recoveryErrorBox) recoveryErrorBox.textContent =
        error?.message || "No se pudo guardar la contraseña nueva.";
    } finally {
      if (recoverySubmitButton) recoverySubmitButton.disabled = false;
      if (recoverySubmitButton) recoverySubmitButton.textContent = "Guardar contraseña";
    }
  });
}

window.PurificadoraV3 = Object.freeze({
  client,
  config: SUPABASE_CONFIG,
  deviceId: getDeviceId(),
  checkBackend,
  signIn,
  signOut,
  currentProfile,
  registerCurrentDevice,
  validateOperatorPin: profilesRepository.validatePin,
  mergeClients: async (primaryClientId, duplicateClientIds) => {
    const result = await clientsRepository.merge(
      primaryClientId,
      duplicateClientIds,
    );
    await hydrateOperationalState("client-merge");
    return result;
  },
  refresh: hydrateOperationalState,
  commitTransition: async (before, draft) => {
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    const projection = await store.commit(before, draft);
    window.PurificadoraApp?.applyCentralState(projection, store.profile, {
      offline,
    });
    return projection;
  },
  syncQueuedOperations,
  syncNow,
  queueSummary: () =>
    window.PurificadoraOfflineStore?.queueSummary?.() ??
    Promise.resolve({ total: 0, pending: 0, failed: 0, byType: {} }),
  isOffline: () =>
    typeof navigator !== "undefined" && navigator.onLine === false,
  toCents,
  fromCents,
  formatMoney,
  diagnostics: () => ({ ...diagnosticState }),
});

renderDiagnosticPanel();
verifyBuildConsistency();
inspectServiceWorkerBuild();
if (SUPABASE_CONFIG.enabled) checkBackend();
bindAuthUi();
