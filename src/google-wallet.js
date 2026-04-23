import crypto from "node:crypto";
import { base64UrlEncode, sanitizeWalletIdPart } from "./utils.js";

const GOOGLE_SAVE_BASE_URL = "https://pay.google.com/gp/v/save/";

export async function buildGoogleWalletLink(petCard) {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!issuerId || !serviceAccountEmail || !privateKey) {
    return unavailable(
      "Google Wallet no esta configurado todavia. Faltan GOOGLE_WALLET_ISSUER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }

  if (!petCard.publicImageUrl) {
    return unavailable(
      "Google Wallet necesita una foto con URL publica https. Configura PUBLIC_BASE_URL y publica esta app para mostrar la imagen del perrito."
    );
  }

  const classSuffix = sanitizeWalletIdPart(
    process.env.GOOGLE_WALLET_CLASS_SUFFIX || "pet-ownership-card",
    "pet-ownership-card"
  );
  const objectSuffix = sanitizeWalletIdPart(`${petCard.serial}-${petCard.petName}`, petCard.serial);
  const classId = `${issuerId}.${classSuffix}`;
  const objectId = `${issuerId}.${objectSuffix}`;
  const baseUrl = new URL(petCard.publicImageUrl).origin;
  const allowedDomain = new URL(petCard.publicImageUrl).hostname;
  const logoUrl = process.env.GOOGLE_WALLET_LOGO_URL || `${baseUrl}/logo.svg`;

  const genericClass = {
    id: classId,
    issuerName: process.env.BRAND_NAME || "Pet Wallet Card",
    reviewStatus: "UNDER_REVIEW"
  };

  const genericObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    heroImage: buildImage(petCard.publicImageUrl, `Foto de ${petCard.petName}`),
    logo: buildImage(logoUrl, "Logo de la tarjeta de mascota"),
    cardTitle: localized(`${petCard.petName} - Tarjeta de mascota`),
    header: localized(petCard.ownerName),
    subheader: localized(`${petCard.species}${petCard.breed ? ` - ${petCard.breed}` : ""}`),
    hexBackgroundColor: process.env.CARD_BACKGROUND_COLOR || "#C96E4B",
    barcode: {
      type: "QR_CODE",
      value: petCard.barcodeValue,
      alternateText: petCard.chipId || petCard.serial
    },
    textModulesData: buildTextModules(petCard)
  };

  const token = signGoogleJwt(
    {
      iss: serviceAccountEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: [allowedDomain],
      payload: {
        genericClasses: [genericClass],
        genericObjects: [genericObject]
      }
    },
    privateKey
  );

  return {
    available: true,
    url: `${GOOGLE_SAVE_BASE_URL}${token}`,
    objectId,
    classId
  };
}

function buildTextModules(petCard) {
  const modules = [];

  if (petCard.notes) {
    modules.push(module("notas", "Notas importantes", petCard.notes));
  }

  modules.push(
    module("propietario", "Propietario", petCard.ownerName),
    module("especie", "Especie", petCard.species)
  );

  if (petCard.breed) {
    modules.push(module("raza", "Raza", petCard.breed));
  }

  if (petCard.chipId) {
    modules.push(module("microchip", "Microchip", petCard.chipId));
  }

  if (petCard.birthDate) {
    modules.push(module("nacimiento", "Nacimiento", petCard.birthDate));
  }

  if (petCard.emergencyPhone) {
    modules.push(module("telefono", "Telefono de contacto", petCard.emergencyPhone));
  }
  return modules;
}

function module(id, header, body) {
  return { id, header, body };
}

function buildImage(uri, description) {
  return {
    sourceUri: { uri },
    contentDescription: {
      defaultValue: {
        language: "es-CO",
        value: description
      }
    }
  };
}

function localized(value) {
  return {
    defaultValue: {
      language: "es-CO",
      value
    }
  };
}

function signGoogleJwt(payload, privateKey) {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const content = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(content), privateKey);
  return `${content}.${base64UrlEncode(signature)}`;
}

function unavailable(reason) {
  return {
    available: false,
    reason
  };
}
