import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { data: html } = await axios.get("https://sgonorte.bomberosperu.gob.pe/24horas/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://sgonorte.bomberosperu.gob.pe/",
      },
    });

    const $ = cheerio.load(html);

    // Buscamos las filas de la tabla de emergencias
    const emergencias = [];

    $("table.table tbody tr").each((i, el) => {
      const columnas = $(el).find("td, th");

      const numero = $(columnas[0]).text().trim();
      const parte = $(columnas[1]).text().trim();
      const fechaHora = $(columnas[2]).text().trim();
      const direccion = $(columnas[3]).text().replace(/\s+/g, " ").trim();
      const tipo = $(columnas[4]).text().replace(/\s+/g, " ").trim();
      const estado = $(columnas[5]).text().trim();
      const maquinas = $(columnas[6]).text().replace(/\s+/g, " ").trim();
      // Buscar coordenadas entre paréntesis
      const coordMatch = direccion.match(/\((-?\d+\.\d+),\s*(-?\d+\.\d+)\)/);
      const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
      const lon = coordMatch ? parseFloat(coordMatch[2]) : null;

      if (parte) {
      emergencias.push({
        numero,
        parte,
        fechaHora,
        direccion,
        tipo,
        estado,
        maquinas,
        lat,
        lon,
      });
      }
    });

    res.status(200).json({
      success: true,
      total: emergencias.length,
      emergencias,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al obtener emergencias:", error.message);
    res.status(500).json({
      success: false,
      message: "Error al obtener emergencias",
      error: error.message,
    });
  }
}
