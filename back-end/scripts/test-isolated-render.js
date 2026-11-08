const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const token = fs
  .readFileSync(path.join(__dirname, "../.render-token"), "utf8")
  .trim();
const apiBase = "https://api.render.com/v1";

async function renderApi(route) {
  const response = await fetch(`${apiBase}${route}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `Render API ${response.status}: ${data.message || data.error || "solicitud rechazada"}`,
    );
  return data;
}

function values(response) {
  return Array.isArray(response) ? response : response.items || [];
}

async function run() {
  if (!token || token.length < 20) throw new Error("Token de Render inválido");
  const services = values(await renderApi("/services?limit=100")).map(
    (item) => item.service || item,
  );
  const target = services.find(
    (item) =>
      item?.name === "CientoOnceV2" ||
      item?.slug === "ciento-once-v2-api" ||
      String(item?.serviceDetails?.url || "").includes(
        "ciento-once-v2-api.onrender.com",
      ),
  );
  if (!target) throw new Error("No se encontró el servicio CientoOnceV2");
  const variables = values(
    await renderApi(`/services/${target.id}/env-vars?limit=100`),
  );
  const env = Object.fromEntries(
    variables
      .map((item) => item.envVar || item)
      .filter((item) => item?.key)
      .map((item) => [item.key, item.value]),
  );
  if (env.DB_NAME !== "defaultdb")
    throw new Error(
      "La base de CientoOnce no coincide con el destino permitido",
    );
  if (!String(env.DB_HOST || "").includes("aivencloud.com"))
    throw new Error("El host de CientoOnce no es un servicio Aiven reconocido");
  console.log(`Credenciales temporales leídas del servicio ${target.name}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/test-isolated.js"], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: { ...process.env, ...env, NODE_ENV: "test" },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0)
    throw new Error(`Las pruebas terminaron con código ${exitCode}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
