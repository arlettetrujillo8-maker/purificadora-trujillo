import {
  supabase,
  getDeviceId,
} from "./supabase-client.js?v=20260816-reporte-y-envases-fix";

const CENTRAL_AUTH_REQUIRED_EVENT = "purificadora:central-auth-required";
const CENTRAL_SESSION_ERROR = "central_session_expired";

function centralSessionError(cause = null) {
  const error = new Error(CENTRAL_SESSION_ERROR);
  error.code = CENTRAL_SESSION_ERROR;
  error.userMessage =
    "La sesión central venció. Reconecta la cuenta para continuar.";
  if (cause) error.cause = cause;
  return error;
}

function notifyCentralAuthRequired(reason = CENTRAL_SESSION_ERROR) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CENTRAL_AUTH_REQUIRED_EVENT, {
      detail: { reason },
    }),
  );
}

async function ensureCentralSession(forceRefresh = false) {
  let result = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  let session = result.data?.session || null;

  if (
    !forceRefresh &&
    session &&
    Number(session.expires_at || 0) * 1000 <= Date.now() + 60_000
  ) {
    result = await supabase.auth.refreshSession();
    session = result.data?.session || null;
  }

  if (result.error || !session?.access_token || !session?.user?.id) {
    notifyCentralAuthRequired();
    throw centralSessionError(result.error);
  }
  return session;
}

function isFunctionPermissionDenied(error) {
  return (
    String(error?.code || "") === "42501" &&
    /permission denied for function/i.test(String(error?.message || ""))
  );
}

export function operationId() {
  return globalThis.PurificadoraCrypto.safeRandomUUID();
}

export function entityId() {
  return globalThis.PurificadoraCrypto.safeRandomUUID();
}

