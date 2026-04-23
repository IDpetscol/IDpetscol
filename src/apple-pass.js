import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomId } from "./utils.js";

export async function buildApplePass({ petCard, photoBuffer, outputDir }) {
  const required = [
    "APPLE_PASS_TYPE_IDENTIFIER",
    "APPLE_TEAM_IDENTIFIER",
    "APPLE_ORGANIZATION_NAME",
    "APPLE_SIGNER_CERT_PATH",
    "APPLE_SIGNER_KEY_PATH",
    "APPLE_WWDR_CERT_PATH"
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return unavailable(
      `Apple Wallet no esta configurado todavia. Faltan: ${missing.join(", ")}.`
    );
  }

  const buildRoot = path.join(outputDir, "..", ".apple-build");
  const workDir = path.join(buildRoot, randomId("pass"));
  await mkdir(workDir, { recursive: true });

  try {
    await writePassPackage({ workDir, petCard, photoBuffer });
    await signManifest(workDir);
    const pkpassName = `${petCard.serial}.pkpass`;
    const pkpassPath = path.join(outputDir, pkpassName);
    zipPass(workDir, pkpassPath);

    return {
      available: true,
      url: `/passes/${pkpassName}`,
      serialNumber: petCard.serial
    };
  } catch (error) {
    return unavailable(
      error.message ||
        "No se pudo construir el archivo .pkpass. Revisa certificados, OpenSSL y permisos."
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function writePassPackage({ workDir, petCard, photoBuffer }) {
  const notesPreview = petCard.notes ? truncate(petCard.notes, 46) : "";

  const passJson = {
    description: `Tarjeta de propiedad de ${petCard.petName}`,
    formatVersion: 1,
    organizationName: process.env.APPLE_ORGANIZATION_NAME,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
    serialNumber: petCard.serial,
    teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
    foregroundColor: process.env.APPLE_FOREGROUND_COLOR || "rgb(255, 249, 245)",
    backgroundColor: process.env.APPLE_BACKGROUND_COLOR || "rgb(62, 37, 29)",
    labelColor: process.env.APPLE_LABEL_COLOR || "rgb(255, 208, 173)",
    logoText: process.env.BRAND_NAME || "Pet Wallet Card",
    generic: {
      headerFields: [field("species", "Especie", petCard.species)],
      primaryFields: [field("petName", "Mascota", petCard.petName)],
      secondaryFields: compact([
        field("owner", "Propietario", petCard.ownerName),
        petCard.breed ? field("breed", "Raza", petCard.breed) : null
      ]),
      auxiliaryFields: compact([
        petCard.chipId ? field("chip", "Microchip", petCard.chipId) : null,
        notesPreview ? field("notesPreview", "Notas", notesPreview) : null
      ]),
      backFields: compact([
        petCard.birthDate ? field("birth", "Nacimiento", petCard.birthDate) : null,
        petCard.emergencyPhone
          ? field("contact", "Telefono de contacto", petCard.emergencyPhone)
          : null,
        petCard.notes ? field("notes", "Notas", petCard.notes) : null,
        field("serial", "Serial", petCard.serial)
      ])
    },
    barcode: {
      format: "PKBarcodeFormatQR",
      message: petCard.barcodeValue,
      messageEncoding: "iso-8859-1",
      altText: petCard.chipId || petCard.serial
    }
  };

  if (process.env.APPLE_WEB_SERVICE_URL && process.env.APPLE_AUTH_TOKEN) {
    passJson.webServiceURL = process.env.APPLE_WEB_SERVICE_URL;
    passJson.authenticationToken = process.env.APPLE_AUTH_TOKEN;
  }

  await writeFile(path.join(workDir, "pass.json"), JSON.stringify(passJson, null, 2));
  await writeFile(path.join(workDir, "icon.png"), photoBuffer);
  await writeFile(path.join(workDir, "icon@2x.png"), photoBuffer);
  await writeFile(path.join(workDir, "logo.png"), photoBuffer);
  await writeFile(path.join(workDir, "thumbnail.png"), photoBuffer);

  const manifest = {};
  for (const fileName of await readdir(workDir)) {
    const filePath = path.join(workDir, fileName);
    const content = await readFile(filePath);
    manifest[fileName] = crypto.createHash("sha1").update(content).digest("hex");
  }

  await writeFile(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function signManifest(workDir) {
  const openssl = process.env.APPLE_OPENSSL_PATH || "openssl";
  const manifestPath = path.join(workDir, "manifest.json");
  const signaturePath = path.join(workDir, "signature");
  const args = [
    "smime",
    "-binary",
    "-sign",
    "-certfile",
    process.env.APPLE_WWDR_CERT_PATH,
    "-signer",
    process.env.APPLE_SIGNER_CERT_PATH,
    "-inkey",
    process.env.APPLE_SIGNER_KEY_PATH,
    "-in",
    manifestPath,
    "-out",
    signaturePath,
    "-outform",
    "DER"
  ];

  if (process.env.APPLE_SIGNER_KEY_PASSPHRASE) {
    args.push("-passin", `pass:${process.env.APPLE_SIGNER_KEY_PASSPHRASE}`);
  }

  const result = spawnSync(openssl, args, {
    cwd: workDir,
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      "Fallo la firma del pass de Apple. Instala OpenSSL o define APPLE_OPENSSL_PATH y revisa tus certificados."
    );
  }
}

function zipPass(workDir, targetPkpassPath) {
  const zipPath = targetPkpassPath.replace(/\.pkpass$/i, ".zip");
  const files = [
    "pass.json",
    "manifest.json",
    "signature",
    "icon.png",
    "icon@2x.png",
    "logo.png",
    "thumbnail.png"
  ];
  const quotedFiles = files.map((file) => `'${file}'`).join(", ");
  const script = `Compress-Archive -LiteralPath ${quotedFiles} -DestinationPath '${zipPath}' -Force`;
  const zipResult = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    cwd: workDir,
    stdio: "pipe",
    encoding: "utf8"
  });

  if (zipResult.error || zipResult.status !== 0) {
    throw new Error("No se pudo empaquetar el archivo .pkpass.");
  }

  const moveResult = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Move-Item -LiteralPath '${zipPath}' -Destination '${targetPkpassPath}' -Force`],
    {
      stdio: "pipe",
      encoding: "utf8"
    }
  );

  if (moveResult.error || moveResult.status !== 0) {
    throw new Error("No se pudo renombrar el .zip a .pkpass.");
  }
}

function field(key, label, value) {
  return { key, label, value };
}

function compact(items) {
  return items.filter(Boolean);
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function unavailable(reason) {
  return {
    available: false,
    reason
  };
}
