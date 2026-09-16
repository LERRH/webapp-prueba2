# Bomberos Toolkit

PWA con herramientas y protocolos de referencia rápida para bomberos del Cuerpo General de Bomberos Voluntarios del Perú (CGBVP).

## Estado

En desarrollo activo.

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

## Correr en local

Este proyecto está pensado para desplegarse en Vercel (ver [vercel.json](vercel.json)), pero **no hace falta una cuenta de Vercel para probarlo en local**. Incluye un servidor de desarrollo propio (`dev-server.js`) que sirve `public/` como estático y enruta `/api/*` igual que en producción:

```bash
npm run local
```

Por defecto levanta en el puerto 3000. Para usar otro puerto:

```bash
PORT=3100 node dev-server.js   # bash / macOS / Linux
```

En PowerShell:

```powershell
$env:PORT=3100; node dev-server.js
```

Luego abre `http://localhost:3000/` (o el puerto que hayas usado).

Alternativa (requiere cuenta de Vercel y login por navegador): `npm run dev` ejecuta `vercel dev`.

## Estructura del proyecto

```
api/
  emergencias.js        # función serverless: scraping de sgonorte.bomberosperu.gob.pe
  soat.js                # función serverless: consulta de vigencia SOAT (API de la SBS)
public/
  index.html             # landing principal
  emergencias.html       # monitor de emergencias en tiempo real
  manifest.json          # manifest de la PWA
  sw.js                  # service worker (caché offline del app shell y páginas visitadas)
  register-sw.js         # registro del service worker, incluido en cada página
  assets/
    css/                 # estilos compartidos (base.css, modulos.css, herramientas.css)
    js/                  # scripts compartidos (analytics.js)
    icons/                # íconos de la PWA e imágenes
  modulos/                # protocolos y guías de referencia
  herramientas/           # calculadoras y utilidades interactivas
  SegundaPantalla/        # vistas para una segunda pantalla (menús de acceso rápido)
```

### Módulos (`public/modulos/`)

Protocolos y guías de referencia rápida, organizados por tema:

| Módulo | Descripción |
|---|---|
| `evaluacion-primaria` | Evaluación primaria XABCDE |
| `evaluacion-secundaria` | Evaluación secundaria SAMPLE |
| `extintores` | Tipos y uso de extintores |
| `primap` | Materiales peligrosos (MATPEL) |
| `quemaduras` | Clasificación y manejo de quemaduras |
| `rcp-dea` | Reanimación cardiopulmonar y desfibrilación |
| `sci` | Sistema de Comando de Incidentes |
| `triaje` | Triaje START |
| `vehiculos` | Incendios vehiculares |

### Herramientas (`public/herramientas/`)

Calculadoras y utilidades interactivas:

| Herramienta | Descripción |
|---|---|
| `claves` | Códigos de comunicación CGBVP (buscador) |
| `conversor` | Conversor de unidades (presión, distancia, área, volumen, peso, fuerza, temperatura, caudal, cálculo de oxígeno) |
| `glasgow` | Calculadora de la Escala de Glasgow |
| `rcp-timer` | Cronómetro para RCP |
| `signos-vitales` | Referencia de signos vitales |
| `soat` | Consulta de vigencia del SOAT por placa (API oficial de la SBS) |

## API

### `GET /api/emergencias`

Hace scraping en vivo de `sgonorte.bomberosperu.gob.pe/24horas` y devuelve las emergencias activas en JSON.

- Timeout de 8s al sitio origen.
- Respuesta cacheada en el CDN de Vercel (`Cache-Control: s-maxage=60, stale-while-revalidate=180`).
- Nunca se cachea en el service worker: los datos de emergencias siempre deben venir de la red.

### `POST /api/soat`

Consulta el estado de vigencia del SOAT de una placa contra la API de la SBS (autenticación OAuth2 + consulta vehicular). Body: `{ "placa": "ABC123" }`.

Requiere estas variables de entorno (nunca hardcodeadas en el código, configuradas en Vercel → Settings → Environment Variables):

- `SBS_CLIENT_ID`
- `SBS_CLIENT_SECRET`
- `SBS_USERNAME`
- `SBS_PASSWORD`

Para correr esto en local, crea un archivo `.env.local` (ya está en `.gitignore`, nunca se commitea) con esas 4 variables.

## PWA / Offline

El manifest (`public/manifest.json`) permite instalar la app. El service worker (`public/sw.js`) cachea el app shell y las páginas ya visitadas con estrategia *stale-while-revalidate*, para que funcionen sin conexión. La API de emergencias queda excluida a propósito del caché offline.

## Despliegue

El proyecto se despliega en [Vercel](https://vercel.com). `vercel.json` define el build (funciones serverless en `api/`, estático en `public/`) y headers de seguridad básicos.

## Analytics

Google Analytics está configurado en `public/assets/js/analytics.js` (ID `G-7L9S6V0X5X`), referenciado desde cada página. Para cambiar el ID de seguimiento, basta con editar ese único archivo.
