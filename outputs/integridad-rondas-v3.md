# Integridad de rondas V3 central

Fecha: 11 de agosto de 2026

## Corrección

- Fórmula única: `available_full = initial_load + reloads - net_sold`.
- Una venta de ruta requiere ronda activa y no puede superar
  `available_full`.
- Supabase bloquea la fila de la ronda antes de validar e insertar, evitando
  que dos dispositivos consuman simultáneamente la misma disponibilidad.
- `reload_round()` mueve inventario de Local a la ruta, guarda un movimiento
  `round_reload` con `round_id`, aplica idempotencia y registra auditoría.
- El cierre usa carga inicial, recargas, total cargado, vendidos netos y llenos
  esperados.
- No se aplica `Math.max(0, …)` para ocultar una sobreventa de ronda.
- Una ronda histórica inconsistente conserva su disponibilidad negativa y
  muestra cuánto se vendió de más; cierre y nuevas ventas quedan bloqueados
  hasta un ajuste administrativo de las ventas.
- Los mensajes de cierre distinguen faltantes de cantidades capturadas de más,
  sin imprimir números negativos como faltantes.

## Archivos

- Migración: `20260811054310_enforce_round_capacity_and_reloads.sql`.
- QA SQL: `007_round_integrity.test.sql` con 14 aserciones.
- QA frontend: `round-integrity.test.cjs` con 8 verificaciones.

## QA ejecutado

- Sintaxis JavaScript: aprobada.
- Integridad de rondas frontend/contrato: 8/8.
- Sincronización central: 6/6.
- Selector de cliente: 5/5.
- `localhost:8080` y `192.168.0.174:8080`: HTTP 200 y build
  `20260811-round-integrity`.
- Caché PWA nuevo confirmado.

## QA SQL pendiente de ejecución

La suite reproduce:

1. carga 20, venta 20: PASS esperado;
2. venta adicional 1 por RPC: REJECT esperado;
3. carga 20 + recarga 20 + venta total 35: PASS esperado, quedan 5;
4. cierre con 5: PASS esperado;
5. recarga asociada a `round_id` y acceso anónimo bloqueado.

No se ejecutó contra Postgres porque la CLI no tiene login/proyecto vinculado y
el Postgres local de Supabase no está iniciado. No se afirma despliegue remoto
sin esa evidencia.

No se inició offline-first.
