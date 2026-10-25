# Benchmark de apps replicables → plan para Purificadora Trujillo

Fecha: 2026-10-25. Objetivo: elegir una app real de referencia y replicar sus **procesos**
con detalle en nuestro ERP, cubriendo lo pedido: ventanas móviles, facilidad de uso,
operación con 2 rutas escalable, costos de insumos y eliminación de redundancias.

## 1. Referencias

| App | Qué es | Por qué sirve | Enlace |
|---|---|---|---|
| **Yaku** | SaaS de reparto de agua/purificadoras (Laravel + app repartidor Android/iOS). Mismo negocio exacto. | Centro de ayuda público con **60+ procesos paso a paso** de Pedidos, Repartos, Ventas, Clientes, Almacén, Contabilidad, Informes. Es el mapa funcional más cercano y verificable. | https://yaku.app/software-para-purificadoras-de-agua/ · https://help.yaku.app/ |
| **Odoo `wt_water_delivery`** | Módulo open source: Water Delivery Management, Bottled Water Plant, Home Delivery, Container Deposits, Coupon Books, Subscriptions and Routes. | Modelo de datos y procesos auditables (código abierto), útil para comodatos/cupones/suscripciones. | https://apps.odoo.com/apps/modules/19.0/wt_water_delivery |
| **AwuaGo** | Software para embotelladoras/purificadoras (Applios). | Referencia comercial de módulos de planta y distribución. | https://aplios.com/portfolio/software-purificadoras-agua/ |

**Decisión:** replicar **Yaku** como referencia principal de procesos y `wt_water_delivery`
como referencia de modelo de datos. No se copia código ni diseño: se replican flujos.

## 2. Procesos de Yaku documentados → estado en nuestra app

Leyenda: ✅ ya lo tenemos · ⚠️ parcial · ❌ falta.

### Pedidos
- ❌ Crear pedido con estado (creado / programado / actualizado) y fechas.
- ❌ Programar pedido para una fecha y ruta.
- ❌ Asignar pedido a un reparto/repartidor; ordenar pedidos manualmente.
- ❌ Importar pedidos (CSV/Excel) y exportar pedidos/ventas.
- ❌ Ver pedidos anulados y menú "Acción" por pedido (procesar, anular, asignar, editar).
- ✅ Procesar/entregar en el momento (nuestra venta directa equivale a "pedido entregado").

### Repartos (nuestras "rondas")
- ⚠️ Crear reparto con repartidor: sí (ronda por ruta + empleado), ❌ **vehículo**.
- ✅ Cargar stock al reparto (garrafones llenos cargados) y recargar en ruta.
- ❌ **Zonas de reparto**: agrupar clientes por zona y generar pedidos por zona.
- ✅ Finalizar reparto con cierre financiero + stock (regreso de ronda).
- ❌ Geotracking de repartidores (GPS en vivo).
- ✅ Historial de rondas.

### Ventas (venta = pedido entregado)
- ✅ Registrar venta con canal (ventanilla/ruta/fuera de ruta/fuera de horario).
- ✅ Ventas anuladas, correcciones y devoluciones.
- ❌ Menú "Acción" unificado por venta (hoy está repartido: detalle, corregir, anular, devolver).
- ❌ Boleta/factura (CFDI) por venta.

### Clientes
- ✅ Deuda monetaria y abonos (fiado), deuda de envases, precios especiales, inactivos.
- ✅ Historial del cliente (expediente).
- ❌ Zona de reparto asignada al cliente (hoy: ruta habitual).
- ❌ Ubicación GPS del cliente.
- ❌ Campos personalizados (metacampos).
- ❌ Importar/exportar clientes (Excel/Google Contacts).
- ❌ Alerta proactiva de cliente inactivo (hoy solo se puede filtrar).

### Almacén / Producción
- ✅ Inventario por ubicación (local, ruta 1, ruta 2, lavado, dañados) y transferencias.
- ✅ Movimientos de inventario y ajustes con motivo.
- ✅ Insumos con costo unitario y consumo por garrafón (base para costeo).
- ❌ **Módulo de producción explícito**: vacíos + proceso → llenos (exchange de stock).
- ❌ Costo por garrafón calculado y visible (Σ consumo × costo).
- ❌ Lotes/rendimiento de producción y costo por lote.

