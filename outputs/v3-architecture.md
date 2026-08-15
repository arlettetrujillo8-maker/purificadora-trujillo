# Purificadora Trujillo V3 — arquitectura de migración progresiva

Fecha: 10 de agosto de 2026  
Estado: esquema V3.0 aplicado en el proyecto Supabase de la organización `purificadora trujillo`; Auth e integración operativa aún pendientes.

## Decisión de fase

El MVP V2.2 se conserva intacto como camino de rollback. V3.0 será una capa central online detrás de un adaptador de datos y una bandera de activación. V3.1, V3.2 y V3.3 no comienzan hasta aprobar V3.0 contra un proyecto de desarrollo con dos sesiones reales.

El 10 de agosto de 2026 se verificó en Chrome que la organización `purificadora trujillo` contiene un proyecto vacío exclusivo (`zzrrbmlaohdvkiggmteu`). La migración, el seed no sensible y el contrato de esquema/RLS se ejecutaron con éxito. El primer usuario Auth quedó vinculado de forma idempotente al perfil `Administrador`, centro `local`, sin copiar su contraseña al estado operativo.

## 1. Arquitectura actual

- Aplicación estática: `index.html`, `css/styles.css`, `js/app.js`, `sw.js` y manifiesto PWA.
- Todo el dominio vive en una IIFE de `js/app.js`; no hay backend ni dependencias.
- `defaultState()` contiene `settings`, `users`, `clients`, `sales`, `ledger`, `expenses`, devoluciones, correcciones, caja, inventario, rondas, insumos, mantenimiento, actividad y auditoría.
- Persistencia principal: `purificadora_state_current`; copia anterior: `purificadora_state_previous`; compatibilidad: `purificadora_trujillo_v1`.
- `saveState()` incrementa `revision`, escribe, relee y verifica. `commitState()` restaura el snapshot en memoria si falla.
- El evento `storage` detecta una revisión externa más nueva y bloquea la pestaña antigua. No fusiona cambios.
- Un JSON inválido abre recuperación bloqueante; el respaldo puede exportarse/importarse manualmente.
- Autenticación actual: usuario y PIN en texto claro dentro del estado local; `sessionStorage` guarda el usuario activo. El modo administrador usa otro PIN local.
- Autorización actual: `can()`, `canAccess()` y `requirePermission()` controlan UI y ejecución, pero el navegador sigue siendo la autoridad.
- Caja: una sesión abierta por usuario; efectivo exige `requireOpenCashSession()`. Ventas, pagos, gastos y movimientos guardan `cashSessionId`.
- Fiado: saldo derivado de `ledger` (`charge - payment`), no campo editable.
- Ventas: corrección/anulación no destructiva, con reversas de inventario, deuda y caja.
- Inventario: saldo materializado en `state.inventory` y historial en `inventoryMovements`; se rechazan negativos en el cliente.
- Rondas: carga, ventas asociadas, regreso y cierre; inventario separado por local/rutas/lavado/dañados.
- Insumos: catálogo, movimientos, compra/consumo/ajuste y gasto asociado.
- Service worker: app shell en caché y estrategia network-first; actualmente usa `index.html` como fallback incluso para assets, punto a corregir recién en V3.1.
- Rollback actual: respaldo JSON + copia anterior + aplicación V2.2 completa.

### Reutilizable

Se reutilizan interfaz, validaciones de formulario, cálculos de presentación, flujos de confirmación, modelo append-only, reglas de caja, conciliación de rondas, detección de clientes similares y exportación de respaldo. Las reglas críticas se duplicarán primero en PostgreSQL y luego el frontend llamará RPC; no se eliminará la implementación local hasta la aceptación final.

## 2. Arquitectura objetivo

