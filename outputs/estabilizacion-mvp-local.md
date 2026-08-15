# Estabilización MVP local · Purificadora Trujillo

Fecha de cierre: 10 de agosto de 2026

## Criterio final

**B — Apto para piloto controlado en un solo dispositivo y navegador.**

También es apto para demostración. No se clasifica como producción multiusuario porque continúa usando almacenamiento local, permisos en cliente y un servidor estático sin base central.

## Alcance

La estabilización se realizó sobre el proyecto existente, sin reescribir la aplicación, cambiar branding, agregar frameworks ni migrar a Supabase.

Se conservaron ventas, fiado, pagos, caja, cortes, inventario, rondas, insumos, mantenimiento, gastos, empleados, reportes, auditoría, respaldos y PWA.

## Archivos modificados

- `index.html`: avisos de posibles clientes duplicados y elementos accesibles asociados.
- `css/styles.css`: presentación de advertencias y notificaciones legibles sobre diálogos.
- `js/app.js`: detección de duplicados, consistencia del fiado con clientes de solo nombre y corrección de venta estabilizada.
- `sw.js`: versión de caché `purificadora-trujillo-v16-mvp-local-20260810`.
- `README.md`: estado de preparación y enlace a este informe.
- `outputs/estabilizacion-mvp-local.md`: evidencia de cierre.

## Bugs y brechas corregidos

- Se añadió advertencia no bloqueante por mismo teléfono, nombre muy similar o nombre más dirección.
- Se permite conservar clientes distintos aunque tengan nombres iguales o similares.
- El fiado y la corrección de una venta fiada aceptan clientes registrados únicamente con nombre.
- Se mantuvo la prohibición de fiado a Público general.
- Se corrigió previamente la posición y contraste de notificaciones para que no queden detrás de un diálogo.
- El llenado muestra vacíos disponibles y descuenta correctamente los insumos configurados.

## Controles críticos confirmados

- `requireOpenCashSession()` centraliza la exigencia de caja para efectivo.
- Ventas, pagos, gastos y devoluciones en efectivo conservan `cashSessionId`.
- El saldo de cliente se obtiene del ledger mediante cargos menos pagos y reversas.
- El administrador operativo conserva acceso a deuda global real sin depender de `adminMode`.
- El contado de cierre inicia vacío y la diferencia exige motivo.
- Transferencias y fiado generado permanecen informativos y no alteran efectivo esperado.
- Siempre debe quedar al menos un administrador activo con permisos esenciales.
- `can(permission)` controla navegación, controles y ejecución.
- `saveState()` serializa, escribe, vuelve a leer y verifica la revisión.
- `commitState()` restaura el snapshot en memoria cuando falla la persistencia.
- Se conservan `purificadora_state_current` y `purificadora_state_previous`.
- Una revisión más nueva en otra pestaña bloquea la escritura obsoleta.
- Un JSON corrupto abre recuperación y no habilita un negocio vacío editable.
- Los movimientos de inventario e insumos rechazan saldos negativos.
- Correcciones y anulaciones conservan la venta original y generan reversas auditadas.
- El precio general inicial es $14 MXN y cada venta conserva su `unitPrice` histórico.
- Los 23 diálogos tienen control visible con `aria-label="Cerrar"` y objetivo táctil de 44 × 44 px.

## Pruebas obligatorias

Las pruebas financieras y de persistencia se ejecutaron en orígenes locales aislados durante V2.1/V2.2 y se contrastaron nuevamente con la versión actual. No se modificaron los datos operativos del puerto 8080.

