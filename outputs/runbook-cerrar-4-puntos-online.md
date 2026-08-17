# Runbook — cerrar los 4 puntos de certificación online (V3.0.2)

Fecha de este runbook: 16 de agosto de 2026.
Proyecto Supabase: `zzrrbmlaohdvkiggmteu` (organización "purificadora trujillo").

Este documento es para ejecutarse cuando tengas acceso a una computadora con:
- Acceso al Dashboard de Supabase del proyecto (como Arlette, o como miembro invitado).
- Node/npx disponible en la terminal (para el CLI de Supabase).

No borra ni modifica nada existente hasta que tú corras los comandos — puedes leerlo completo antes de empezar.

---

## Causa raíz (contexto, ya confirmado en el código)

Hoy solo el perfil **Administrador** tiene una cuenta real de Supabase Auth
(`profiles.auth_user_id` distinto de null). El servidor decide "quién eres"
en cada operación por esa cuenta real (`auth.uid()`), **no** por el PIN que
se teclea en la pantalla. Resultado: toda venta, pago o movimiento que se
registre desde cualquier dispositivo queda atribuido al Administrador, y las
restricciones por rol (ej. "un repartidor solo vende en su ruta") no se
aplican de verdad en el servidor — solo se ocultan botones en pantalla.

Cerrar el punto 1 (crear cuentas reales para Ventanilla y Ruta 1) es lo que
arregla esto de raíz.

---

## Punto 1 — Crear cuentas reales para Ventanilla y Ruta 1

### 1.1 Crear los perfiles operativos (si no existen todavía)

Desde la app, con sesión de Administrador:
1. Entra a **Empleados** (o el menú de usuarios) → **Nuevo usuario**.
2. Crea (o confirma que ya existan) los perfiles:
   - Nombre: `Ventanilla`, rol: `ventanilla`, centro: `local`, con su PIN.
   - Nombre: `Ruta 1`, rol: `repartidor`, centro/ruta: `ruta1`, con su PIN.
3. Anota el **ID** de cada perfil. Si no lo ves en la interfaz, lo sacas con
   esta consulta en el **SQL Editor** de Supabase:

```sql
select id, name, username, role, center, route, auth_user_id
from public.profiles
order by role, name;
```

Guarda el `id` de los renglones `Ventanilla` y `Ruta 1` (los que tengan
`auth_user_id` en `null`).

### 1.2 Crear la cuenta real de Supabase Auth para cada una

En el Dashboard: **Authentication → Users → Add user**.

Para cada una (Ventanilla, Ruta 1):
- Email: usa algo interno y controlado por ustedes, ej.
  `ventanilla@purificadoratrujillo.local` y `ruta1@purificadoratrujillo.local`
  (no tiene que ser un correo real que alguien revise; es solo la
  identidad técnica del dispositivo/rol).
- Password: genera una contraseña fuerte y guárdala en un lugar seguro
  (gestor de contraseñas del negocio, no en el chat ni en el repo).
- Marca **"Auto Confirm User"** (o el equivalente) para que no dependa de
  un correo de verificación — es una cuenta interna, no de un cliente.
- Guarda el **User UID** que te muestra Supabase al crearla (lo necesitas
  en el siguiente paso).

### 1.3 Vincular la cuenta real con el perfil operativo

En el **SQL Editor**, uno por uno:

```sql
-- Ventanilla
update public.profiles
set auth_user_id = '<UID-de-ventanilla-del-paso-1.2>'
where id = '<id-del-perfil-Ventanilla-del-paso-1.1>';

-- Ruta 1
update public.profiles
set auth_user_id = '<UID-de-ruta1-del-paso-1.2>'
where id = '<id-del-perfil-Ruta-1-del-paso-1.1>';
```

Verifica que quedó bien:

```sql
select id, name, role, auth_user_id
from public.profiles
where role in ('ventanilla','repartidor');
```

Cada renglón debe tener ahora un `auth_user_id` distinto de null y distinto
entre sí (y distinto del Administrador).

> Nota de alcance: esto crea **una cuenta por rol/dispositivo**, que es lo
> que pedía la certificación original (probar Admin, Ventanilla y Ruta 1
> como tres sesiones separadas). Si más adelante quieren que cada
> repartidor tenga su propia identidad real (no solo por ruta), es un
> paso aparte — avísame cuando quieran platicarlo, es una decisión de
> alcance, no una corrección de bug.

---

## Punto 4 — CLI de Supabase: login, link y reconciliar migraciones

Desde la terminal, en la carpeta del proyecto:

```bash
npx supabase login
npx supabase link --project-ref zzrrbmlaohdvkiggmteu
```

Esto pedirá autenticarte (abre el navegador) — usa la cuenta con acceso
al proyecto (la de Arlette, o la tuya si ya te agregó como miembro).

Como las migraciones se aplicaron manualmente por el SQL Editor, el CLI no
tiene su historial. Antes de correr `supabase db push` (que podría intentar
re-aplicar todo y fallar o duplicar), revisa el estado:

```bash
npx supabase migration list
```

Esto compara las migraciones locales (`supabase/migrations/*.sql`, hay 20
archivos) contra lo que el CLI cree que está aplicado en remoto. Lo más
probable es que remoto aparezca vacío aunque el proyecto ya tenga todo
aplicado.

Para cada migración que confirmes que **ya está aplicada en producción**
(que debería ser las 20, ya que la app funciona hoy con ese esquema), márcala
como aplicada sin volver a correrla:

```bash
npx supabase migration repair --status applied <timestamp_1>
npx supabase migration repair --status applied <timestamp_2>
# ... una por cada archivo en supabase/migrations, en orden
```

(El `<timestamp>` es el prefijo numérico del nombre del archivo, ej.
`20260810152215` para `20260810152215_v3_0_central_schema.sql`.)

Al terminar, confirma que no hay diferencias pendientes:

```bash
npx supabase db push --dry-run
```

Si sale limpio (sin cambios propuestos), el historial ya quedó reconciliado.
**No corras `db push` sin `--dry-run` primero** — si muestra cambios que no
esperabas, avísame antes de aplicarlos.

---

## Puntos 2 y 3 — Probar Admin, Ventanilla y Ruta 1 en sesiones separadas

Con las cuentas ya creadas y vinculadas:

1. Abre 3 navegadores/perfiles distintos (o modo incógnito para cada uno):
   uno logueado como Administrador, otro como Ventanilla, otro como Ruta 1
   (con las contraseñas reales del paso 1.2 — ya no solo el PIN).
2. Desde **Ventanilla**: registra una venta de ventanilla. Verifica que
   **no puede** registrar una venta de ruta1/ruta2 (debe rechazarla el
   servidor, no solo ocultar el botón).
3. Desde **Ruta 1**: inicia una ronda, registra una venta en esa ruta.
   Verifica que Ruta 1 no puede tocar rondas/ventas de ruta2.
4. Desde **Administrador**: confirma que ve todo, y revisa la
   **auditoría** — cada acción ahora debe aparecer atribuida a
   "Ventanilla" o "Ruta 1" según corresponda, **no** siempre a
   "Administrador" (esta es la prueba de que el punto 1 realmente se
   cerró).
5. Confirma que los cambios de una sesión se reflejan en las otras al
   refrescar (clientes, saldo, inventario).

Si algo de esto falla, es información valiosa — tráemela y seguimos desde
ahí en vez de asumir que ya quedó cerrado.