```text
PWA actual
  ├─ UI y validación inmediata
  ├─ data adapter
  │   ├─ localV2Adapter (rollback)
  │   └─ supabaseV3Adapter (V3.0 online)
  ├─ Supabase Auth
  └─ supabase-js con publishable key
          │ HTTPS + JWT
          ▼
      Data API / RPC
          │
          ▼
      PostgreSQL
      ├─ public: tablas con RLS y RPC permitidas
      └─ app_private: helpers transaccionales no expuestos
```

Supabase PostgreSQL es la fuente central de verdad. V3.0 no acepta escrituras financieras mediante inserts sueltos desde el navegador: venta, pago, corrección, anulación, caja, ronda e inventario se ejecutan por RPC transaccional e idempotente.

## 3. Esquema PostgreSQL

La migración base está en `supabase/migrations/*_v3_0_central_schema.sql`.

| Tabla | Propósito |
|---|---|
| `profiles` | Identidad operativa 1:1 con `auth.users`, rol, centro, ruta y permisos adicionales. |
| `devices` | Instalaciones autorizadas y último contacto. |
| `clients` | Datos del cliente, ruta, precio especial en centavos y versión optimista. |
| `operations` | Registro idempotente por UUID, dispositivo, tipo y resultado. |
| `sales` | Cabecera inmutable de venta, importes en centavos y folio servidor. |
| `sale_corrections` | Relación y motivo entre venta original y reemplazo. |
| `payments` | Abonos a clientes. |
| `ledger_entries` | Cargos, pagos, reversas y ajustes append-only. |
| `cash_sessions` | Apertura/cierre individual por usuario y centro. |
| `cash_movements` | Entradas/salidas físicas de efectivo. |
| `expenses` | Gastos con método y relación opcional a caja. |
| `inventory_locations` | Saldo bloqueable por ubicación y tipo de garrafón. |
| `inventory_movements` | Historial append-only de traslados y consumos. |
| `rounds` | Ciclo de reparto y conciliación. |
| `supplies` | Catálogo de insumos y saldo materializado. |
| `supply_movements` | Compras, consumos, ajustes y pérdidas. |
| `maintenance_events` | Conteos y servicios realizados. |
| `audit_log` | Auditoría central append-only. |
| `settings` | Configuración tipada por clave. |
| `legacy_imports` | Equivalencias idempotentes entre IDs V2 y UUID V3. |
| `folio_counters` | Contadores serializados por tipo; no son primary keys. |

Los montos usan `bigint` en centavos. Los UUID vienen del cliente para entidades offline o de `gen_random_uuid()` en servidor. Fechas usan `timestamptz`.

## 4. Relaciones

- `profiles.auth_user_id → auth.users.id` y `profiles.id` es el actor de dominio.
- `devices.user_id → profiles.id`.
- Ventas enlazan cliente, usuario, ronda, caja, dispositivo, venta original y operación.
- `payments` enlaza cliente, usuario, caja, dispositivo y operación.
- Ledger enlaza opcionalmente venta o pago; cada efecto financiero tiene referencia única.
- Movimientos de caja enlazan sesión y referencia de negocio.
- Inventario enlaza ubicación origen/destino, ronda, usuario y operación.
- Correcciones enlazan venta original y venta sustituta sin reescribir la original.
- Auditoría enlaza actor y dispositivo sin impedir conservar eventos si una entidad de negocio se desactiva.
- `legacy_imports(source_key, entity_type, legacy_id)` identifica una importación repetida.

## 5. Constraints

- Roles, estados, métodos de pago, canales, tipos de ledger, caja, inventario, ronda e insumo usan `check`.
- Importes y cantidades no negativos; totales satisfacen `total = unit_price * quantity`, `paid + credit = total`.
- Una sola caja abierta por usuario mediante índice único parcial.
- Una sola ronda no cerrada por ruta mediante índice único parcial.
- `operations.id` es el idempotency key y su combinación con dispositivo/tipo es consistente.
- Un folio no nulo es único por entidad; los folios temporales nunca se guardan como definitivos.
- Un efecto de ledger, caja o inventario por referencia/operación usa índices únicos parciales.
- Triggers impiden `UPDATE` y `DELETE` de ledger, movimientos de caja, movimientos de inventario y auditoría para roles API.
- No se usa `ON DELETE CASCADE` sobre registros financieros.

