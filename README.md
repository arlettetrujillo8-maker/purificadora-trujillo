# Purificadora Trujillo ERP

Aplicación móvil y de escritorio para ventas, rutas, fiado, caja, inventario, gastos y empleados. Supabase es la fuente central de la operación; `localStorage` se usa solo para preferencias y compatibilidad.

## Acceso diario

En un dispositivo ya conectado:

- Administrador → administración directa con la cuenta central autenticada.
- Usuario → seleccionar nombre → PIN → iniciar turno.

La sesión central queda guardada en el dispositivo y se restaura automáticamente al abrir la aplicación. La contraseña solo vuelve a solicitarse si la sesión fue cerrada, revocada o dejó de ser válida. La opción Administrador no vuelve a pedir el PIN del mismo perfil durante ese inicio.

## Empleados

El administrador puede crear un empleado con nombre, rol, ruta cuando corresponda y PIN. El alias y los permisos quedan en opciones avanzadas; el rol asigna permisos base automáticamente.

En Empleados, el administrador ve el usuario de acceso y el estado del PIN. Puede generar, copiar y guardar un PIN nuevo. El PIN actual no se recupera después de guardarlo: si se pierde, se reemplaza por uno nuevo.

El PIN identifica al operador dentro del dispositivo conectado. Supabase Auth, RLS y las RPC siguen realizando la autorización real. Los PIN se guardan como hash en `app_private.operator_pins`; nunca se almacenan en texto en la tabla pública ni se devuelve el hash al navegador.

Antes de usar el alta central de empleados, despliega la migración:

`supabase/migrations/20260814071500_add_secure_operator_management.sql`

## Abrir en computadora y celular

Ejecuta `INICIAR_PREVISUALIZACION.bat`.

- Computadora: `http://localhost:8080`
- Celular en la misma red Wi-Fi: `http://TU-IPV4:8080`

También puedes iniciar el servidor con:

```bash
python -m http.server 8080 --bind 0.0.0.0
```

Mantén la ventana del servidor abierta y permite el acceso a la red privada si Windows lo solicita.

## Seguridad

- No se incluye `service_role` en el frontend.
- Las tablas expuestas conservan RLS.
- Las RPC de empleados validan un perfil central activo con rol administrador.
- El último administrador activo no puede desactivarse ni perder su rol.
- Las acciones se registran en `audit_log`.

## Verificación

```bash
Get-ChildItem tests -Filter *.test.cjs | ForEach-Object { node $_.FullName }
```

Build actual: `20260815-cierre-modal-seguro`.
