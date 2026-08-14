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
  apiKey: "AIzaSyD2hz1w4Vz5mozP5HtNvu51vXjueAgZKoY",
  authDomain: "cuadrante-ups.firebaseapp.com",
  projectId: "cuadrante-ups",
  storageBucket: "cuadrante-ups.firebasestorage.app",
  messagingSenderId: "915293743085",
  appId: "1:915293743085:web:53e271895d934947d529e4",
};