## 6. Índices

- Clientes: teléfono normalizado, nombre normalizado, ruta, `updated_at`.
- Ventas: `occurred_at desc`, cliente, usuario, ronda, caja, estado.
- Ledger: `(client_id, created_at, id)` para saldo e historial.
- Caja: usuario/estado y sesión/fecha de movimientos.
- Inventario: ubicación/tipo y operación/referencia.
- Rondas: ruta/estado y usuario/fecha.
- Auditoría: fecha, usuario y entidad.
- Todos los foreign keys usados por RLS o reportes tienen índice explícito.

## 7. RLS

Todas las tablas en `public` tienen RLS activado y grants explícitos. `anon` no recibe acceso de negocio. `authenticated` obtiene solo `SELECT` en datos visibles y `EXECUTE` en RPC autorizadas; las tablas append-only no permiten escritura directa.

Matriz base:

| Recurso | Administrador | Ventanilla/caja/inventario | Repartidor |
|---|---|---|---|
| perfiles | todos; gestión por RPC admin | propio | propio |
| clientes | todos | local/ninguna | ruta propia o creados por él |
| ventas/pagos/ledger | todos | centro local y propios | ruta/ronda propia |
| caja | todas | propia salvo permiso ampliado | propia |
| inventario/rondas | todos | centros permitidos | ruta propia |
| insumos/mantenimiento | todos | inventario según rol | lectura necesaria |
| auditoría/settings | todos | mínimo operativo | mínimo operativo |

Las políticas usan `TO authenticated`, `(select auth.uid())` y helpers `SECURITY DEFINER` dentro de `app_private`. Esos helpers fijan `search_path`, verifican sesión/usuario activo, revocan `EXECUTE` a `PUBLIC`, `anon` y `authenticated`, y solo son invocados por políticas o RPC controladas.

Prueba negativa obligatoria: un repartidor consulta `profiles` ajenos o intenta insertar directamente en `sales`; debe recibir denegación.

## 8. Autenticación

- Supabase Auth email/password en V3.0; cada empleado tiene un `auth.users` único.
- La UX puede pedir usuario corto + PIN, pero el frontend lo transforma a un identificador interno no secreto y el PIN se valida mediante Auth/backend. Nunca se conserva el PIN en `profiles`, `localStorage` ni metadata editable por el usuario.
- Autorización en `profiles`, no en `user_metadata`. Un usuario desactivado conserva identidad Auth pero las políticas lo bloquean.
- El primer administrador se crea por un proceso de bootstrap controlado; nunca mediante clave `service_role` en el navegador.
- La sesión de supabase-js puede persistirse en almacenamiento del SDK, pero los datos operativos V2 y credenciales locales no se mezclan.

## 9. Funciones RPC

V3.0 requiere, por orden:

1. `register_sale(payload, operation_id)`.
2. `register_payment(payload, operation_id)`.
3. `correct_sale(payload, operation_id)`.
4. `void_sale(payload, operation_id)`.
5. `open_cash_session(payload, operation_id)`.
6. `close_cash_session(payload, operation_id)`.
7. `start_round(payload, operation_id)`.
8. `close_round(payload, operation_id)`.
9. `register_inventory_transfer(payload, operation_id)`.
10. `purchase_supply(payload, operation_id)` y `consume_supply(...)`.
11. `import_legacy_batch(payload, migration_id)` solo para administrador y por lotes pequeños.

Cada RPC autentica, valida rol/alcance/dispositivo, reclama `operations`, bloquea filas necesarias con `FOR UPDATE`, valida caja e inventario, aplica todos los efectos, audita y devuelve el resultado canónico. Un retry devuelve el resultado guardado.

## 10. Transacciones

