# Purificadora Trujillo — pendientes post-sesión

Fecha: 18 de agosto de 2026.
Proyecto Supabase: `zzrrbmlaohdvkiggmteu` (cuenta arlettetrujillo8@gmail.com).

## Ya resuelto (no repetir)

- Migración B1 de jornada aplicada en el proyecto CORRECTO (`zzrrbmlaohdvkiggmteu`),
  no en `purificadora-trujillo-test` (`elriqlqayfqybuuwmxgu`).
- "Cerrar jornada" operativo.
- Build del frontend: `20260818-pendientes-venta-ronda`.
- Fixes de código commiteados: regreso de ronda con vacíos reales, cierre consistente,
  idempotencia de venta, anulación alineada al remanente, ventana de 30 min en
  devoluciones, eliminación de código muerto de containerDebt.

---

## 1. Cuentas reales de Ventanilla y Ruta 1 (pendiente clave)

Hoy solo Administrador tiene cuenta Supabase Auth real; toda operación queda
atribuida a él y las restricciones por rol solo ocultan botones. Para cerrar esto:

### 1.1 Crear los perfiles operativos (si no existen)

En la app (sesión Administrador) → Empleados → Nuevo usuario:

- `Ventanilla` — rol `ventanilla`, centro `local`, con PIN.
- `Ruta 1` — rol `repartidor`, centro/ruta `ruta1`, con PIN.

Anota el `id` de cada perfil:

```sql
select id, name, role, auth_user_id from public.profiles order by role, name;
```

### 1.2 Crear la cuenta Auth real para cada una

Dashboard → Authentication → Users → Add user (para cada perfil):

- Email interno: `ventanilla@purificadoratrujillo.local`, `ruta1@purificadoratrujillo.local`.
- Password fuerte, guardada en el gestor del negocio.
- Marcar "Auto Confirm User".
- Guardar el User UID que muestra Supabase.

### 1.3 Vincular la cuenta Auth con el perfil

```sql
update public.profiles set auth_user_id = '<UID-de-ventanilla>'
where id = '<id-del-perfil-Ventanilla>';
update public.profiles set auth_user_id = '<UID-de-ruta1>'
where id = '<id-del-perfil-Ruta-1>';
```

Verificar: cada renglón con `auth_user_id` distinto y no nulo.

### 1.4 Prueba de 3 sesiones

Admin, Ventanilla y Ruta 1 en navegadores/perfiles distintos. Ventanilla no debe
poder vender en ruta; Ruta 1 solo su propia ruta; la auditoría debe mostrar
"Ventanilla"/"Ruta 1", no siempre "Administrador".

---

## 2. Reconciliar el historial de migraciones del CLI

El esquema remoto no tiene `supabase_migrations.schema_migrations`; por eso
`db push` no sabe qué está aplicado. Desde la carpeta del proyecto:

```bash
npx supabase login
npx supabase link --project-ref zzrrbmlaohdvkiggmteu
npx supabase migration list
```

Lo más probable: remoto aparece vacío. Marcar como aplicadas las migraciones que
YA están en producción (son las que la app usa hoy), una por una:

```bash
npx supabase migration repair --status applied 20260810152215
npx supabase migration repair --status applied 20260811003858
npx supabase migration repair --status applied 20260811011356
npx supabase migration repair --status applied 20260811023725
npx supabase migration repair --status applied 20260811030615
npx supabase migration repair --status applied 20260811032400
npx supabase migration repair --status applied 20260811044237
npx supabase migration repair --status applied 20260811053244
npx supabase migration repair --status applied 20260811054310
npx supabase migration repair --status applied 20260814071500
npx supabase migration repair --status applied 20260814080923
npx supabase migration repair --status applied 20260814153453
npx supabase migration repair --status applied 20260814155522
npx supabase migration repair --status applied 20260814184252
npx supabase migration repair --status applied 20260814211807
npx supabase migration repair --status applied 20260814212240
npx supabase migration repair --status applied 20260814213440
npx supabase migration repair --status applied 20260815010351
npx supabase migration repair --status applied 20260815230500
npx supabase migration repair --status applied 20260815233000
npx supabase migration repair --status applied 20260817090000
```

Al final:

```bash
npx supabase db push --dry-run
```

Debe salir limpio. No correr `db push` sin `--dry-run` primero.

---

## 3. Pendientes de código que requieren decisión o migración

