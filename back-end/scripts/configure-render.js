const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const token = fs.readFileSync(path.join(__dirname, '../.render-token'), 'utf8').trim();
const apiBase = 'https://api.render.com/v1';

async function renderApi(route, options = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Render API ${response.status}: ${data.message || data.error || 'solicitud rechazada'}`);
  return data;
}

function itemValue(item) {
  return item?.service || item;
}

async function service() {
  const response = await renderApi('/services?limit=100');
  const services = (Array.isArray(response) ? response : response.items || []).map(itemValue);
  const target = services.find((item) =>
    item?.name === 'CientoOnceV2'
    || item?.slug === 'ciento-once-v2-api'
    || String(item?.serviceDetails?.url || '').includes('ciento-once-v2-api.onrender.com'),
  );
  if (!target) throw new Error(`No se encontró CientoOnceV2. Servicios visibles: ${services.map((item) => item?.name).filter(Boolean).join(', ')}`);
  return target;
}

async function run() {
  if (!token || token.length < 20) throw new Error('El token de Render no es válido');
  const target = await service();
  const statusArg = process.argv.find((item) => item.startsWith('--status='));
  if (statusArg) {
    const deployId = statusArg.slice('--status='.length);
    const deploy = await renderApi(`/services/${target.id}/deploys/${encodeURIComponent(deployId)}`);
    console.log(`Estado del despliegue ${deployId}: ${deploy.status || deploy.deploy?.status || 'desconocido'}`);
    return;
  }
  const current = await renderApi(`/services/${target.id}/env-vars?limit=100`);
  const names = (Array.isArray(current) ? current : current.items || [])
    .map((item) => item?.envVar?.key || item?.key)
    .filter(Boolean)
    .sort();
  console.log(`Servicio encontrado: ${target.name} (${target.id})`);
  console.log(`Variables existentes: ${names.join(', ')}`);
  if (!process.argv.includes('--apply')) return;

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
    throw new Error('El JSON de la cuenta de servicio está incompleto');
  }
  const values = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY,
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value) throw new Error(`Falta ${key} en la configuración local`);
    await renderApi(`/services/${target.id}/env-vars/${encodeURIComponent(key)}`, {
      method: 'PUT', body: JSON.stringify({ value }),
    });
    console.log(`Configurada ${key}`);
  }
  const deploy = await renderApi(`/services/${target.id}/deploys`, {
    method: 'POST', body: JSON.stringify({ deployMode: 'deploy_only' }),
  });
  console.log(`Despliegue iniciado: ${deploy.id || deploy.deploy?.id || 'aceptado'}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