Una llamada RPC corre dentro de una transacción PostgreSQL. Ejemplo de venta fiada: reclamar operación → bloquear inventario → validar disponibilidad → asignar folio → insertar venta → insertar cargo ledger → insertar movimiento inventario → insertar auditoría → completar operación. Cualquier excepción revierte todo.

El efectivo agrega validación/bloqueo de caja y un único `cash_movement`. La venta mixta registra únicamente la parte física. Las transferencias no alteran caja. No hay operaciones financieras distribuidas desde JavaScript.

## 11. Estrategia IndexedDB (V3.1, no implementada aún)

Base `purificadora_v3`, versionada, con stores: `metadata`, `session_cache`, `clients`, `inventory_locations`, `rounds`, `sales`, `payments`, `new_clients`, `sync_queue` y `conflicts`. Se guardan solo datos necesarios para el usuario/ruta y nunca `service_role`, contraseñas o PIN.

La migración desde `localStorage` será copia-verificación: IndexedDB se llena, se valida y recién entonces se cambia el lector. El respaldo V2 no se elimina.

## 12. Sync queue (V3.2, no implementada aún)

Cada elemento contiene `id`, `operationType`, `entityId`, `payload`, `dependencies`, `createdAt`, `status`, `attempts`, `nextAttemptAt`, `lastError` y hash de payload. Estados: `pending`, `syncing`, `synced`, `failed`, `conflict`.

Se procesa al abrir, en `online`, periódicamente y con “Sincronizar ahora”. Orden topológico: cliente → ronda/caja → venta → pago/corrección. Background Sync es optimización, no requisito.

## 13. Idempotencia

- El UUID de operación nace antes de tocar red y no cambia en reintentos.
- `operations.id` se inserta primero; mismo ID + mismo hash devuelve el resultado anterior; mismo ID + payload distinto genera conflicto.
- `sales.operation_id`, `payments.operation_id`, `cash_movements.operation_id` e `inventory_movements.operation_id` tienen unicidad.
- Importación usa `legacy_imports` y un `migration_id`; ejecutarla dos veces no duplica.
- Los folios se asignan al completar la transacción. Offline futuro muestra `TMP-{device}-{shortUuid}` hasta recibir folio definitivo.

## 14. Conflictos

- Clientes: compare-and-swap con `version`; diferencia produce conflicto revisable, no último cambio gana.
- Ventas/ledger/auditoría: append-only; se corrigen con nuevas operaciones.
- Caja: una operación offline solo puede referir una sesión que estaba abierta y asignada al dispositivo; divergencias se detienen.
- Inventario: la ruta descuenta de su asignación local. Si el servidor no puede validar el movimiento, no ajusta silenciosamente; crea conflicto administrativo con cantidades esperada y central.
- Duplicados de cliente: normalización y advertencia; nombre nunca bloquea por sí solo. El cliente offline conserva UUID y puede marcarse `possible_duplicate`.

## 15. Migración de datos

1. Exportar JSON V2 sin alterarlo y calcular hash SHA-256.
2. Validar versión, arreglos, referencias, saldos y no negativos.
3. Crear `migration_id` UUID y mapa estable por `entity_type + legacy_id`.
4. Crear usuarios Auth manualmente/por proceso seguro y mapear usuarios V2; nunca migrar PIN en claro.
5. Convertir dinero con redondeo explícito `Math.round(valor * 100)` y validar sumas.
6. Importar configuración, perfiles, clientes, ubicaciones, rondas, ventas, pagos/ledger, caja, gastos, inventario, insumos, mantenimiento y auditoría en ese orden.
7. Reconciliar totales por entidad, deuda por cliente, efectivo por sesión e inventario por ubicación.
8. Marcar completa solo con cero diferencias; conservar JSON y reporte.

Importaciones con referencia rota, montos no finitos, inventario negativo o diferencias financieras se rechazan completas o quedan en staging; nunca se “arreglan” automáticamente.

## 16. Rollback

