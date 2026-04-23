const form = document.querySelector("#pet-form");
const photoInput = document.querySelector("#photo-input");
const statusNode = document.querySelector("#status");
const resultNode = document.querySelector("#result");
const notesNode = document.querySelector("#notes");
const googleLink = document.querySelector("#google-link");
const appleLink = document.querySelector("#apple-link");

const preview = {
  owner: document.querySelector("#preview-owner"),
  petName: document.querySelector("#preview-pet-name"),
  species: document.querySelector("#preview-species"),
  breed: document.querySelector("#preview-breed"),
  chip: document.querySelector("#preview-chip"),
  notes: document.querySelector("#preview-notes"),
  photo: document.querySelector("#preview-photo")
};

let photoDataUrl = "";

preview.photo.src = createPlaceholder();

form.addEventListener("input", syncPreview);
photoInput.addEventListener("change", handlePhotoChange);
form.addEventListener("submit", handleSubmit);

syncPreview();

async function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  setStatus("Preparando foto...");
  try {
    photoDataUrl = await fileToPngDataUrl(file);
    preview.photo.src = photoDataUrl;
    setStatus("Foto lista.");
  } catch (error) {
    setStatus(error.message || "No se pudo procesar la foto.", true);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  resultNode.classList.add("hidden");

  if (!photoDataUrl) {
    setStatus("Primero sube la foto de la mascota.", true);
    return;
  }

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.photoDataUrl = photoDataUrl;

  setStatus("Generando enlaces y archivo de wallet...");

  try {
    const response = await fetch("/api/passes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No fue posible crear la tarjeta.");
    }

    syncPreview();
    renderWalletLinks(data);
    setStatus("Tarjeta generada.");
  } catch (error) {
    setStatus(error.message || "No fue posible crear la tarjeta.", true);
  }
}

function syncPreview() {
  const formData = new FormData(form);
  preview.owner.textContent = formData.get("ownerName") || "Pendiente";
  preview.petName.textContent = formData.get("petName") || "Tu mascota";
  preview.species.textContent = formData.get("species") || "Pendiente";
  preview.breed.textContent = formData.get("breed") || "Pendiente";
  preview.chip.textContent = formData.get("chipId") || "Sin microchip";
  preview.notes.textContent = formData.get("notes") || "Sin notas por ahora.";
}

function renderWalletLinks(data) {
  resultNode.classList.remove("hidden");
  notesNode.innerHTML = "";

  if (data.googleWallet?.available && data.googleWallet.url) {
    googleLink.href = data.googleWallet.url;
    googleLink.classList.remove("hidden");
  } else {
    googleLink.classList.add("hidden");
  }

  if (data.appleWallet?.available && data.appleWallet.url) {
    appleLink.href = data.appleWallet.url;
    appleLink.classList.remove("hidden");
  } else {
    appleLink.classList.add("hidden");
  }

  for (const note of data.notes || []) {
    const item = document.createElement("li");
    item.textContent = note;
    notesNode.appendChild(item);
  }
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#8d2818" : "";
}

function createPlaceholder() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#f7dfc8"/>
          <stop offset="1" stop-color="#f8f2ec"/>
        </linearGradient>
      </defs>
      <rect width="400" height="400" rx="36" fill="url(#g)"/>
      <circle cx="200" cy="154" r="74" fill="#db9f7e"/>
      <rect x="92" y="248" width="216" height="82" rx="41" fill="#c96e4b"/>
      <text x="200" y="360" text-anchor="middle" font-size="24" font-family="Trebuchet MS, sans-serif" fill="#6f2d1b">Foto de la mascota</text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function fileToPngDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const size = Math.min(image.width, image.height);
        canvas.width = 800;
        canvas.height = 800;
        const context = canvas.getContext("2d");
        const offsetX = (image.width - size) / 2;
        const offsetY = (image.height - size) / 2;
        context.drawImage(image, offsetX, offsetY, size, size, 0, 0, 800, 800);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("La imagen no se pudo leer."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("La imagen no se pudo cargar."));
    reader.readAsDataURL(file);
  });
}
