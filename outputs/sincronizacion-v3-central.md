# Certificación de migraciones y sincronización V3 central

Fecha: 11 de agosto de 2026

## Resultado ejecutivo

- Proyecto vinculado: `zzrrbmlaohdvkiggmteu`.
- `db push`: **PASS**.
- Pérdida de datos: **ninguna**.
- Historial local/remoto: **alineado hasta `20260811054310`**.
- Publicación Realtime: **PASS, 19/19 tablas operativas**.
- Integridad de rondas: **PASS, 14/14**.
- Canal Realtime autenticado en interfaz: **pendiente de sesión central activa**.

## Corrección idempotente

La migración `20260811032400_v3_0_2_sale_lifecycle.sql` fallaba cuando el
índice `ledger_sale_charge_effect_idx` ya existía. Se cambió únicamente a:

```sql
create unique index if not exists ledger_sale_charge_effect_idx
```

La revisión completa confirmó:

- tablas con `CREATE TABLE IF NOT EXISTS`;
- índice secundario con `CREATE INDEX IF NOT EXISTS`;
- funciones con `CREATE OR REPLACE FUNCTION`;
- políticas y constraints reemplazados explícitamente porque cambia su
  definición;
- sin triggers ni publicaciones en esta migración;
- sin `DROP TABLE`, reset ni reparación del historial.

## Migraciones remotas confirmadas

| Migración | Remote |
|---|---:|
| `20260810152215` | PASS |
| `20260811003858` | PASS |
| `20260811011356` | PASS |
| `20260811023725` | PASS |
| `20260811030615` | PASS |
| `20260811032400` | PASS |
| `20260811044237` | PASS |
| `20260811053244` | PASS |
| `20260811054310` | PASS |

El despliegue aplicó las cuatro migraciones pendientes en orden. La advertencia
posterior fue únicamente por Docker ausente al intentar cachear el catálogo
local; el push remoto finalizó correctamente.

## QA SQL remoto

Las suites se ejecutaron mediante `supabase db query --linked` porque
`supabase test db --linked` requiere Docker en esta máquina. Todas están
envueltas en transacciones y terminan con `ROLLBACK`.

| Suite | Resultado |
|---|---:|
| `001_schema_contract.sql` | PASS |
| `002_v3_rpc_rls.test.sql` | PASS 25/25 |
| `003_v3_0_1_operational_rpc.test.sql` | PASS 29/29 |
| `004_v3_0_2_sale_lifecycle.test.sql` | PASS 29/29 |
| `005_register_sale_price.test.sql` | PASS 16/16 |
| `006_realtime_publication.test.sql` | PASS 3/3 |
| `007_round_integrity.test.sql` | PASS 14/14 |

Los tests 002 y 004 se aislaron de ventas y contadores productivos ya
existentes. El test 007 ahora demuestra que la capacidad documental de una
ronda rechaza sobreventa aunque el inventario físico se altere temporalmente.
Todos esos cambios se revierten con `ROLLBACK`.

## Realtime

`pg_publication_tables` confirmó estas 19 tablas en `supabase_realtime`:

`audit_log`, `cash_movements`, `cash_sessions`, `clients`, `expenses`,
`inventory_locations`, `inventory_movements`, `ledger_entries`,
`maintenance_events`, `payments`, `profiles`, `rounds`,
`sale_cash_adjustments`, `sale_corrections`, `sale_returns`, `sales`,
`settings`, `supplies` y `supply_movements`.

La pestaña local verificada muestra el build `20260811-round-integrity`, que
incluye `20260811-realtime-sync`, polling de 10 segundos y estados exactos de
canal. En esa pestaña no existe sesión central, por lo que el diagnóstico
muestra `Central mode: false` y `Realtime: CLOSED`. Esto no permite certificar
todavía `SUBSCRIBED` ni el intercambio PC-celular en una sesión autenticada.

## Rondas

- carga 20, venta 20: PASS;
- venta adicional sin capacidad: REJECT y sin venta parcial;
- carga 20 + recarga 20 + venta 35: PASS, disponibles 5;
- recarga asociada a `round_id`: PASS;
- cierre con 5 llenos: PASS;
- RLS/permiso anónimo de `reload_round`: PASS.

## Seguridad

- asesor remoto de seguridad en nivel `error`: **sin hallazgos**;
- índice `ledger_sale_charge_effect_idx`: presente;
- no se relajó RLS;
- no se usó `db reset`, `DROP TABLE` ni `migration repair`.

## Clasificación final

**Esquema central desplegado y alineado: PASS.**

**Sincronización online backend: PASS.** La publicación y el fallback de
polling están configurados y probados estructuralmente.

**Certificación multidispositivo en vivo: PENDIENTE.** Requiere iniciar una
sesión central en PC y celular y confirmar `Realtime: SUBSCRIBED` antes de
realizar el intercambio operacional en ambos sentidos.

No se inició offline-first.
