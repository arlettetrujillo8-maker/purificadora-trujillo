# Reparación Purificadora Trujillo V2.1

Fecha de QA: 10 de agosto de 2026

## Cambios realizados

- Se creó una regla central `requireOpenCashSession()` para impedir movimientos físicos de efectivo cuando el usuario autenticado no tiene una caja abierta.
- Ventas, pagos de fiado, gastos y devoluciones guardan `cashSessionId` cuando el movimiento corresponde a efectivo. Las transferencias continúan permitidas con caja cerrada.
- El cálculo de caja usa la sesión identificada como fuente principal y mantiene compatibilidad con movimientos históricos sin `cashSessionId`.
- El administrador en modo operativo puede consultar deuda global real. Las herramientas sensibles siguen dependiendo de `adminMode`.
- El cierre inicia con **Efectivo contado** vacío, calcula esperado/contado/diferencia y exige motivo cuando la diferencia no es cero.
- Se protege al último administrador activo contra degradación, desactivación o retiro de permisos esenciales. Con dos administradores sí puede degradarse uno.
- El cambio de PIN administrativo exige PIN actual, PIN nuevo y confirmación.
- El menú móvil **Más** muestra **Bloquear administración** durante `adminMode`; se corrigió además el espacio inferior para que la barra móvil no cubra la acción.
- La autorización de vistas y acciones deriva de `ACCESS_POLICY`, y las funciones sensibles vuelven a comprobar permisos aunque el botón no sea visible.
- `saveState()` ahora incrementa `revision`, escribe, vuelve a leer y verifica la revisión antes de devolver éxito.
- Las operaciones críticas conservan un snapshot en memoria y usan `commitState()` para revertir si la persistencia falla.
- Se mantienen `purificadora_state_current` y `purificadora_state_previous`. El estado anterior se copia antes de cada escritura.
- Un JSON inválido abre un diálogo de recuperación sin sobrescribir el dato crudo. Permite descargarlo, restaurar una copia válida o iniciar el borrado manual protegido.
- El evento `storage` y la comprobación previa a cada escritura detectan revisiones más nuevas y bloquean la pestaña desactualizada hasta recargar.
- La importación valida y prepara el estado completo antes de activarlo; si falla la escritura verificada, recupera el estado anterior.
- Se conservaron el botón Cancelar y la protección contra doble registro de la pantalla Nueva venta.

## Archivos modificados

- `index.html`: controles, indicadores y diálogos de caja, conflicto y recuperación.
- `css/styles.css`: estado administrativo, recuperación y accesibilidad del bloqueo móvil.
- `js/app.js`: reglas de caja, autorización, persistencia, rollback, recuperación y concurrencia.
- `sw.js`: actualización de la versión de caché PWA.
- `README.md`: reglas operativas y alcance de V2.1.
- `outputs/reparacion-v2.1.md`: este reporte.

## Bugs corregidos

- Venta o abono en efectivo aceptados sin caja.
- Movimientos de caja reconstruidos sólo por usuario y hora, sin vínculo explícito de sesión.
- Deuda global del administrador mostrada como cero al cerrar `adminMode`.
- Efectivo contado precargado con el importe esperado.
- Posibilidad de dejar el sistema sin administrador activo.
- Acción para bloquear administración inaccesible detrás de la barra móvil.
- Políticas distintas para navegación, visibilidad y ejecución.
- Mensajes de éxito emitidos aunque `localStorage` no confirmara la escritura.
- Carga silenciosa de un negocio vacío ante JSON corrupto.
- Sobrescritura silenciosa desde una pestaña con revisión antigua.
- Importación capaz de reemplazar estado antes de completar todas las validaciones.

## Pruebas ejecutadas

Las pruebas funcionales se ejecutaron en un origen local aislado; no se modificó el servidor del usuario en el puerto 8080.

