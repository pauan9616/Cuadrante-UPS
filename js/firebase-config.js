// firebase-config.js
//
// 1. Ve a https://console.firebase.google.com → crea un proyecto (gratis, plan Spark)
// 2. Dentro del proyecto: icono </> "Añadir app web" → copia el objeto de configuración
//    que te da y pégalo aquí abajo, sustituyendo los valores de ejemplo.
// 3. Activa "Firestore Database" (modo producción) y "Authentication" → método
//    Correo/contraseña → crea TU usuario (el único que podrá subir cuadrantes).
// 4. En Firestore → pestaña "Reglas", pega las reglas que están en el README.md
//
// Este archivo se puede subir a GitHub sin problema: estas claves son públicas
// por diseño en Firebase, la seguridad real la dan las Reglas de Firestore
// (solo lectura pública, escritura solo si has iniciado sesión).

export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};
