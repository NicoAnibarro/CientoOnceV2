const express = require("express"),
  rateLimit = require("express-rate-limit"),
  multer = require("multer"),
  auth = require("../middleware/auth.middleware"),
  permit = require("../middleware/roles.middleware");
const a = require("../controllers/auth.controller"),
  o = require("../controllers/operaciones.controller"),
  commercial = require("../controllers/comercial.controller"),
  g = require("../controllers/geo.controller"),
  repartos = require("../controllers/repartos.controller"),
  flyers = require("../controllers/flyers.controller"),
  tickets = require("../controllers/tickets.controller"),
  privacy = require("../controllers/privacy.controller"),
  { controller } = require("../controllers/crud.controller");
const r = express.Router(),
  lim = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  geoLim = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  routeLim = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  ticketLim = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  ticketUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) =>
      done(
        null,
        ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
      ),
  });
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, done) =>
    done(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
r.post("/auth/register", lim, a.register);
r.post("/auth/login", lim, a.login);
r.post("/auth/resend-verification", lim, a.resendVerification);
r.post("/auth/verify-email", lim, a.verifyEmail);
r.get("/auth/verify-email-link", lim, a.verifyEmailLink);
r.post("/auth/forgot-password", lim, a.forgotPassword);
r.post("/auth/reset-password", lim, a.resetPassword);
r.get("/auth/reset-password-info", lim, a.resetPasswordInfo);
r.post("/auth/employee-login", lim, a.employeeLogin);
r.get("/auth/me", auth, a.me);
r.get("/privacidad", privacy.policy);
r.get("/eliminar-cuenta", privacy.deletionPage);
r.post("/solicitar-eliminacion", lim, privacy.requestDeletion);
r.delete("/auth/account", auth, privacy.deleteAccount);
r.get("/geo/autocomplete", auth, geoLim, g.autocomplete);
r.get("/geo/geocode", auth, geoLim, g.geocode);
r.get("/geo/reverse", auth, geoLim, g.reverse);
r.get("/repartos/pedidos", auth, repartos.pedidos);
r.post("/repartos/optimizar", auth, routeLim, repartos.optimizar);
r.post(
  "/tickets/analizar",
  auth,
  ticketLim,
  ticketUpload.single("ticket"),
  tickets.analizar,
);
for (const tipo of ["clientes", "productos", "insumos"]) {
  const c = controller(tipo),
    writeRoles =
      tipo === "clientes"
        ? ["propietario", "administrador", "ventas"]
        : ["propietario", "administrador"];
  r.get("/" + tipo, auth, c.list);
  r.post("/" + tipo, auth, permit(...writeRoles), c.create);
  r.put("/" + tipo + "/:id", auth, permit(...writeRoles), c.update);
  r.patch(
    "/" + tipo + "/:id/desactivar",
    auth,
    permit("propietario", "administrador"),
    c.remove,
  );
}
r.get("/pedidos", auth, o.listarPedidos);
r.get("/pedidos/proximos", auth, o.listarPedidos);
r.get("/pedidos/entregados", auth, o.listarPedidos);
r.get("/pedidos/:id", auth, o.verPedido);
r.post(
  "/pedidos",
  auth,
  permit("propietario", "administrador", "ventas"),
  o.crearPedido,
);
r.put(
  "/pedidos/:id",
  auth,
  permit("propietario", "administrador", "ventas"),
  o.editarPedido,
);
r.patch(
  "/pedidos/:id/estado",
  auth,
  permit("propietario", "administrador", "ventas", "reparto"),
  o.estado,
);
r.patch(
  "/pedidos/:id/pagado",
  auth,
  permit("propietario", "administrador", "ventas", "caja"),
  o.pagado,
);
r.patch(
  "/pedidos/:id/desactivar",
  auth,
  permit("propietario", "administrador"),
  o.eliminarPedido,
);
r.get("/categorias-productos", auth, o.categorias);
r.post("/categorias-productos", auth, permit("propietario", "administrador"), o.crearCategoria);
r.patch("/categorias-productos/:id/desactivar", auth, permit("propietario", "administrador"), o.desactivarCategoria);
r.get("/informes", auth, permit("propietario", "administrador"), o.informes);
r.get("/stock", auth, o.stock);
r.post("/stock/productos/:id", auth, permit("propietario", "administrador"), o.moverStock);
r.get("/stock/reposicion", auth, commercial.reposicion);
r.get("/compras", auth, o.compras);
r.get("/compras/:id", auth, o.compra);
r.post("/compras", auth, permit("propietario", "administrador"), o.crearCompra);
r.get("/caja", auth, o.caja);
r.get("/caja/resumen", auth, o.resumen);
r.post(
  "/caja/movimientos",
  auth,
  permit("propietario", "administrador", "caja"),
  o.movimientoCapital,
);
r.get("/configuracion-comercial/paleta-app", auth, commercial.paletaApp);
r.get(
  "/caja/cierre/resumen",
  auth,
  permit("propietario", "administrador", "caja"),
  commercial.resumenCierre,
);
r.get(
  "/caja/cierres",
  auth,
  permit("propietario", "administrador", "caja"),
  commercial.cierres,
);
r.post(
  "/caja/cierres",
  auth,
  permit("propietario", "administrador", "caja"),
  commercial.crearCierre,
);
r.get("/clientes/:id/historial", auth, commercial.historialCliente);
r.get(
  "/backup",
  auth,
  permit("propietario", "administrador"),
  commercial.backup,
);
r.get(
  "/empleados",
  auth,
  permit("propietario", "administrador"),
  commercial.empleados,
);
r.post(
  "/empleados",
  auth,
  permit("propietario", "administrador"),
  commercial.crearEmpleado,
);
r.patch(
  "/empleados/:id/desactivar",
  auth,
  permit("propietario", "administrador"),
  commercial.eliminarEmpleado,
);
r.get(
  "/configuracion-comercial",
  auth,
  permit("propietario", "administrador"),
  commercial.config,
);
r.put(
  "/configuracion-comercial",
  auth,
  permit("propietario", "administrador"),
  commercial.guardarConfig,
);
r.patch(
  "/configuracion-comercial/paleta-app",
  auth,
  commercial.guardarPaletaApp,
);
r.get("/configuracion-comercial/logo", auth, flyers.logo);
r.put("/configuracion-comercial/logo", auth, permit("propietario", "administrador"), imageUpload.single("imagen"), flyers.guardarLogo);
r.post("/flyers/generar", auth, permit("propietario", "administrador"), ticketLim, imageUpload.array("imagenes", 3), flyers.generar);
r.get("/costos-productos", auth, o.listarCostos);
r.post("/costos-productos", auth, permit("propietario", "administrador"), o.guardarCosto);
r.put("/costos-productos/:id", auth, permit("propietario", "administrador"), o.editarCosto);
r.patch("/costos-productos/:id/desactivar", auth, permit("propietario", "administrador"), o.eliminarCosto);
r.get("/dashboard", auth, o.dashboard);
module.exports = r;
