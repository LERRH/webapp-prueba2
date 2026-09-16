import axios from "axios";
import * as cheerio from "cheerio";

const DNI_URL = "https://eldni.com/pe/buscar-datos-por-dni";
const DNI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  return setCookieHeader.map((c) => c.split(";")[0]).join("; ");
}

async function buscarDni(dni) {
  const resp1 = await axios.get(DNI_URL, {
    headers: { "User-Agent": DNI_UA },
    timeout: 20000,
  });
  const cookies = extractCookies(resp1.headers["set-cookie"]);

  const $1 = cheerio.load(resp1.data);
  const token = $1('input[name="_token"]').attr("value");
  if (!token) {
    throw new Error("No se pudo obtener el token de seguridad de la página.");
  }

  const params = new URLSearchParams({ _token: token, dni });
  const resp2 = await axios.post(DNI_URL, params, {
    headers: {
      "User-Agent": DNI_UA,
      Referer: DNI_URL,
      Cookie: cookies,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 20000,
  });

  const $2 = cheerio.load(resp2.data);
  const nombres = ($2("#nombres").attr("value") || "").trim();

  if (!nombres) {
    return { encontrado: false };
  }

  return {
    encontrado: true,
    dni,
    nombres,
    apellido_paterno: ($2("#apellidop").attr("value") || "").trim(),
    apellido_materno: ($2("#apellidom").attr("value") || "").trim(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const dni = String(req.body?.dni || "").replace(/\D/g, "");
  if (dni.length !== 8) {
    return res.status(400).json({ error: "El DNI debe tener 8 dígitos" });
  }

  try {
    const result = await buscarDni(dni);
    res.status(200).json(result);
  } catch (error) {
    // No se imprime el DNI consultado, por privacidad.
    console.error("Error en búsqueda por DNI:", error.message);
    res.status(500).json({ error: "No se pudo completar la búsqueda. Intenta de nuevo." });
  }
}