| Pendiente | Qué implica | Estado |
|---|---|---|
| Pérdidas de garrafones en regreso de ronda (`lostQty`) | Columna `rounds.lost_qty` ya existe; falta RPC + campo en el diálogo | Necesita migración + despliegue |
| Corrección con efecto de envases (1:1 forzado) | El RPC ya acepta `empty/damaged_return_quantity`; falta capturarlos en el diálogo de corrección | Cambio de frontend (sin migración) |
| Cierre de jornada deja inventario varado en rutas | Decisión de negocio: ¿devolver llenos de ruta al local al cerrar, o marcarlos pendientes? | Requiere decisión |

---

## Notas

- El frontend es central-only: no hay modo offline ni cola de sincronización
  (V3.2 del roadmap). Si se pierde conexión, las operaciones fallan con aviso.
- La sesión central se guarda en `localStorage` (clave `purificadora_v3_auth`).
  No limpiar "site data" del sitio en localhost:8080 salvo que se quiera salir.

---

## 5. Despliegue HTTPS (Vercel) — para el celular

El celular necesita HTTPS para que el service worker se active (app instalable,
recarga sin red y offline de verdad). Vercel lo da gratis. Ya está preparado
`vercel.json` en la raíz (estático + `Cache-Control` correcto para `sw.js`).

### Opción A — Importar desde GitHub (recomendada)

1. Sube el proyecto a GitHub (rama `main`).
2. En **vercel.com** → **Add New → Project** → importa el repo.
3. Framework: **Other** (no hace build). Deja `Output Directory` vacío o en `.`.
4. **Deploy**. Listo: `https://purificadora-trujillo.vercel.app`.

### Opción B — Con el CLI (sin GitHub)

Desde la carpeta del proyecto (requiere Node/npx):

```bash
npx vercel
```

Sigue el asistente (proyecto nuevo, `npx vercel --prod` al final).

### Después del despliegue

1. Abre la URL en el celular → **"Agregar a pantalla de inicio"**.
2. Inicia sesión una vez en línea → la app queda instalada.
3. Prueba: modo avión → la app abre, registra ventas (se encolan) → reconecta → sincroniza.

### Notas

- El login es email/contraseña (sin OAuth): Supabase no necesita cambios de
  origen para que funcione desde el dominio nuevo.
- `sw.js` se sirve sin caché para que los cambios de build lleguen a los
  dispositivos (esto lo hace `vercel.json`).
- No se despliegan secretos: la URL y la clave pública ya estaban en el repo.

---

## 4. Modo offline (build 20260818-modo-offline-v3)

Se implementó el funcionamiento offline completo. Alcance y límites:

### Qué funciona sin señal

- La app abre y muestra los datos de la última sincronización (espejo en
  IndexedDB + estado local en localStorage).
- Operaciones encoladas y sincronizadas al reconectar:
  - **Repartidor**: venta, pago/abono, alta y edición de cliente, iniciar/
    recargar/regresar/cerrar ronda, abrir/cerrar caja, movimiento de caja,
    gasto, transferencia/ajuste de inventario, devolución de venta, corrección
    y anulación, regreso de envases de cliente.
  - **Operación**: insumos (alta/movimiento), mantenimiento, llenado de
    garrafones y cierre de jornada (secuencia: cajas + rondas + frontera).
- Al volver la conexión, la cola se reenvía en orden reutilizando el mismo
  `operationId` (idempotente: un reintento no duplica).
- Indicador en el topbar: "· N pendiente(s)" + botón **Sincronizar**.
- **Panel de cola en Diagnóstico**: lista las operaciones pendientes con su
  estado y error; botones **Reintentar** (fallidas) y **Descartar**
  (conflictos/fallidas).
- **Reanudación del turno sin conexión**: si el operador inició sesión en
  línea y recarga la app sin señal, su turno se reanuda automáticamente (el
  PIN ya se validó; la sesión central en caché es la autoridad). Al cerrar
  turno o volver a línea, el flujo normal de PIN vuelve a aplicarse.

### Qué NO funciona sin señal

- Alta/edición de empleados y configuración (administrativas; requieren
  conexión).
- Validar un PIN nuevo sin conexión: el PIN se compara contra el hash del
  servidor y nunca se guarda en el cliente. La reanudación del turno cubre el
  caso real (operador que ya inició en línea); iniciar un turno nuevo desde
  cero sin señal no es posible por diseño de seguridad.

### Riesgos conocidos

- Si dos dispositivos operan la misma ruta/caja sin conexión y luego
  sincronizan, el servidor rechaza la operación conflictiva (la cola la marca
  como "conflict"; se revisa y se descarta/reintenta desde el panel de
  Diagnóstico).
- La sesión central expira (~1 h): si expira estando offline, la sincronización
  esperará a reconectar con una sesión válida.
- Prueba piloto obligatoria antes de producción: un día real con señal
  intermitente para validar la cola contra el servidor.
