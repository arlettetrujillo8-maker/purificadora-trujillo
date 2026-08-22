const assert = require("node:assert/strict");
const store = require("../js/data/offline-store.js");

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

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

(async () => {
  store.setOfflineBackend(memoryBackend());

  // Snapshot: guardar y cargar redondea el estado.
  const state = { sales: [{ id: "s1", total: 14 }], clients: [{ id: "c1" }], central: true };
  const saved = await store.saveSnapshot(state, { source: "test" });
  ok(saved.savedAt, "saveSnapshot devuelve fecha");
  const loaded = await store.loadSnapshot();
  assert.deepEqual(loaded.state, state, "el snapshot redondea el estado");
  passed++;
  ok(loaded.meta.source === "test", "el snapshot conserva metadata");

  // Sin snapshot no rompe.
  await store.clearSnapshot();
  assert.equal(await store.loadSnapshot(), null, "sin snapshot devuelve null");
  passed++;

  // Cola: encolar, listar en orden, actualizar, eliminar.
  await store.enqueueOperation({
    id: "op-11111111-1111-4111-8111-111111111111",
    type: "register_sale",
    payload: { qty: 2 },
  });
  await store.enqueueOperation({
    id: "op-22222222-2222-4222-8222-222222222222",
    type: "register_payment",
    payload: { amount: 28 },
  });
  const queue = await store.listQueue();
  assert.equal(queue.length, 2, "hay 2 operaciones encoladas");
  passed++;
  assert.equal(queue[0].type, "register_sale", "la cola respeta el orden de creacion");
  passed++;
  ok(store.pendingCount && typeof store.pendingCount === "function", "expone pendingCount");

  const updated = await store.updateQueueEntry(queue[0].id, {
    status: "syncing",
    attempts: 1,
  });
  ok(updated.status === "syncing" && updated.attempts === 1, "actualiza la entrada");
  assert.equal((await store.pendingCount()), 2, "syncing cuenta como pendiente");
  passed++;

  await store.updateQueueEntry(queue[0].id, { status: "synced" });
  assert.equal((await store.pendingCount()), 1, "synced deja de contar");
  passed++;

  await store.removeQueueEntry(queue[0].id);
  assert.equal((await store.listQueue()).length, 1, "elimina la entrada");
  passed++;

  // Resumen por tipo.
  const summary = await store.queueSummary();
  ok(summary.total === 1 && summary.byType.register_payment === 1, "resumen por tipo");
  passed++;

  // Metadata.
  await store.setLastSyncAt("2026-08-18T00:00:00.000Z");
  assert.equal(await store.getLastSyncAt(), "2026-08-18T00:00:00.000Z", "guarda ultimo sync");
  passed++;
  await store.setCachedProfile({ id: "p1", role: "repartidor" });
  assert.deepEqual(await store.getCachedProfile(), { id: "p1", role: "repartidor" }, "guarda perfil en cache");
  passed++;

  // Limpiar cola.
  await store.clearQueue();
  assert.equal((await store.listQueue()).length, 0, "clearQueue vacia la cola");
  passed++;

  // Encolar sin operationId rechaza.
  await assert.rejects(
    () => store.enqueueOperation({ type: "register_sale", payload: {} }),
    /operationId requerido/,
  );
  passed++;

  console.log(`offline-store: ${passed} PASS`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
