import axios from "axios";

const SBS_TOKEN_URL =
  "https://autapi.sbs.gob.pe/auth/realms/Realm.AppSbs/protocol/openid-connect/token";
const SBS_API_BASE = "https://servicios.sbs.gob.pe/api/app_sbs/";

// Cacheado en memoria del proceso: el token dura 5 min, evita pedir uno nuevo
// en cada consulta mientras la función serverless siga "caliente".
let tokenCache = { token: null, expiresAt: 0 };

async function getSbsToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expiresAt) return tokenCache.token;

  const params = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.SBS_CLIENT_ID,
    client_secret: process.env.SBS_CLIENT_SECRET,
    username: process.env.SBS_USERNAME,
    password: process.env.SBS_PASSWORD,
    scope: "api_only_appsbs",
  });

  const { data } = await axios.post(SBS_TOKEN_URL, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });

  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000 - 10000, // margen de seguridad
  };
  return tokenCache.token;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const [d, m, y] = dateStr.trim().split("/").map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

// La API de la SBS a veces devuelve tildes mal codificadas; se corrigen los
// casos más comunes en vez de mostrarle al usuario texto con caracteres rotos.
const TEXT_FIXES = [
  [/Autom�vil/g, "Automóvil"],
  [/autom�vil/g, "automóvil"],
  [/Compa�[dí]a/gi, "Compañía"],
  [/P�liza/g, "Póliza"],
  [/p�liza/g, "póliza"],
  [/[Vv]eh�culo/g, (m) => (m[0] === "V" ? "Vehículo" : "vehículo")],
  [/[Ii]nformaci�n/g, (m) => (m[0] === "I" ? "Información" : "información")],
  [/[Bb]�squeda/g, (m) => (m[0] === "B" ? "Búsqueda" : "búsqueda")],
  [/[Pp]�blic[oa]/g, (m) => m.replace("�", "ú")],
];

function cleanText(text) {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of TEXT_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/�/g, "o");
}

async function scrapeSoat(plate) {
  const token = await getSbsToken();
  const { data } = await axios.get(SBS_API_BASE + "vehicular", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    data: { numero_documento: plate },
    timeout: 20000,
  });

  if (!data.is_success || !data.result || data.result.length === 0) {
    return { status: "SIN_REGISTROS", active_policy: null, history: [] };
  }

  const policies = data.result.map((item) => ({
    aseguradora: cleanText(item.desc_entidad_vigente || ""),
    clase: cleanText(item.clase_vehiculo || ""),
    uso: cleanText(item.uso_vehiculo || ""),
    accidentes: String(item.numero_accidentes || ""),
    poliza: item.numero_poliza || "",
    certificado: item.numero_certificado || "",
    inicio: item.inicio_vigencia || "",
    fin: item.fin_vigencia || "",
    comentario: cleanText(item.comentario || ""),
  }));

  const today = new Date();
  let activePolicy = null;
  let status = "NO_VIGENTE";

  for (const pol of policies) {
    const inicio = parseDate(pol.inicio);
    const fin = parseDate(pol.fin);
    if (!inicio || !fin) continue;

    const inRange = inicio <= today && today <= fin;
    const comment = pol.comentario.toLowerCase();
    const isCancelled =
      comment.includes("anula") || comment.includes("cancela") || comment.includes("resuel");

    if (inRange && !isCancelled) {
      activePolicy = pol;
      status = "VIGENTE";
      break;
    }
  }

  if (!activePolicy) {
    activePolicy = policies[0];
    const comment = activePolicy.comentario.toLowerCase();
    status =
      comment.includes("anula") || comment.includes("cancela") || comment.includes("resuel")
        ? "ANULADA"
        : "NO_VIGENTE";
  }

  return { status, active_policy: activePolicy, history: policies };
}

function friendlyErrorMessage(error) {
  if (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED") {
    return "No se pudo conectar con el servicio de la SBS. Intenta de nuevo en unos segundos.";
  }
  return "Ocurrió un error al consultar el SOAT.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const placaRaw = req.body?.placa;
  if (!placaRaw) {
    return res.status(400).json({ error: "Placa no proporcionada" });
  }

  const plate = String(placaRaw).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (plate.length < 6) {
    return res.status(400).json({ error: "La placa debe tener al menos 6 caracteres" });
  }

  try {
    const result = await scrapeSoat(plate);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error al consultar SOAT:", error.message);
    res.status(500).json({ error: friendlyErrorMessage(error) });
  }
}