| # | Escenario | Resultado observado | Estado |
|---|---|---|---|
| 1 | Venta de $30 en efectivo con caja cerrada | Apareció **Caja cerrada**; ventas e inventario no cambiaron | Aprobada |
| 2 | Venta de $30 por transferencia con caja cerrada | Venta registrada y reportada como transferencia | Aprobada |
| 3 | Abono de $30 en efectivo sobre deuda de $100, sin caja | Operación bloqueada; saldo permaneció en $100 | Aprobada |
| 4 | Abono de $30 por transferencia, sin caja | Operación aceptada; saldo quedó en $70 | Aprobada |
| 5 | Caja $100 + venta efectivo $30 + abono efectivo $10 | Efectivo esperado calculado en $140 | Aprobada |
| 6 | Cierre con contado $135 y esperado $140 | Campo inició vacío; diferencia -$5; motivo obligatorio | Aprobada |
| 7 | Administrador operativo con deuda | Fiado mostró el saldo global real al cerrar `adminMode` | Aprobada |
| 8 | Degradar al único administrador | Bloqueado con instrucción para crear otro administrador | Aprobada |
| 9 | Crear segundo administrador y degradar al primero | Permitido; permaneció un administrador activo | Aprobada |
| 10 | Viewport 390 × 844, abrir Más y bloquear administración | Acción visible, táctil y efectiva; volvió al modo operativo | Aprobada |
| 11 | Fallo inyectado temporalmente en persistencia durante venta | No mostró éxito, restauró UI/estado anterior y habilitó reintento | Aprobada |
| 12 | JSON actual inválido con copia anterior válida | Abrió recuperación, no habilitó negocio vacío y restauró la copia válida | Aprobada |
| 13 | Dos pestañas con revisiones distintas | La pestaña antigua mostró aviso bloqueante y recargó la revisión nueva | Aprobada |

La inyección usada en las pruebas 11 y 12 fue retirada al terminar. No quedó ningún hook de QA en el código.

### QA de regresión

- Login de empleado, PIN y acceso administrativo oculto: aprobados.
- Bloqueo administrativo de escritorio/móvil e indicador de modo: aprobados.
- Nueva venta, cancelación y anti doble envío: aprobados.
- Clientes, fiado, transferencias y pago mixto: flujo y permisos conservados.
- Rutas, Ventanilla, Caja e Inventario: módulos accesibles en modo operativo según política.
- Mantenimiento, Gastos, Usuarios, Reportes, Configuración y Auditoría: módulos accesibles en modo administrador.
- Carga limpia de una pestaña nueva: sin errores de consola.
- Sintaxis JavaScript: `node --check js/app.js` aprobado.
- HTML: sin identificadores duplicados.
- PWA: después de detener el servidor de QA, una recarga continuó mostrando la aplicación desde caché.

## Resultados

Los criterios críticos de V2.1 quedaron cubiertos: no hay efectivo sin caja, las transferencias siguen operando, la deuda administrativa no produce falsos ceros, el cierre no sugiere el contado, el último administrador queda protegido, la acción móvil es usable y la persistencia no confirma operaciones antes de verificarlas. La corrupción y la concurrencia local ahora detienen la edición en lugar de descartar o sobrescribir datos silenciosamente.

## Riesgos pendientes

- La aplicación continúa siendo local y los PIN permanecen en almacenamiento del navegador; no equivalen a autenticación de servidor.
- `localStorage` tiene cuota limitada y no ofrece transacciones reales. Los snapshots y revisiones reducen riesgo, pero no sustituyen una base de datos.
- La concurrencia V2.1 bloquea y obliga a recargar; no fusiona cambios simultáneos.
- Los movimientos históricos sin `cashSessionId` usan la asociación compatible por usuario y rango horario hasta que todos los cortes sean nuevos.
- La restauración depende de que `previous` sea estructuralmente válida; siempre se conserva la opción de descargar el dato crudo.

## Diferencias respecto a auditoría

| Hallazgo de auditoría | Estado V2.1 |
|---|---|
| Caja no obligatoria para efectivo | Regla central aplicada antes de mutar |
| Deuda administrativa inconsistente | Acceso global explícito en modo operativo |
| Cierre sesgado por precarga | Contado vacío y diferencia razonada |
| Último administrador vulnerable | Invariante de al menos un administrador activo |
| Bloqueo móvil oculto/inaccesible | Acción visible y libre de la barra inferior |
| Permisos contradictorios | Política central para vistas y permisos |
| Escritura no verificada | Lectura posterior, revisión y rollback |
| JSON corrupto reemplazado por default editable | Recuperación bloqueante sin sobrescritura |
| Pestañas con último escritor ganador | Revisión y bloqueo de la pestaña obsoleta |

## Qué queda para V2.2

- Diseñar migración controlada a un backend transaccional, sin ejecutarla todavía.
- Sustituir PIN local por autenticación real y autorización del lado servidor.
- Incorporar respaldos remotos, historial de versiones y recuperación administrada.
- Definir sincronización multiusuario y resolución de conflictos con operaciones idempotentes.
- Añadir una suite automatizada persistente para los flujos financieros y de permisos.