### Caja y contabilidad
- ✅ Caja por centro, movimientos, entregas de efectivo, cortes, jornada.
- ✅ Gastos con forma de pago y afectación a caja.
- ❌ Conciliación automática de la liquidación del reparto contra caja.

### Informes
- ✅ Varios reportes operativos.
- ❌ Reportes por ruta/zona/repartidor y rentabilidad por garrafón (ingreso − costo insumos).

### App móvil del repartidor
- ✅ PWA instalable con modo offline y turno por PIN.
- ❌ Pantalla de inicio del repartidor con pedidos del día (hoy ve la venta genérica).
- ❌ Procesar pedido asignado desde el móvil (entrega + cobro + envases en un paso).

## 3. Procesos redundantes nuestros a eliminar

Evidencia: inventario de 37 diálogos y 30 vistas en `index.html`.

1. **Dos altas de cliente**: `clientDialog` (Clientes) y `quickClientDialog` (desde venta) con
   campos y validaciones duplicadas. → Un solo diálogo con modo `rápido/completo`.
2. **Dos formas de ajustar inventario** (`inventoryAdjustQuickDialog` + formulario de la vista)
   y **dos de transferir** (quick + vista). → Un flujo por operación, reutilizado desde donde se invoque.
3. **Tres entradas a "nueva venta"** (dashboard, vista Ventas, barra inferior) que abren el mismo
   formulario pero con estados distintos. → Un único punto de entrada con contexto.
4. **Corrección/anulación/devolución** dispersas en tres diálogos. → Un panel "Acción" por venta
   (como Yaku) que agrupa las tres.
5. **Doble captura de envases**: en la venta (intercambio) y en `containerReturnDialog`. →
   Dejar solo la entrega de envases cuando no hay venta; en venta, un solo selector.
6. **Ajustes de mantenimiento** en vista Mantenimiento y en Configuración (umbral). → Un solo lugar.

## 4. Cambios de modelo necesarios para escalar a N rutas

Hoy `ruta1/ruta2` están fijos en 8 restricciones SQL y ~65 referencias en el cliente.

1. Tabla `public.routes` (id, code, name, active, vehicle_id, sort_order) + migración que
   sustituya los CHECK por FK a `routes` (`center`, `route`, `channel`, `inventory_locations.location_code`).
2. `inventory_locations` pasa a referenciar `routes` en vez de `route_1/route_2`.
3. Selects dinámicos en UI (`clients.route`, `round.route`, `channel`, transferencias).
4. `vehicles` (nombre, placas, capacidad) asignable a reparto.
5. `orders` (pedido programado) + `order_items` + estado; se convierte en `sales` al entregar.
6. `container_ledger` (cliente, cantidad, tipo, fecha) para comodato explícito.
7. `production_batches` (vacíos consumidos, llenos producidos, merma, costo insumos).

## 5. Plan por fases (orden recomendado)

| Fase | Alcance | Criterio de aceptación | Esfuerzo |
|---|---|---|---|
| **F1 (hecho)** | Ventanas móviles: cuerpo desplazable + acción fija; 17/37 ventanas con botón fuera de pantalla → 0 | Auditoría automática 37 diálogos × 2 viewports: 0 defectos | 2 h |
| **F2** | Redundancias: unificar altas de cliente, ajuste/transferencia y panel "Acción" de venta | 6 diálogos eliminados, suite 39/39, sin flujos duplicados en UI | 1–2 días |
| **F3** | Rutas expandibles (tabla `routes`, migración, selects dinámicos) | Añadir "Ruta 3" sin tocar código; tests verdes | 2–3 días |
| **F4** | Costos de insumos: costo por garrafón + rentabilidad + producción (vacíos→llenos) | Reporte costo/garrafón y margen por venta | 2 días |
| **F5** | Pedidos programados + pantalla móvil del repartidor (pedido→entrega→cobro→envases) | Pedido creado en oficina, entregado en móvil, caja y stock cuadrados | 3–5 días |
| **F6 opcional** | Vehículos, zonas, geotracking, CFDI, tienda online | Según negocio | variable |

## 6. Decisiones pendientes

- ¿Facturación CFDI desde el inicio o solo ticket interno?
- ¿Geotracking/GPS del repartidor (privacidad + batería) o solo dirección del cliente?
- ¿Vehículos por ruta fijos o rotativos?
- ¿Producción se registra por lote o por turno?
