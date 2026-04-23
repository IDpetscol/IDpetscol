# Pet Wallet Card

Starter en Node.js para crear una pagina web que genera una tarjeta de propiedad de mascota con:

- `Add to Google Wallet` usando un `Generic Pass` firmado con JWT.
- `Add to Apple Wallet` generando un archivo `.pkpass` firmado.
- Preview visual con la foto del perrito, nombre del propietario y datos de la mascota.

## Lo que ya deja resuelto

- Un formulario web para capturar foto y datos.
- Conversion de la foto a PNG en el navegador.
- Guardado local de la foto en `public/uploads/`.
- Construccion del enlace de Google Wallet cuando tienes credenciales reales.
- Construccion del archivo de Apple Wallet cuando tienes certificados y OpenSSL.
- Mensajes claros en UI cuando falta alguna credencial.

## Estructura

- `server.js`: servidor HTTP y endpoints.
- `src/google-wallet.js`: arma el JWT para Google Wallet.
- `src/apple-pass.js`: crea `pass.json`, `manifest.json`, firma y empaqueta `.pkpass`.
- `public/`: frontend y archivos generados.

## Como usarlo

1. Crea un archivo `.env` copiando `.env.example`.
2. Completa las variables de Google Wallet y Apple Wallet.
3. Ejecuta `node server.js`.
4. Abre `http://localhost:3000`.

## Configuracion real

### Google Wallet

Necesitas:

- Issuer account de Google Wallet.
- Service account de Google Cloud con clave privada.
- Un dominio publico `https` para la app y para la imagen de la mascota.

Notas:

- La foto del perrito en Google Wallet se referencia por URL, no se incrusta como binario.
- Si pruebas solo en local y no defines `PUBLIC_BASE_URL`, el proyecto te avisara y no generara el enlace real.
- Mientras tu emisor no este aprobado, Google suele mostrar los pases como prueba con marca `TEST ONLY`.

Documentacion oficial:

- [Generic Pass overview](https://developers.google.com/wallet/generic)
- [Issuing passes for web, email, SMS](https://developers.google.com/wallet/generic/web)
- [Working with JWTs](https://developers.google.com/wallet/generic/use-cases/jwt)

### Apple Wallet

Necesitas:

- Cuenta Apple Developer.
- Un `Pass Type ID`.
- Certificado para firmar el pass.
- Clave privada correspondiente.
- Certificado intermedio WWDR de Apple.
- OpenSSL instalado o una ruta valida en `APPLE_OPENSSL_PATH`.

Notas:

- Apple permite distribuir el `.pkpass` desde web; no necesitas una app nativa para empezar.
- La foto se incrusta dentro del paquete del pass.
- Si luego quieres actualizar tarjetas ya instaladas, puedes agregar `webServiceURL` y `authenticationToken`.

Documentacion oficial:

- [Wallet Passes](https://developer.apple.com/documentation/walletpasses)
- [Creating a generic pass](https://developer.apple.com/documentation/walletpasses/creating-a-generic-pass)
- [Distributing and updating a pass](https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass)

## Siguiente paso recomendado

Si quieres una version lista para produccion, lo siguiente es:

1. Publicar esta app con `https`.
2. Guardar las fotos en S3, Cloudinary o storage similar.
3. Separar la emision en un endpoint seguro de backend.
4. Reemplazar el uso de la misma imagen para `icon`, `logo` y `thumbnail` por assets optimizados para Wallet.

## Importante

En este workspace no pude validar la ejecucion del runtime porque la sesion no tiene acceso utilizable a `node.exe`. El codigo queda preparado, pero la prueba local de arranque puede requerir ejecutar el proyecto fuera de esta restriccion o habilitar ese acceso.
