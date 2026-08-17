# Fix B1 — la jornada como frontera durable

Migración preparada: `supabase/migrations/20260817090000_work_day_boundary.sql`

**Estado: escrita y revisada contra el esquema, NO aplicada.** El MCP de
Supabase me responde "You do not have permission" en este proyecto, así que no
pude ejecutarla ni probarla contra la base. Todo lo de abajo hay que correrlo tú.

---

## Qué resuelve

Hoy "jornada" no existe en el servidor. El botón Cerrar jornada solo cerraba
cajas y rondas, y el `audit()` del cliente es local: se descarta en la siguiente
recarga. Sin marca durable, ninguna vista puede distinguir la jornada en curso
del histórico, y por eso "Últimas ventas" y los contadores del dashboard
arrastran ventas de jornadas anteriores.

## Qué hace

Registra **solo la frontera**, no reasigna ventas:

- Tabla `public.work_days` — un renglón por cierre (`closed_at`, `closed_by`,
  `device_id`, `operation_id`, `notes`).
- RPC `public.close_work_day(p_operation_id, p_device_id, p_notes)` —
  idempotente por `operation_id`, igual que el resto de comandos centrales.
  Deja la marca y la escribe en `audit_log` como `work_day_closed`.
- `work_days` entra a Realtime, para que cerrar la jornada en un dispositivo
  reinicie las vistas de los demás sin recargar.

La jornada en curso es "todo lo ocurrido después del último cierre", derivado de
`max(closed_at)`.

## Lo que NO hace, a propósito

- **No agrega `work_day_id` a `sales`.** No toca `register_sale`, no requiere
  backfill.
- **No borra ni mueve nada.** Las ventas viejas quedan intactas y consultables;
  solo dejan de aparecer en las vistas de la jornada activa.
- **No cierra cajas ni rondas.** De eso siguen encargándose `close_cash_session`
  y `close_round`, que ya validan arqueo e inventario.

---

## ⚠️ Un cambio de comportamiento que tienes que decidir

La RPC **rechaza** el cierre si quedan cajas o rondas abiertas
(`work_day_has_open_entities`), en vez de forzarlas.

Es distinto a lo que hace hoy el botón, que las cierra a la fuerza. Lo escribí
así porque forzar el cierre de una ronda sin su conciliación de envases
descuadra el inventario, y una caja cerrada sin arqueo falsea el corte. Cerrar
"limpiando" datos que no cuadran es justo lo que la regla del proyecto evita.

Si prefieres conservar el forzado, dímelo y cambio la RPC para que cierre las
cajas con `difference_reason = 'Cierre automático de jornada'` y las rondas
marcando el faltante como pendiente de conciliación. Es una decisión de negocio,
no un detalle técnico: cámbialo si en la práctica se cierra la jornada con
rondas todavía en la calle.

---

## Cómo aplicarla

Como el historial del CLI sigue sin reconciliar (punto 4 del runbook), lo
directo es el **SQL Editor** del Dashboard:

1. Abre el proyecto `zzrrbmlaohdvkiggmteu` → SQL Editor.
2. Pega el contenido completo de
   `supabase/migrations/20260817090000_work_day_boundary.sql` y ejecútalo.
3. Comprueba que quedó:

```sql
select to_regclass('public.work_days') as tabla,
       (select count(*) from pg_proc where proname = 'close_work_day') as rpc;
```

Debe devolver `public.work_days` y `1`.

Si ya reconciliaste el CLI (punto 4 del runbook), entonces mejor:

```bash
npx supabase db push --dry-run
```

y si sale limpio, sin `--dry-run`.

---

## Lo que sigue, del lado del cliente

**No lo escribí todavía a propósito:** si el cliente consulta `work_days` antes
de que exista la tabla, la carga inicial revienta. Avísame cuando la migración
esté aplicada y lo conecto:

1. `js/data/work-days-repository.js` — `list()` y `close()`.
2. Proyección en `operational-store.js` → `state.workDays`.
3. Rama de `close_work_day` en `commit()`, sustituyendo la marca transitoria
   `workDayClosedAt` que hoy solo destraba el botón.
4. Derivar `currentWorkDayStart()` = `max(closed_at)`.
5. Filtrar por esa marca en:
   - `scopedLatestSales()` (js/app.js:3575) — hoy no filtra nada.
   - `todaySales()` (js/app.js:1299) — hoy usa `sameDay()`, o sea día natural.

---

## Lo que esto NO arregla

Que todas las ventas aparezcan atribuidas a "Administrador". Eso es el
**punto 1 del runbook**: solo el Admin tiene `auth_user_id` real, así que el
servidor deriva `user_id` de `auth.uid()` y le adjudica todo. Ningún filtro por
jornada lo cambia — hacen falta las cuentas reales de Ventanilla y Ruta 1.
