# Ciento Once V2

Aplicación móvil para gestionar clientes, productos, pedidos, viandas recurrentes, rutas de reparto, stock orientativo, insumos, compras, caja e informes. Cada operación queda limitada al comercio identificado por el JWT.

## Requisitos

- Node.js LTS.
- PostgreSQL 16 o superior (producción: Aiven for PostgreSQL).
- Expo Go actualizado en el teléfono.

## Base de datos

El esquema consolidado está en `database/001_schema_postgresql.sql`. Para importarlo usando las variables de `back-end/.env`:

```powershell
cd back-end
npm.cmd run db:import
```

La importación es idempotente: crea las tablas e índices faltantes sin borrar datos existentes.

## Backend

```powershell
cd back-end
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Complete en `.env` la conexión PostgreSQL y un `JWT_SECRET` largo. Para Aiven use `DB_SSL=true`; se recomienda cargar su CA mediante `DB_CA_CERT_BASE64`. Si no se carga la CA, Aiven también admite `DB_SSL_REJECT_UNAUTHORIZED=false`.

- Salud de la API: `http://localhost:3000/api/health`
- Prueba de PostgreSQL: `http://localhost:3000/api/test-db`

## Frontend

La app usa primero `EXPO_PUBLIC_API_URL` y, si falta, la API publicada de Ciento Once. Para trabajar contra Render no necesita un backend local. Para probar un backend local, configure `front-end/.env` con una URL accesible desde el teléfono:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.100:3000/api
```

Luego:

```powershell
cd front-end
npm.cmd install
npx.cmd expo start
```

## Seguridad y consistencia

La API recalcula importes, usa consultas parametrizadas y toma `id_usuario` exclusivamente del JWT. Los cambios de pedidos, stock y caja se ejecutan en transacciones. Los cobros poseen claves únicas por usuario, origen e ID para impedir movimientos duplicados.

## Comandos

- Desarrollo backend: `npm.cmd run dev`
- Producción/local: `npm.cmd start`
- Validar sintaxis: `npm.cmd run check`
- Importar esquema PostgreSQL: `npm.cmd run db:import`
- Pruebas aisladas en un esquema temporal: `npm.cmd run test:isolated`
- Expo: `npx.cmd expo start`
- Diagnóstico Expo: `npx.cmd expo-doctor`
- Regresiones contra el PostgreSQL descartable local de auditoría: `npm.cmd run test:regression` (backend).
- Prueba de interacción del detalle de viandas: `npm.cmd test` (frontend).

## Detalle de viandas

Las casillas de entrega y cobro se editan localmente, incluso al pasar de página o cambiar de plan. El botón **Aplicar cambios** envía una sola petición y confirma todo dentro de una transacción. Ante un error no se guarda ningún cambio del lote; la selección permanece para reintentar. Las fechas conservan su orden y la app avisa antes de salir con cambios pendientes. Reparto modifica entregas; caja modifica cobros; ventas y administración pueden realizar ambas operaciones.

## APK Android

El proyecto EAS es `@cientoonce/ciento-once-v2` (`8e6f5174-c656-4aff-8ee3-083da5a3d075`). El perfil `preview` genera una APK instalable mediante `eas build --platform android --profile preview`. La clave de Maps Android se configura en el entorno EAS como `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`; no guardar claves reales en Git. Esta versión requiere desplegar también el backend actualizado para habilitar el guardado de viandas en lote.

Los SQL numerados históricos corresponden a MySQL. Para PostgreSQL se usa `001_schema_postgresql.sql`; volver a importarlo no reemplaza una migración de columnas de una base existente. Estas correcciones no requieren cambios de esquema ni reimportar la base productiva.

## Despliegue

- API: `https://ciento-once-v2-api.onrender.com/api`
- Salud: `https://ciento-once-v2-api.onrender.com/api/health`
- Base: Aiven for PostgreSQL, base `defaultdb`.

### Render

- Root Directory: `back-end`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Variables requeridas: `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `JWT_SECRET`, `JWT_EXPIRES_IN` y `CORS_ORIGIN`. No guarde credenciales reales en Git.

El script de limpieza comercial exige `ALLOW_PRODUCTION_CLEANUP=YES` y `CLEANUP_TARGET=CientoOnceV2`. Nunca debe ejecutarse contra una base compartida con otra aplicación.