export async function selectAll(table, columns = "*", configure = null) {
  let query = supabase.from(table).select(columns);
  if (configure) query = configure(query);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function rpc(name, args) {
  await ensureCentralSession();
  let { data, error } = await supabase.rpc(name, args);
  if (isFunctionPermissionDenied(error)) {
    await ensureCentralSession(true);
    ({ data, error } = await supabase.rpc(name, args));
  }
  if (error) {
    if (isFunctionPermissionDenied(error)) {
      notifyCentralAuthRequired("function-permission-denied");
      const sessionError = centralSessionError(error);
      sessionError.userMessage =
        "No se pudo autorizar la sesión central. Reconecta la cuenta e inténtalo de nuevo.";
      throw sessionError;
    }
    error.userMessage = translateDatabaseError(error);
    throw error;
  }
  return data;
}

export function commandArgs(extra = {}) {
  return {
    p_operation_id: operationId(),
    p_device_id: getDeviceId(),
    ...extra,
  };
}

export function translateDatabaseError(error) {
  const message = String(
    error?.message || "No se pudo completar la operación central.",
  );
  const known = {
    operation_not_authorized:
      "Tu cuenta no tiene permiso para realizar esta operación.",
    invalid_operator_name: "Escribe un nombre válido para el empleado.",
    invalid_operator_username: "El alias del empleado no es válido.",
    invalid_operator_role: "Selecciona un rol válido.",
    invalid_operator_center: "Selecciona una ruta válida para el repartidor.",
    invalid_operator_pin: "El PIN debe contener de 4 a 8 números.",
    operator_pin_required: "Asigna un PIN para iniciar turno.",
    operator_not_found: "El empleado ya no existe. Actualiza la pantalla.",
    duplicate_operator_username: "Ese alias ya está en uso.",
    last_administrator_protected:
      "Debe permanecer al menos un administrador activo.",
    current_administrator_protected:
      "No puedes modificar tu propio acceso administrativo.",
    central_session_expired:
      "La sesión central venció. Reconecta la cuenta para continuar.",
    operator_has_history:
      "Este empleado tiene historial y no puede eliminarse. Desactívalo para conservar los reportes.",
    price_override_not_authorized:
      "No tienes permiso para usar un precio distinto al autorizado.",
    price_override_reason_required:
      "Escribe el motivo del cambio de precio.",
    invalid_expected_sale_price:
      "El precio configurado no es válido. Revisa la configuración general.",
    route_scope_violation: "La operación está fuera de la ruta asignada.",
    client_scope_violation: "El cliente está fuera de tu alcance autorizado.",
    duplicate_client_name:
      "Ya existe un cliente activo con ese nombre. Usa Unir duplicados.",
    duplicate_client_phone: "Ya existe un cliente con ese teléfono.",
    invalid_client_merge:
      "Selecciona un cliente principal y al menos un duplicado activo.",
    stale_client_version:
      "El cliente cambió en otro dispositivo. Se recargarán los datos.",
    cash_session_required: "Abre tu caja antes de registrar efectivo.",
    cash_session_not_open: "La caja ya no está abierta.",
    cash_session_not_available:
      "La caja no está disponible para esta operación.",
    insufficient_cash: "El efectivo esperado no alcanza para esta salida.",
    insufficient_inventory:
      "Inventario insuficiente. No se aplicó ningún cambio.",
    insufficient_route_inventory:
      "El inventario de ruta no alcanza para cerrar la ronda.",
    insufficient_empty_inventory: "No hay suficientes vacíos en Lavado.",
    round_already_open: "Ya existe una ronda abierta para esta ruta.",
    active_round_required:
      "Inicia una ronda para esta ruta antes de registrar la venta.",
    round_return_mismatch:
      "El regreso de ronda no cuadra con lo cargado y vendido.",
    round_capacity_exceeded:
      "La venta supera los garrafones disponibles en la ronda activa.",
    round_integrity_inconsistent:
      "La ronda tiene ventas mayores que su carga registrada. Requiere ajuste administrativo.",
    invalid_round_return:
      "Captura cantidades enteras y no negativas para el regreso.",
    round_not_found: "La ronda ya no existe. Actualiza la pantalla.",
    round_return_already_registered:
      "El regreso ya fue registrado desde otro dispositivo. Se actualizarán los datos.",
    round_already_closed:
      "La ronda ya fue cerrada desde otro dispositivo. Se actualizarán los datos.",
    round_return_required:
      "Primero registra el regreso antes de cerrar la ronda.",
    round_recovery_admin_required:
      "Solo un Administrador puede resolver esta ronda inconsistente.",
    round_recovery_reason_required:
      "Escribe el motivo de recuperación administrativa.",
    operation_in_progress:
      "Esta operación ya se está procesando en otro dispositivo. Actualiza en unos segundos.",
    invalid_round_reload: "Captura una recarga válida para la ronda.",
    invalid_sale_return: "Captura una cantidad y un motivo válidos.",
    return_quantity_exceeded:
      "La cantidad supera los garrafones disponibles para devolver.",
    sale_change_window_expired:
      "La ventana de 30 minutos terminó. Requiere autorización administrativa.",
    sale_credit_already_paid:
      "El fiado ya tiene abonos posteriores y no puede revertirse automáticamente.",
    sale_not_returnable: "La venta ya fue corregida o anulada.",
    sale_not_correctable:
      "La venta ya tiene devoluciones, fue corregida o fue anulada.",
    sale_not_voidable: "La venta ya fue corregida o anulada.",
    post_close_adjustment_not_authorized:
      "Solo un administrador puede ajustar una venta de una caja cerrada.",
    idempotency_conflict:
      "La operación fue rechazada por un conflicto de idempotencia.",
    PGRST202:
      "El comando central requerido todavía no está desplegado. No se aplicó ningún cambio.",
  };
  const errorText = `${error?.code || ""} ${message}`;
  const key = Object.keys(known).find((item) => errorText.includes(item));
  return key ? known[key] : message;
}
