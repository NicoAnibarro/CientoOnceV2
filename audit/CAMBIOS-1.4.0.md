# Ciento Once 1.4.0 — correcciones y validación

8 de noviembre de 2026.

## Detalle de viandas

- Marcar entrega/cobro solo cambia la selección local. No envía peticiones ni mueve las fechas.
- La selección se mantiene entre páginas y planes del mismo cliente.
- «Aplicar cambios» envía un lote y confirma entregas, cobros y caja dentro de una transacción. Si falla una entrega, se revierte todo el lote.
- Los reintentos no duplican cobros ni cambian su fecha original.
- El orden de fechas es cronológico y se mantiene al guardar.
- Los errores conservan la selección; se puede reintentar o descartarla. Se avisa antes de salir sin aplicar.
- Se puede editar una entrega y cancelar/reactivar fechas. Cancelar/reactivar se incorpora a la selección y también requiere «Aplicar cambios».
- Se respetan los permisos de reparto, caja, ventas y administración tanto en pantalla como en la API.

## Correcciones de auditoría

- Desactivar un empleado revoca su acceso; el rol se consulta en la base.
- Se restringen las lecturas financieras y se omiten ventas/balance del dashboard según el rol.
- Los PIN deben ser numéricos y diferentes entre empleados activos, incluso en altas simultáneas. Los accesos antiguos ambiguos se rechazan.
- Editar un pedido conserva sus precios históricos, también en la vista previa del formulario.
- Los cobros repetidos conservan la fecha original y los movimientos anulados se reactivan con su nueva fecha.
- Cancelar una entrega descuenta su importe del total del plan; reactivarla lo restaura.
- Se impide mezclar clientes en una misma serie al editar una sola entrega.
- Centro comercial usa la conversión Base64 de PostgreSQL.
- Los códigos de recuperación conservan el contador de intentos fallidos. La excepción `@local.test` queda limitada a tests.
- Se normalizan números, costos opcionales, nombres, longitudes y fechas antes de guardar.
- Se pueden reactivar categorías y tipos de viandas al volver a crearlos.
- Rankings y capital de informes respetan el rango de fechas.
- El filtro de pago de entregas usa el cobro de la entrega; la ficha de clientes mantiene el criterio de saldo del plan.
- Expo respeta la URL explícita y tiene fallback al servidor de Ciento Once.
- Un fallo temporal de red no elimina la sesión guardada.
- Los fines de mes se ajustan al último día válido del mes siguiente.
- La zona comercial se fija en las conexiones de esta API, sin cambiar configuración global de PostgreSQL.
- Flyers admite hasta ocho productos y pide revisar textos/precios, sin prometer una garantía que no implementa.
- Correo desactivado informa que recuperación y solicitud externa no están disponibles; ya no simula recibir una solicitud que se pierde.

## Pruebas

- Integración y carga del repositorio: correctas contra PostgreSQL 16 local aislado.
- Carga: 1.500 clientes, productos e insumos; 1.200 pedidos y 1.200 entregas de viandas.
- 62 comprobaciones adicionales de regresión: permisos, revocación, PIN concurrentes, fechas, precios históricos, pago idempotente, rollback de lote, aislamiento entre comercios/clientes, cancelación/reactivación y bloqueo de códigos.
- Prueba de interacción React: Sara, 15 fechas entre páginas, diez entregadas/cobradas y cinco solo entregadas; ningún acceso a la API al marcar; un lote al aplicar; recuperación tras error; orden estable; edición conserva precio y mes siguiente sin desbordar.
- Expo Doctor: 18/18 comprobaciones correctas.
- Exportación Android/Hermes y sintaxis: correctas.

Las pruebas de interacción usan componentes nativos simulados; no sustituyen la prueba en un teléfono. Cámara, GPS, generación real de IA, correo y compartir archivos requieren verificación manual en el dispositivo.

## Despliegue y datos

Los cambios se limitan al repositorio y proyecto Expo de Ciento Once. No requieren migrar el esquema, importar nuevamente la base ni modificar configuración de Render compartida con otros servicios. No se accedió ni se modificó Intervet.

Los errores históricos de precios o fechas ya guardados no se reescriben automáticamente. Se conservan los datos existentes; los casos históricos dudosos deben revisarse antes de corregir sus movimientos. Los totales de una serie se sincronizan cuando se modifica una de sus entregas.

La APK requiere el backend `2026.11.08-viandas-cambios-lote` para aplicar lotes.
