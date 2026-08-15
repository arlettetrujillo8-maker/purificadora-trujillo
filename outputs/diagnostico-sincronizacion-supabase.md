# Diagnóstico de sincronización multiusuario Supabase

Fecha: 11 de agosto de 2026.

## Clasificación

**Caso A — La operación no llega a Supabase por falta de sesión Auth central.**

En los dos contextos inspeccionados, la aplicación muestra:

- `Central disponible · inicia sesión`;
- `Modo operativo · Conexión requerida`;
- `centralMode: false`;
- sin `User ID`, `Profile ID` ni rol central;
- Realtime desconectado;
- ninguna consulta central ejecutada.

El turno local de empleado (`Administrador · Local`) no sustituye la sesión de Supabase Auth. Sin sesión central, las consultas anónimas a `public.clients` reciben HTTP 401 y las RPC operativas no pueden persistir datos.

## Árbol A/B/C/D/E

### A) La operación NO llega a Supabase

**CONFIRMADO.** La sesión Auth central no existe en los contextos probados, el perfil no puede resolverse y `centralMode` permanece falso. Polling, foco y Realtime no se inician porque dependen de una sesión y perfil activo.

### B) Llega a Supabase pero el segundo dispositivo no la consulta

**No aplica en el estado actual.** El segundo dispositivo todavía no puede ejecutar la consulta autenticada. Ambos orígenes apuntan al mismo proyecto.

### C) La consulta devuelve el registro pero la UI no cambia

**No observado.** No existe una consulta central autenticada que permita separar repository/render/state.

### D) Solo aparece al recargar

**Riesgo secundario, no causa primaria actual.** El código contiene polling de 10 segundos y refresh al recuperar foco, pero ambos están detenidos sin perfil. Realtime se suscribe a cambios de `public`, aunque no existe una migración local que agregue expresamente las tablas a `supabase_realtime`; debe confirmarse en el proyecto cuando la sesión central esté activa.

### E) Proyectos Supabase distintos

**Descartado.** `localhost:8080` y `192.168.0.174:8080` entregan el mismo archivo de configuración, el mismo `projectRef` (`zzrrbmlaohdvkiggmteu`) y la misma clave pública por hash. No se expuso la clave en este reporte.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Misma aplicación/configuración | Sí |
| Mismo proyecto Supabase | Sí |
| Misma clave pública | Sí, hash idéntico |
| Auth válida | No |
| Profile válido/activo | No disponible sin Auth |
| Central mode | `false` |
| Repositorios clientes/ventas | Supabase cuando central está activo |
| Consulta anónima a clientes | HTTP 401 esperado por seguridad |
| Realtime | Desconectado porque no se inicia sin perfil |
| Polling 10 s | Implementado, no iniciado sin perfil |
| Refresh al foco | Implementado, condicionado a `store.profile` |
| Caché PWA | Se detectó mezcla de HTML/JS antiguos; versionado explícito agregado después del diagnóstico |

## Panel temporal

En hosts de desarrollo y red local se muestra un panel que no contiene tokens ni contraseñas y presenta:

- App URL y build;
- Project URL;
- User ID;
- Profile ID y rol;
- Central mode;
- último refresh del servidor;
- estado Realtime;
- último evento recibido;
- cantidad de filas de la última consulta de ventas.

## Próxima comprobación operativa

1. En cada dispositivo, pulsar `Central disponible · inicia sesión` e iniciar sesión con una cuenta Supabase que tenga perfil activo.
2. Confirmar en el panel `Central mode: true`, Profile ID presente y Realtime conectado.
3. Registrar una sola operación de QA autorizada.
4. Confirmar la fila en Supabase y observar `Last server refresh`, `Last received event` y `Last query row count` en el segundo dispositivo.

No se registró ninguna venta ni se modificaron datos operativos durante este diagnóstico.
