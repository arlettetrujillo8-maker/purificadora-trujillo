# Reparación Purificadora Trujillo V2.2

Fecha de cierre: 10 de agosto de 2026

## Alcance realizado

La actualización se implementó sobre la aplicación existente, sin frameworks, migraciones ni rediseño general. Se conservaron las protecciones de seguridad, dinero, persistencia e integridad de V2.1.

### Operación diaria

- Los 23 diálogos tienen cierre visible y táctil de 44 × 44 px.
- Los formularios modificados piden confirmación antes de descartar datos; los formularios limpios cierran directamente.
- Alta rápida de empleados con permisos base por rol y permisos avanzados desplegables.
- Alta rápida de clientes desde Nueva venta, conservando cantidad, canal, pago, precio y notas.
- Vista Últimas ventas con detalle, estado y folios históricos.
- Corrección de venta mediante reversa y nueva operación; el original queda marcado como corregido.
- Anulación administrativa mediante reversa; el original permanece visible como anulado.
- Precio general configurable con valor inicial de $14.00, precio especial opcional y motivo obligatorio para excepciones.

### Rondas e inventario

- Rondas numeradas por ruta y día, con carga desde Local y asociación automática de ventas.
- Regreso con llenos, vacíos, dañados y pérdidas; validación física antes del cierre.
- Los vacíos regresan a Lavado y el llenado los convierte en existencia llena de Local.
- Existencias separadas para llenos y vacíos de Local, Ruta 1 y Ruta 2, además de Lavado y Dañados.

### Caja

- Corte completo: fondo, ventas en efectivo, cobros de fiado, gastos, devoluciones, movimientos, entregas, esperado, contado y diferencia.
- Motivo obligatorio cuando el conteo no coincide.
- Historial de cortes con detalle y resumen consolidado del día.
- Movimientos autorizados y entrega interna entre cajas sin duplicar ingresos.
- Correcciones posteriores a un corte cerrado generan ajuste trazable en la caja vigente; no reescriben el corte histórico.

### Insumos

- Catálogo administrado con nombre, categoría, unidad, existencia, mínimo, costo, proveedor y consumo por garrafón.
- Compras, consumos y ajustes por conteo con historial y auditoría.
- Cada compra genera un único gasto y, cuando afecta efectivo, exige caja abierta.
- Bloqueo de saldos negativos, valor estimado y alertas por stock bajo.

## Evidencia de QA ejecutada

| Caso | Resultado observado | Estado |
|---|---|---|
| Empleado repartidor | Alta de Juan, PIN 4321, acceso y centro Ruta 1 | OK |
| Cliente rápido | Pedro creado desde venta; cantidad, canal, pago y notas permanecieron | OK |
| Ronda 1 | Carga 40, venta 30, regreso 10 llenos/30 vacíos, llenado 30 | OK |
| Ronda 2 | Numeración consecutiva y cierre independiente; historial preservado | OK |
| Corrección | Venta de 5 reemplazada por 4, original visible como CORREGIDA | OK |
| Anulación | Venta corregida anulada, original visible como ANULADA | OK |
| Precio histórico | Cambio general 14 → 15 no modificó ventas previas a $14 | OK |
| Corte de caja | Fondo 500 + venta 140 + abono 100 − gasto 40 = esperado 700 | OK |
| Diferencia de caja | Conteo 680 produjo diferencia −20 con motivo obligatorio | OK |
| Caja cerrada | Nueva venta en efectivo bloqueada y ofreció abrir caja | OK |
| Insumo | Tapas: inicial 500, consumo 40 = 460, compra 200 = 660 | OK |
| Stock negativo | Consumo de 500 rechazado; saldo permaneció en 460 | OK |
| Compra y gasto | Compra $100 creó exactamente un gasto; total gastos $140 con gasto previo $40 | OK |
| Stock bajo | Mínimo 700 con saldo 660 apareció en Inicio | OK |
| Persistencia | Recarga conservó saldo 660, mínimo 700 y movimientos | OK |
| Diálogos | Formulario modificado mostró “¿Cerrar sin guardar?” | OK |

## Validaciones estáticas

- `node --check js/app.js`: sin errores de sintaxis.
- `node --check sw.js`: sin errores de sintaxis.
- IDs HTML duplicados: ninguno.
- Diálogos encontrados: 23; controles visibles de cierre: 23.

## Archivos principales modificados

- `index.html`: vistas, formularios y diálogos V2.2.
- `css/styles.css`: componentes, estados y adaptación móvil.
- `js/app.js`: modelo, reglas de negocio, permisos, persistencia y renderizado.
- `sw.js`: actualización de caché PWA.
- `README.md`: operación y acceso local.

## Limitación explícita

La aplicación continúa siendo local y de un solo navegador. La protección entre pestañas evita sobrescrituras accidentales, pero no sustituye concurrencia multiusuario ni autorización de servidor.

## Ajuste posterior de UX · llenado

- El formulario muestra la cantidad real de vacíos disponibles en Lavado.
- La cantidad queda limitada a esa existencia y el botón se desactiva cuando el saldo es cero.
- El mensaje explica que los vacíos ingresan a Lavado al cerrar el regreso de una ronda.
- Se verificó en navegador el caso de saldo cero y se corrigió el descuento de insumos configurados durante el llenado.
