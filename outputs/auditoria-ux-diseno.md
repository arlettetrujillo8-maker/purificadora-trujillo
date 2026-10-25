# Auditoría UX y diseño — Purificadora Trujillo

Base para rediseñar la distribución de elementos con foco en operación real
(purificadora, 2 rutas, ventanilla, móvil en la calle y escritorio en oficina).

## 1. Contexto de uso

- **Móvil (390×844)** es el dispositivo principal: ventas en ventanilla, entregas
  en ruta y consultas rápidas. **Escritorio (1440)** para caja, reportes,
  insumos y administración.
- Estilo ya alineado a **Fluent 2 / Windows 11** (Mica, acento #005FB8, Segoe UI
  Variable, radios 8px, contraste AA verificado).
- Vistas actuales (19): Inicio, Clientes, Nueva venta, Últimas ventas, Fiado y
  pagos, Envases pendientes, Rutas, Pedidos, Ventanilla, Caja, Inventario,
  Insumos, Mantenimiento, Gastos, Empleados, Reportes, Configuración,
  Auditoría, Diagnóstico.

## 2. Hallazgos principales

### Navegación
- 19 elementos en una sola lista lateral sin jerarquía: fatiga visual y poca
  discoverability de lo nuevo (Pedidos, Insumos).
- En móvil la barra inferior tiene 5 destinos fijos (Inicio, Venta, Clientes,
  Fiado, Más); **Pedidos no está** y es la acción clave del repartidor.

**Propuesta:** agrupar el menú en 3 bloques con separadores:
Operación (Nueva venta, Rutas, Pedidos, Ventanilla), Dinero (Caja, Fiado y
pagos, Envases, Gastos, Reportes), Catálogo (Clientes, Inventario, Insumos,
Mantenimiento, Empleados, Configuración). En móvil: Inicio · Venta · Rutas ·
Caja · Más (Pedidos dentro de Rutas como pestaña).

### Inicio (dashboard)
- Hoy muestra conteos y una tabla, pero **no dirige la acción**: no hay
  “siguiente paso” claro ni pedidos/rondas del día.
- Métricas repartidas sin jerarquía: ventas, cobrado, fiado, envases, caja,
  stock bajo compiten por atención.

**Propuesta de distribución:**
1. Fila de 3 KPI accionables: **Vendido hoy**, **Por cobrar**, **Pedidos por
   entregar** (cada uno navega a su vista).
2. Fila de 3 acciones grandes: **Nueva venta**, **Cobrar fiado**, **Entregar
   pedido** (la tercera solo si hay pendientes).
3. Panel “Para hoy”: pedidos por ruta ordenados por fecha + ronda activa.
4. Panel “Atención”: stock bajo, insumos bajo mínimo, caja cerrada, ventas sin
   sincronizar (offline).

### Nueva venta
- Flujo correcto pero largo en una columna: cliente → canal → cantidad →
  precio → total → pago → efectivo/cambio → acciones → envases → notas →
  resumen.
- En escritorio el formulario deja mucho espacio vacío a la derecha y el
  resumen/acciones quedan lejos del total.
- En móvil el botón Registrar ya está bajo el total (bueno), pero envases y
  notas quedan después del botón: se pueden pasar por alto.

**Propuesta:**
- Escritorio: 2 columnas — izquierda formulario, derecha resumen pegajoso
  (total grande, efectivo recibido/cambio, acciones, cliente). Envases en la
  columna izquierda antes de notas.
- Móvil: una columna con **barra de acción compacta** (Total + Registrar) y
  secciones colapsables para envases/notas; recordatorio visual si hay
  envases especiales.
- Total con tipografía 24–28 px; un solo botón primario por vista.

### Rutas y Pedidos
- “Entregar” existe en Rutas y en Pedidos: duplica superficie y puede confundir
  sobre dónde se opera.
- Pedidos en el menú compite con Rutas en el uso diario.

**Propuesta:** dentro de **Rutas**, pestañas **Ronda | Pedidos** con contador;
Pedidos conserva vista propia solo para administración (crear/editar). En ruta:
tarjetas por pedido con cliente, garrafones y total, botón Entregar de 44px.

### Insumos y Reportes
- Insumos tiene métricas + desglose + tabla: tres bloques con estilos
  distintos (metric-grid, panel-head, table-responsive).
- Reportes usa `.reports-metrics` con otro formato de tarjeta y 3+ tablas sin
  filtro pegajoso.

**Propuesta:** unificar en 3 componentes base: **StatCard**, **DataTable**,
**ActionRow**. Filtros de reportes en barra pegajosa + botón exportar.

### Consistencia y accesibilidad
- Formatos de moneda/fecha correctos, contraste AA y objetivos táctiles ≥44 px
  ya verificados.
- Falta foco visible consistente en botones de texto y estados “sin
  conexión/sincronizando” unificados.
- Banner offline: hoy el estado vive en la barra superior; en móvil debe ser una
  franja persistente con “Sin conexión · operando local · N pendientes” y botón
  Sincronizar.

## 3. Priorización

| # | Cambio | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Inicio accionable (KPI + acciones + para hoy + atención) | Alto | Bajo |
| 2 | Nueva venta en 2 columnas (escritorio) y acciones pegajosas | Alto | Medio |
| 3 | Rutas con pestañas Ronda/Pedidos y menos entradas de menú | Alto | Medio |
| 4 | Componentes StatCard/DataTable/ActionRow unificados | Medio | Bajo |
| 5 | Banner offline persistente en móvil | Alto | Bajo |
| 6 | Reportes con filtros pegajosos y exportación | Medio | Medio |

## 4. Métricas de éxito

- Vender: ≤ 2 toques desde Inicio (hoy: Inicio → Venta → capturar).
- Entregar pedido: ≤ 2 toques desde Inicio.
- Sin scroll horizontal en 390 px; todo control táctil ≥ 44 px.
- 0 recargas o pantallas en blanco por pérdida de red.
- Contraste AA en vistas y diálogos (se mantiene la auditoría automática).

## 5. Fase sugerida

1. **Fase 1 (implementada):** Inicio accionable + banner offline + StatCard.
2. **Fase 2 (implementada):** Nueva venta en 2 columnas con resumen pegajoso y notas colapsables.
3. **Fase 3:** Rutas con pestañas y menú agrupado.
4. **Fase 4:** Reportes con filtros/export y unificación de tablas.
