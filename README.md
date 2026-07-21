# Ciento Once V2

Aplicación móvil para gestionar clientes, productos, pedidos, stock, insumos, compras y caja. Cada consulta operativa se limita al usuario obtenido del JWT.

## Requisitos

- Node.js LTS (se recomienda 22; en esta PC se verificó Node 24).
- MySQL 8 o MariaDB incluido en XAMPP.
- Expo Go actualizado en el teléfono.
- PC y teléfono en la misma red Wi-Fi.

## 1. Base de datos

En XAMPP, iniciar **MySQL**, abrir phpMyAdmin, elegir **Importar** y seleccionar `database/001_schema.sql`. El script crea `ciento_once_v2`, sus tablas, claves e índices. No incluye contraseñas de prueba: cree dos cuentas desde la app para que bcrypt genere hashes seguros.

También puede usar consola:

```powershell
mysql -u root -p < database/001_schema.sql
```

## 2. Backend

```powershell
cd back-end
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Editar `back-end/.env`: completar `DB_PASSWORD` si MySQL tiene contraseña y reemplazar `JWT_SECRET` por una frase larga y aleatoria. La API escucha en todas las interfaces, puerto 3000.

Para Aiven configurar además `DB_SSL=true`. Si se utiliza TLS sin cargar el certificado CA en Render, configurar `DB_SSL_REJECT_UNAUTHORIZED=false`.

Comprobaciones: `http://localhost:3000/api/health` no requiere MySQL; `http://localhost:3000/api/test-db` verifica la conexión.

## 3. Frontend y dirección IP

Obtener la IPv4 de Windows:

```powershell
ipconfig
```

Buscar “Dirección IPv4” del adaptador Wi-Fi, copiar `front-end/.env.example` a `front-end/.env` y reemplazar la IP de ejemplo:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.100:3000/api
```

Luego:

```powershell
cd front-end
npm.cmd install
npx.cmd expo start
```

Abrir Expo Go y escanear el QR. Si Windows pregunta, permitir Node en redes privadas. Si teléfono y PC están en redes distintas, conectarlos al mismo Wi-Fi o iniciar Expo con `npx.cmd expo start --tunnel`; la API sigue necesitando una URL accesible (VPN/túnel o despliegue).

## Estructura

- `database`: esquema y archivo opcional de datos.
- `back-end/src`: servidor Express, middleware JWT, controladores y rutas.
- `front-end/src`: API Axios, sesión SecureStore, navegación, tema, componentes y pantallas.

## Seguridad y pruebas principales

La API recalcula totales y precios, usa parámetros SQL y toma `id_usuario` exclusivamente del JWT. Pedidos, edición y eliminación restauran/descuentan stock dentro de transacciones. Caja usa una clave única por usuario/origen/ID para no duplicar pagos.

Prueba recomendada con cuentas A y B: crear un producto, cliente y pedido como A; iniciar como B y confirmar que no aparecen. Consultar o editar con B el ID de A debe devolver 404. Como A, activar/desactivar/activar pago y verificar un solo movimiento en caja. Registrar compra y confirmar el egreso y balance.

## Comandos

- Backend desarrollo: `npm.cmd run dev`
- Backend producción/local: `npm.cmd start`
- Sintaxis backend: `npm.cmd run check`
- Expo: `npx.cmd expo start`
- Diagnóstico Expo: `npx.cmd expo-doctor`

## Errores frecuentes

- `npm.ps1 ... ejecución de scripts deshabilitada`: usar `npm.cmd` y `npx.cmd` como en esta guía.
- `ECONNREFUSED`: iniciar MySQL/backend y revisar `.env`.
- `Network Error` en el teléfono: comprobar IP, misma Wi-Fi, firewall y que la URL no sea `localhost`.
- QR no conecta: desactivar temporalmente VPN/red de invitados o probar `--tunnel`.
- `JWT_SECRET` faltante: crear `back-end/.env` y configurarlo.

## Despliegue actual

- API: `https://ciento-once-v2-api.onrender.com/api`
- Salud: `https://ciento-once-v2-api.onrender.com/api/health`
- Base de datos: MySQL administrado en Aiven, base `ciento_once_v2`.

### Render

Configurar un Web Service con:

- Root Directory: `back-end`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Variables requeridas: `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `JWT_SECRET`, `JWT_EXPIRES_IN` y `CORS_ORIGIN`. No guardar sus valores reales en Git.

### Aiven

Crear `ciento_once_v2` y ejecutar desde `back-end`:

```powershell
npm.cmd run db:import
```

El comando utiliza las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_INITIAL_DATABASE` y `DB_SSL`. La contraseña debe proporcionarse temporalmente mediante el entorno y eliminarse al terminar.

Las instancias gratuitas de Render pueden suspenderse por inactividad; la primera solicitud posterior puede demorar mientras el servicio despierta.
