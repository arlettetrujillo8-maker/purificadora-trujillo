(function exposeOfflineStore(globalScope) {
  "use strict";
  // Espejo local (IndexedDB) + cola de operaciones para el modo offline.
  //
  // Guarda dos cosas:
  //   1. SNAPSHOT: la ultima proyeccion del estado central, para abrir la app
  //      sin senal y poder operar con los datos del ultimo sync.
  //   2. QUEUE: operaciones registradas sin conexion, para reenviarlas al
  //      servidor al reconectar (idempotentes por operationId).
  //
  // El backend es inyectable (setOfflineBackend) para probar la logica en
  // Node, donde no existe indexedDB. Por defecto usa IndexedDB.

  const SNAPSHOT_KEY = "state";

  // -------------------------------------------------------------- backend --
  let backendOverride = null;
  let cachedIdb = null;

  function memoryBackend() {
    const map = new Map();
    return {
      async read(key) {
        return map.has(key) ? JSON.parse(map.get(key)) : null;
      },
      async write(key, value) {
        map.set(key, JSON.stringify(value));
      },
      async remove(key) {
        map.delete(key);
      },
      async keys() {
        return [...map.keys()];
      },
    };
  }

  function idbBackend() {
    if (cachedIdb) return cachedIdb;
    const DB_NAME = "purificadora_v3_offline";
    const DB_VERSION = 1;

    function openDb() {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("indexedDB no disponible"));
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("kv"))
            db.createObjectStore("kv", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    function requestToPromise(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    cachedIdb = {
      async read(key) {
        const db = await openDb();
        const tx = db.transaction("kv", "readonly");
        const result = await requestToPromise(tx.objectStore("kv").get(key));
        return result && "value" in result ? result.value : null;
      },
      async write(key, value) {
        const db = await openDb();
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ key, value });
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      },
      async remove(key) {
        const db = await openDb();
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete(key);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      },
      async keys() {
        const db = await openDb();
        const tx = db.transaction("kv", "readonly");
        const result = await requestToPromise(tx.objectStore("kv").getAllKeys());
        return result.map((key) => String(key));
      },
    };
    return cachedIdb;
  }

  function backend() {
    return backendOverride || idbBackend();
  }

  // ------------------------------------------------------------- snapshot --
  async function saveSnapshot(state, meta = {}) {
    const data = { state, meta, savedAt: new Date().toISOString() };
    await backend().write(SNAPSHOT_KEY, data);
    return data;
  }

  async function loadSnapshot() {
    try {
      const record = await backend().read(SNAPSHOT_KEY);
      return record && record.state ? record : null;
    } catch (error) {
      console.warn("No se pudo leer el espejo local", error);
      return null;
    }
  }

  async function clearSnapshot() {
    await backend().remove(SNAPSHOT_KEY);
  }

  // ------------------------------------------------------------------ meta --
  async function setMeta(key, value) {
    await backend().write(`meta:${key}`, value);
  }
  async function getMeta(key) {
    try {
      return await backend().read(`meta:${key}`);
    } catch {
      return null;
    }
  }
  async function setLastSyncAt(date = new Date().toISOString()) {
    await setMeta("lastSyncAt", date);
  }
  async function getLastSyncAt() {
    return getMeta("lastSyncAt");
  }
  async function setCachedProfile(profile) {
    await setMeta("profile", profile || null);
  }
  async function getCachedProfile() {
    return getMeta("profile");
  }

  // ----------------------------------------------------------------- queue --
  // Cada entrada: { id: operationId, type, payload, createdAt, attempts, status, lastError }
  async function enqueueOperation({ id, type, payload }) {
    if (!id) throw new Error("operationId requerido para encolar");
    const entry = {
      id,
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: "pending",
      lastError: null,
    };
    await backend().write(`op:${id}`, entry);
    return entry;
  }

  async function listQueue() {
    try {
      const keys = await backend().keys();
      const ops = [];
      for (const key of keys) {
        if (!key.startsWith("op:")) continue;
        const entry = await backend().read(key);
        if (entry) ops.push(entry);
      }
      ops.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return ops;
    } catch (error) {
      console.warn("No se pudo leer la cola offline", error);
      return [];
    }
  }

  async function updateQueueEntry(id, patch) {
    const entry = await backend().read(`op:${id}`);
    if (!entry) return null;
    const updated = { ...entry, ...patch };
    await backend().write(`op:${id}`, updated);
    return updated;
  }

  async function removeQueueEntry(id) {
    await backend().remove(`op:${id}`);
  }

  async function clearQueue() {
    const keys = await backend().keys();
    for (const key of keys) {
      if (key.startsWith("op:")) await backend().remove(key);
    }
  }

  async function pendingCount() {
    const queue = await listQueue();
    return queue.filter(
      (entry) => entry.status === "pending" || entry.status === "syncing",
    ).length;
  }

  async function queueSummary() {
    const queue = await listQueue();
    const byType = {};
    for (const entry of queue) byType[entry.type] = (byType[entry.type] || 0) + 1;
    return {
      total: queue.length,
      pending: queue.filter((e) => e.status === "pending").length,
      failed: queue.filter((e) => e.status === "failed" || e.status === "conflict").length,
      byType,
    };
  }

  async function isAvailable() {
    try {
      await backend().keys();
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- export --
  const api = Object.freeze({
    setOfflineBackend: (b) => {
      backendOverride = b;
    },
    resetOfflineBackend: () => {
      backendOverride = null;
      cachedIdb = null;
    },
    saveSnapshot,
    loadSnapshot,
    clearSnapshot,
    setMeta,
    getMeta,
    setLastSyncAt,
    getLastSyncAt,
    setCachedProfile,
    getCachedProfile,
    enqueueOperation,
    listQueue,
    updateQueueEntry,
    removeQueueEntry,
    clearQueue,
    pendingCount,
    queueSummary,
    isAvailable,
  });

  globalScope.PurificadoraOfflineStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
