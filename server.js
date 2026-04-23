import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { buildGoogleWalletLink } from "./src/google-wallet.js";
import { buildApplePass } from "./src/apple-pass.js";
import { ensureEnvLoaded } from "./src/env.js";
import { decodeDataUrlImage, json, randomId, safeText } from "./src/utils.js";

ensureEnvLoaded();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");
const passesDir = path.join(publicDir, "passes");

await mkdir(uploadsDir, { recursive: true });
await mkdir(passesDir, { recursive: true });

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pkpass": "application/vnd.apple.pkpass",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && requestUrl.pathname === "/api/config") {
      return json(res, 200, {
        googleReady: Boolean(
          process.env.GOOGLE_WALLET_ISSUER_ID &&
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
            process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        ),
        appleReady: Boolean(
          process.env.APPLE_PASS_TYPE_IDENTIFIER &&
            process.env.APPLE_TEAM_IDENTIFIER &&
            process.env.APPLE_SIGNER_CERT_PATH &&
            process.env.APPLE_SIGNER_KEY_PATH &&
            process.env.APPLE_WWDR_CERT_PATH
        ),
        publicBaseUrl: process.env.PUBLIC_BASE_URL || null
      });
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/passes") {
      const body = await readJsonBody(req);
      const payload = normalizePetPayload(body);
      const serial = randomId("pet");
      const photo = decodeDataUrlImage(payload.photoDataUrl);
      const imageName = `${serial}.png`;
      const imagePath = path.join(uploadsDir, imageName);

      await writeFile(imagePath, photo.buffer);

      const publicBaseUrl = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL);
      const publicImageUrl = publicBaseUrl ? `${publicBaseUrl}/uploads/${imageName}` : null;
      const barcodeValue = payload.chipId || `PETCARD:${serial}`;

      const petCard = {
        ...payload,
        serial,
        barcodeValue,
        imageName,
        publicImageUrl
      };

      const [googleWallet, appleWallet] = await Promise.all([
        buildGoogleWalletLink(petCard),
        buildApplePass({
          petCard,
          photoBuffer: photo.buffer,
          outputDir: passesDir
        })
      ]);

      return json(res, 200, {
        serial,
        preview: {
          ownerName: petCard.ownerName,
          petName: petCard.petName,
          species: petCard.species,
          breed: petCard.breed,
          chipId: petCard.chipId,
          imageUrl: `/uploads/${imageName}`
        },
        googleWallet,
        appleWallet,
        notes: buildNotes({ publicBaseUrl, googleWallet, appleWallet })
      });
    }

    if (req.method === "GET") {
      return serveStaticFile(requestUrl.pathname, res);
    }

    json(res, 404, { error: "Ruta no encontrada." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    json(res, statusCode, {
      error: error.publicMessage || "No se pudo completar la solicitud.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

const port = Number(process.env.PORT || 3000);

server.listen(port, "0.0.0.0", () => {
  console.log(`Pet Wallet Card listo en http://localhost:${port}`);
});

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) {
      const error = new Error("El payload supera el limite de 8 MB.");
      error.statusCode = 413;
      error.publicMessage = "La imagen es demasiado grande.";
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON invalido.");
    error.statusCode = 400;
    error.publicMessage = "La solicitud no tiene un JSON valido.";
    throw error;
  }
}

function normalizePetPayload(body) {
  const payload = {
    ownerName: safeText(body.ownerName, 80),
    petName: safeText(body.petName, 50),
    species: safeText(body.species, 30),
    breed: safeText(body.breed, 50),
    chipId: safeText(body.chipId, 40),
    birthDate: safeText(body.birthDate, 20),
    emergencyPhone: safeText(body.emergencyPhone, 30),
    notes: safeText(body.notes, 240),
    photoDataUrl: typeof body.photoDataUrl === "string" ? body.photoDataUrl.trim() : ""
  };

  if (!payload.ownerName || !payload.petName || !payload.species || !payload.photoDataUrl) {
    const error = new Error("Faltan campos requeridos.");
    error.statusCode = 400;
    error.publicMessage = "Completa propietario, nombre de la mascota, especie y foto.";
    throw error;
  }

  return payload;
}

function normalizePublicBaseUrl(value) {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

function buildNotes({ publicBaseUrl, googleWallet, appleWallet }) {
  const notes = [];

  if (!publicBaseUrl) {
    notes.push(
      "Google Wallet necesita una URL publica https para mostrar la foto del perrito. Configura PUBLIC_BASE_URL cuando publiques la app."
    );
  }

  if (!googleWallet.available) {
    notes.push(googleWallet.reason);
  }

  if (!appleWallet.available) {
    notes.push(appleWallet.reason);
  }

  return notes;
}

async function serveStaticFile(requestPath, res) {
  const cleanPath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.normalize(path.join(publicDir, cleanPath));

  if (!resolvedPath.startsWith(publicDir)) {
    return json(res, 403, { error: "Acceso denegado." });
  }

  try {
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      return json(res, 404, { error: "Archivo no encontrado." });
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";
    const file = await readFile(resolvedPath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    json(res, 404, { error: "Archivo no encontrado." });
  }
}
