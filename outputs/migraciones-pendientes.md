# Migraciones pendientes en Supabase

Estado verificado el 25/10/2026 contra el proyecto de pruebas
`elriqlqayfqybuuwmxgu`:

| Tabla | Estado | Efecto |
|---|---|---|
| `routes` | ❌ No existe (`PGRST205`) | La app usa las rutas fijas ruta1/ruta2 |
| `orders` | ❌ No existe (`PGRST205`) | Los pedidos viven solo en el dispositivo |
| `supplies`, `work_days`, resto del esquema | ✅ Existen | Operación normal |

Mientras no se apliquen, la app **funciona**, pero:

- Los pedidos programados no viajan entre la oficina y el celular del repartidor.
- No se puede crear una Ruta 3 sin tocar código.

## Migraciones que faltan

1. `supabase/migrations/20261025_routes_expandible.sql`
   - Crea `public.routes`, RLS de lectura, siembra ruta1/ruta2 y reemplaza los
     CHECK fijos de ruta por un patrón `^ruta[0-9]+$`.
2. `supabase/migrations/20261025_orders_programados.sql`
   - Crea `public.orders`, índice de pendientes, RLS y los RPC
     `create_order` / `set_order_status`.

Ambas son archivos separados e idempotentes en lo esencial
(`create table if not exists`, `drop policy if exists`).

## Opción A (recomendada): script con Management API

1. Crea un **Personal Access Token** en
   <https://supabase.com/dashboard/account/tokens> (cuenta dueña del proyecto).
2. En PowerShell, dentro del repo:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_tu_token"
node scripts/apply-migrations.cjs --verify          # estado actual
node scripts/apply-migrations.cjs --apply           # aplica las 2 pendientes
```

- `--only 20261025_orders_programados.sql` aplica una sola.
- Sin `--apply` el script solo muestra el plan (dry-run) y hashes.
- El script envuelve cada archivo en `begin; ... commit;`.
- No se guarda ningún token en el repositorio.

## Opción B: SQL Editor manual

Supabase Dashboard → SQL Editor → pegar el contenido completo de cada archivo
en este orden y ejecutar:

1. `20261025_routes_expandible.sql`
2. `20261025_orders_programados.sql`

## Verificación

```sql
select table_name
from information_schema.tables
where table_schema = 'public' and table_name in ('routes','orders');
-- debe devolver 2 filas

select code, name, active from public.routes order by sort_order;
-- ruta1 Ruta 1, ruta2 Ruta 2
```

En la app:

1. Recargar (Ctrl+Shift+R o cerrar y abrir la PWA).
2. **Rutas → Pedidos**: crear un pedido. En el servidor debe aparecer en
   `public.orders`.
3. Abrir la app en otro dispositivo con la misma cuenta: el pedido debe
   aparecer (el bootstrap lo carga al iniciar).
4. **Diagnóstico**: sin errores de sincronización de pedidos.

## Rollback

```sql
drop table if exists public.orders;
drop table if exists public.routes;
```

Si se revierte `routes`, volver a agregar los CHECK originales sobre
`public.clients.route` / `public.sales.channel` (`in ('ruta1','ruta2','ventanilla')`).

## Pendiente de seguridad

La **secret key** del proyecto de pruebas se compartió en el chat y debe
rotarse:

1. Supabase Dashboard → Project Settings → API Keys.
2. Revocar la secret key actual y generar una nueva.
3. Actualizar cualquier script local que la use (no hay ninguna copia en el
   repositorio; la app usa solo la publishable key).
