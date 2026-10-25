require("dotenv").config();
require("node:dns").setDefaultResultOrder("ipv4first");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const db = require("./config/db");
const emailService = require("./services/email.service");
const routes = require("./routes");
const errors = require("./middleware/error.middleware");

const app = express();
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN === "*"
        ? "*"
        : (process.env.CORS_ORIGIN || "").split(","),
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));

app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    mensaje: "API de Ciento Once disponible",
    version: "2026.10.24-viandas-stock-guide",
    email_activo: emailService.configured(),
  }),
);
app.get("/api/test-db", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, mensaje: "Conexion MySQL correcta" });
  } catch (error) {
    next(error);
  }
});
app.use("/api", routes);
app.use((req, res) =>
  res.status(404).json({ ok: false, mensaje: "Ruta no encontrada" }),
);
app.use(errors);

module.exports = app;