| Caso | Resultado | Estado |
|---|---|---|
| 1. Efectivo con caja cerrada | Operación rechazada; venta e inventario sin cambios | Aprobado |
| 2. Transferencia con caja cerrada | Operación registrada | Aprobado |
| 3. Pago efectivo $30 con saldo $100 y caja cerrada | Rechazado; saldo $100 | Aprobado |
| 4. Pago transferencia $30 | Aceptado; saldo $70 | Aprobado |
| 5. Caja $500 + venta $140 + cobro $100 − gasto $40 | Esperado $700 | Aprobado |
| 6. Transferencia adicional $200 | Esperado permaneció $700; transferencia $200 informativa | Aprobado |
| 7. Cierre contado $680 | Campo inició vacío; diferencia −$20 y motivo obligatorio | Aprobado |
| 8. Administrador operativo con deuda $20 | Mostró deuda global real | Aprobado |
| 9. Degradar único administrador | Bloqueado | Aprobado |
| 10. Segundo administrador y degradación del primero | Permitido conservando otro administrador activo | Aprobado |
| 11. Móvil 390 × 844 | Más mostró Bloquear administración | Aprobado |
| 12. Fallo de `localStorage` durante venta | Sin éxito; estado restaurado | Aprobado |
| 13. JSON corrupto | Recuperación bloqueante sin sobrescritura | Aprobado |
| 14. Dos pestañas con revisión distinta | Escritura antigua bloqueada | Aprobado |
| 15. Inventario 3, venta 5 | Rechazada; inventario permaneció 3 | Aprobado |
| 16. Venta 5 × $14 corregida a 4 × $14 | Original conservado; inventario y dinero ajustados | Aprobado |
| 17. Anulación | Venta conservada como anulada y efectos revertidos | Aprobado |
| 18. Compra de insumo en efectivo | Stock y caja afectados una sola vez | Aprobado |
| 19. PWA sin servidor | Tras cargar e instalar caché en `127.0.0.1`, recargó con el servidor detenido | Aprobado |

## Pruebas adicionales de esta estabilización

- Cliente `María López` seguido de `Maria Lopes`: mostró **Posible cliente duplicado · nombre muy similar** sin bloquear el guardado.
- Cliente con solo nombre y forma de pago Fiado: superó la validación de contacto y avanzó hasta inventario; no se creó una venta durante la prueba.
- Sintaxis: `node --check js/app.js` y `node --check sw.js`, aprobados.
- HTML: cero identificadores duplicados.
- Diálogos: 23 encontrados y 23 cierres accesibles.
- Servidor principal: `http://localhost:8080/` continuó respondiendo con la versión actual.

## Regresión general

Se conservaron los resultados de QA de login, PIN, empleados, clientes, alta rápida, venta, cancelación, anti doble clic, fiado, pagos, caja, cortes, rutas, rondas, llenos/vacíos, inventario, insumos, mantenimiento, gastos, usuarios, reportes, auditoría, exportación, restauración y PWA.

## Riesgos restantes

- Los PIN y permisos son locales y no equivalen a autenticación/autorización de servidor.
- `localStorage` tiene cuota limitada y no ofrece transacciones reales.
- La protección entre pestañas bloquea; no fusiona cambios simultáneos.
- El respaldo externo sigue siendo manual.
- No existe una suite automatizada persistente; el QA financiero sigue dependiendo de escenarios manuales documentados.
- Permitir clientes de solo nombre aumenta el riesgo de homónimos; la advertencia ayuda, pero el operador debe revisar antes de fiar o cobrar.
- La PWA offline se verificó en un origen seguro local (`127.0.0.1`). El acceso móvil mediante una IP LAN servida únicamente por HTTP no garantiza instalación/offline en todos los navegadores.

## Limitaciones del MVP

- Debe usarse en un solo dispositivo y un solo perfil de navegador.
- No existe sincronización entre celulares o computadoras.
- No es adecuado para vendedores trabajando simultáneamente desde dispositivos independientes.
- El equipo debe exportar un respaldo JSON diario y realizar conciliación física de caja e inventario durante el piloto.

## Antes de Supabase

1. Ejecutar un piloto controlado de 7 a 14 días.
2. Registrar incidencias reales de caja, fiado, clientes duplicados e inventario.
3. Definir identificadores globales e idempotencia para cada operación.
4. Diseñar Auth y RLS por rol y centro.
5. Diseñar sincronización offline con IndexedDB y cola de salida.
6. Definir reglas de conflicto para inventario, caja y fiado.
7. Automatizar pruebas financieras antes de migrar datos.

## Conclusión

El proyecto cumple el objetivo de esta fase: **piloto controlado local en un solo dispositivo**. No cumple todavía el criterio C de producción multiusuario.