- `localV2Adapter` y los tres keys de almacenamiento permanecen sin cambios.
- La activación V3 usa configuración explícita; si V3 falla antes de operar, se vuelve a V2.
- Una vez existan escrituras centrales reales, rollback no significa escribir en ambos lados. Se congela V3, exporta central, reconcilia y se decide recuperación; no se mezcla un estado V2 atrasado.
- Migraciones PostgreSQL son forward-only. Un rollback destructivo requiere backup y ventana aprobada.

## 17. Deployment

- Entornos separados: proyecto Supabase de desarrollo y de producción; nunca QA financiero destructivo en producción.
- Frontend HTTPS de prueba después de aprobar base/RLS/RPC local y de desarrollo.
- Configuración pública: `SUPABASE_URL` y publishable/anon key. Secretos solo en backend/gestión.
- El proyecto estático necesita un mecanismo de inyección de configuración por entorno; no se incrustan secretos.
- Vercel se prepara después del QA V3.0: HTTPS, headers, manifest, service worker, rutas y variables públicas.
- El service worker no debe cachear respuestas privadas de Data API ni convertir errores de assets en HTML.

## 18. Seguridad

- Sin `service_role` en frontend, repositorio, service worker, backup o logs.
- RLS y grants son la autoridad; ocultar botones es solo UX.
- RPC `SECURITY DEFINER`: schema privado, `search_path` fijo, auth obligatorio, grants mínimos y validación de dispositivo/rol.
- Inputs con checks de tipo/rango; JSON de auditoría limita tamaño.
- Ledger, caja, inventario y auditoría son append-only.
- Admin no puede degradar/desactivar al último administrador; regla también en servidor.
- `.env*`, backups y datos reales se excluyen de Git.
- Antes de desplegar: asesores de seguridad y rendimiento de Supabase sin hallazgos críticos.

Se incorporó el cambio vigente de Supabase por el cual tablas nuevas pueden no exponerse automáticamente: la migración usa grants explícitos en vez de depender de defaults.

## 19. Pruebas

### SQL/RLS automatizadas

- Esquema aplica desde cero.
- Todas las tablas expuestas tienen RLS.
- `anon` no puede leer ni escribir negocio.
- Repartidor no lee perfiles ajenos ni ventas/rondas de otra ruta.
- Usuario inactivo no opera.
- Inserts directos críticos son denegados.
- Último administrador queda protegido.

### Transacciones e idempotencia

- Misma venta dos veces: 1 venta, 1 ledger, 1 inventario y 1 caja.
- Error inducido tras insertar venta: cero efectos persistidos.
- Venta sin stock: rechazada sin cambios.
- Venta/abono en efectivo sin caja: rechazado.
- Transferencia con caja cerrada: permitida y sin movimiento efectivo.
- Corrección/anulación: original conservado y reversas exactas.

### Migración

- Dos ejecuciones del mismo backup: mismos conteos y UUID.
- Totales V2/V3 iguales en centavos, deuda, caja e inventario.
- Referencia rota o monto inválido: lote rechazado, backup intacto.

### Aceptación multiusuario

- Dispositivo A crea cliente; B lo consulta.
- A registra venta; administración la ve.
- Ruta 1 registra pago; saldo derivado se actualiza.
- Dos sesiones no duplican folio ni operación.
- Preview HTTPS funciona con login real.

## Puerta de salida V3.0

No se declara V3.0 lista hasta cumplir todos los criterios del prompt. Ya existe base central, 21 tablas visibles, RLS, RPC iniciales, primer administrador Auth y formulario de acceso central en la aplicación. El asesor de seguridad reporta cero errores y cinco advertencias esperadas por RPC `SECURITY DEFINER` expuestas únicamente a usuarios autenticados. Falta completar RPC restantes, activar el adaptador remoto para operaciones, migrar datos, probar dos dispositivos y desplegar preview HTTPS. Hasta entonces el MVP V2.2 sigue siendo el sistema operativo.
