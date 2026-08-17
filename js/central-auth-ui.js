(function exposeCentralAuthUi(globalScope) {
  "use strict";

  const BUILD = "20260817-rondas-una-tarjeta";
  const TRIGGER_SELECTOR =
    "#v3OpenAuthBtn, #v3BackendBadge, [data-central-auth-trigger]";
  const bindings = new WeakMap();
  const traceListeners = new Set();
  const trace = [];
  let originDialog = null;

  function safeText(value) {
    return String(value ?? "Error desconocido").slice(0, 360);
  }

  function ensureTracePanel() {
    let panel = document.getElementById("centralAuthTracePanel");
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = "centralAuthTracePanel";
    panel.className = "central-auth-trace";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.hidden = true;
    document.body.appendChild(panel);
    return panel;
  }

  function renderTrace() {
    if (typeof document === "undefined") return;
    const text = trace.join("\n");
    const panel = ensureTracePanel();
    panel.textContent = text;
    // Los pasos se conservan para Admin > Diagnóstico, sin cubrir la UI diaria.
    panel.hidden = true;
    const dialogTrace = document.getElementById("v3AuthTrace");
    if (dialogTrace) {
      dialogTrace.textContent = text;
      dialogTrace.hidden = true;
    }
  }

  function emitStep(message, detail = "") {
    const line = detail ? `${message}: ${safeText(detail)}` : message;
    trace.push(line);
    if (trace.length > 12) trace.shift();
    renderTrace();
    console.info("central-auth-trace", line);
    traceListeners.forEach((listener) => {
      try {
        listener(line, [...trace]);
      } catch (error) {
        console.warn("central-auth trace listener", error);
      }
    });
  }

  function showRuntimeError(prefix, error, source = "") {
    const location = source ? ` (${source})` : "";
    emitStep(`ERROR ${prefix}${location}`, error?.message || error);
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return;
    HTMLDialogElement.prototype.close.call(dialog);
  }

  function showDialog(dialog) {
    if (dialog.open) return;
    HTMLDialogElement.prototype.showModal.call(dialog);
  }

  function openCentralAuthModal(trigger) {
    emitStep("3. openCentralAuthModal() llamado", trigger?.id || "delegado");
    const dialog = document.getElementById("v3AuthDialog");
    if (!dialog) {
      emitStep("4. modal NO encontrado en DOM", "#v3AuthDialog");
      return false;
    }
    emitStep("4. modal encontrado en DOM", "#v3AuthDialog");

    try {
      const activeModal = document.querySelector("dialog[open]");
      if (activeModal && activeModal !== dialog) {
        originDialog = activeModal;
        closeDialog(activeModal);
      }
      const errorBox = document.getElementById("v3AuthError");
      const noticeBox = document.getElementById("v3AuthNotice");
      const password = document.getElementById("v3AuthPassword");
      if (errorBox) errorBox.textContent = "";
      if (noticeBox) {
        noticeBox.textContent = "";
        noticeBox.classList.add("hidden");
      }
      if (password) password.value = "";
      showDialog(dialog);
      emitStep("5. modal marcado visible", `open=${dialog.open}`);
    } catch (error) {
      showRuntimeError("al abrir modal", error, "central-auth-ui.js");
      return false;
    }

    requestAnimationFrame(() => {
      const visible = dialog.open && dialog.getBoundingClientRect().height > 0;
      emitStep("6. render completado", `visible=${visible}`);
      const email = document.getElementById("v3AuthEmail");
      const password = document.getElementById("v3AuthPassword");
      (email?.value ? password : email)?.focus();
    });
    setTimeout(() => {
      if (!dialog.open)
        emitStep("ERROR modal cerrado inmediatamente", "250 ms");
    }, 250);
    return true;
  }

  function bindStableAuthDelegation(
    root = document,
    {
      selector = TRIGGER_SELECTOR,
      onActivate = null,
      onTrace = () => {},
    } = {},
  ) {
    if (!root?.addEventListener)
      throw new TypeError("Se requiere un contenedor estable.");
    if (bindings.has(root)) return bindings.get(root);
    const handler = (event) => {
      const trigger = event.target?.closest?.(selector);
      if (!trigger) return;
      emitStep("1. click recibido", trigger.id || "delegado");
      emitStep("2. handler ejecutado", BUILD);
      onTrace("central-auth-click", trigger);
      event.preventDefault?.();
      event.stopPropagation?.();
      if (typeof onActivate === "function") onActivate(event, trigger);
      else openCentralAuthModal(trigger);
    };
    root.addEventListener("click", handler, true);
    const binding = Object.freeze({ handler, selector });
    bindings.set(root, binding);
    return binding;
  }

  function subscribeTrace(listener) {
    if (typeof listener !== "function") return () => {};
    traceListeners.add(listener);
    return () => traceListeners.delete(listener);
  }

  function restoreOriginDialog() {
    if (!originDialog?.isConnected || originDialog.open) {
      originDialog = null;
      return;
    }
    try {
      showDialog(originDialog);
    } catch (error) {
      showRuntimeError("al restaurar modal", error, "central-auth-ui.js");
    } finally {
      originDialog = null;
    }
  }

  function discardOriginDialog() {
    originDialog = null;
  }

  globalScope.addEventListener?.("error", (event) => {
    const source = [event.filename?.split("/").pop(), event.lineno, event.colno]
      .filter(Boolean)
      .join(":");
    showRuntimeError("window.onerror", event.error || event.message, source);
  });
  globalScope.addEventListener?.("unhandledrejection", (event) => {
    showRuntimeError("unhandledrejection", event.reason, "Promise");
  });

  const api = Object.freeze({
    BUILD,
    bindStableAuthDelegation,
    emitStep,
    openCentralAuthModal,
    discardOriginDialog,
    subscribeTrace,
    getTrace: () => [...trace],
  });
  globalScope.PurificadoraCentralAuthUi = api;

  const install = () => {
    bindStableAuthDelegation(document);
    document
      .getElementById("v3AuthDialog")
      ?.addEventListener("close", restoreOriginDialog);
  };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
