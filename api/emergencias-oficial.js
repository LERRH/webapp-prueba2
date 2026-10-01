import axios from "axios";

const API_URL = "https://api.bomberosperu.gob.pe:9443/wsEmergencias/api/v1/GetEmergencies";
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const RECAPTCHA_MIN_SCORE = 0.5;

// Verifica el token de reCAPTCHA v3 contra Google antes de atender la
// petición. Esto es lo que realmente frena un script que golpee este
// endpoint directo (sin pasar por la página): sin un token válido y
// reciente, Google no lo aprueba.
async function verificarRecaptcha(token, remoteIp) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    // Si no está configurado el secret, no se bloquea (modo degradado)
    // para no tumbar la función por un error de configuración.
    console.warn("RECAPTCHA_SECRET_KEY no configurado; se omite la verificación.");
    return { ok: true, skipped: true };
  }
  if (!token) {
    return { ok: false, reason: "Falta el token de reCAPTCHA." };
  }

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set("remoteip", remoteIp);

    const { data } = await axios.post(RECAPTCHA_VERIFY_URL, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 8000,
    });

    if (!data.success) {
      return { ok: false, reason: "Token inválido", errors: data["error-codes"] };
    }
    if (typeof data.score === "number" && data.score < RECAPTCHA_MIN_SCORE) {
      return { ok: false, reason: `Score bajo (${data.score})` };
    }
    return { ok: true, score: data.score };
  } catch (error) {
    console.error("Error al verificar reCAPTCHA:", error.message);
    // Si Google no responde, se deja pasar para no dejar la app sin
    // servicio por una falla ajena; el rate-limit real sigue siendo
    // el score cuando sí responde.
    return { ok: true, skipped: true };
  }
}

function formatFecha(dateStr) {
  if (!dateStr) return "";
  const [datePart, timePart] = dateStr.split(" ");
  if (!datePart || !timePart) return dateStr;
  const [y, m, d] = datePart.split("-");
  const [hh, mm, ss] = timePart.split(":");
  let h = parseInt(hh, 10);
  const ampm = h >= 12 ? "p.m." : "a.m.";
  h = h % 12 || 12;
  const pad = (n) => String(n).padStart(2, "0");
  const segundos = Math.floor(parseFloat(ss) || 0);
  return `${d}/${m}/${y} ${pad(h)}:${mm}:${pad(segundos)} ${ampm}`;
}

function formatDireccion(item) {
  const partes = [
    item.address,
    item.address_number ? `Nro. ${item.address_number}` : null,
    item.reference_emergency,
    item.district,
  ].filter((p) => p && String(p).trim());
  return partes.join(" - ");
}

export default async function handler(req, res) {
  const apiKey = process.env.BOMBEROS_EMERGENCIAS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: "Falta configurar la API key del servicio de emergencias." });
  }

  const recaptchaToken = req.query?.recaptchaToken;
  const remoteIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress;
  const verificacion = await verificarRecaptcha(recaptchaToken, remoteIp);
  if (!verificacion.ok) {
    console.warn("reCAPTCHA rechazado:", verificacion.reason, "ip:", remoteIp);
    return res.status(403).json({ success: false, message: "Verificación de seguridad fallida. Recarga la página e intenta de nuevo." });
  }

  try {
    const { data } = await axios.get(API_URL, {
      params: { apikey: apiKey },
      headers: { Accept: "application/json" },
      timeout: 15000,
    });

    const items = data.data || [];

    const emergencias = items.map((item, i) => {
      // La API trae "latitude"/"longitude" invertidos (latitude trae el valor
      // de longitud y viceversa) - se corrige aquí antes de exponerlo.
      const latReal = item.longitude || null;
      const lonReal = item.latitude || null;
      const hasCoords = !!(latReal && lonReal);

      return {
        numero: i + 1,
        parte: item.part_number || "",
        fechaHora: formatFecha(item.part_date),
        tipo: item.type_emergency_full || item.type_emergency || "",
        direccion: formatDireccion(item),
        estado: item.status_registry === "C" ? "CERRADO" : "ATENDIENDO",
        maquinas: (item.vehicles || []).map((v) => v.nickname).filter(Boolean).join(", "),
        lat: hasCoords ? latReal : null,
        lon: hasCoords ? lonReal : null,
      };
    });

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=90");
    res.status(200).json({
      success: true,
      total: emergencias.length,
      emergencias,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al obtener emergencias (API oficial):", error.message);
    res.status(500).json({
      success: false,
      message: "No se pudo conectar con el servicio oficial de emergencias.",
      error: error.message,
    });
  }
}
