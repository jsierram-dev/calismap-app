// Deploy real, 16 de agosto de 2026 (ver ROADMAP-calismap.md, "Despliegue")
// — mismo patrón ya probado con mudanza-app: GitHub Pages (frontend) +
// Render (backends). `jp-back-auth` NO se despliega de nuevo acá, ya está
// en producción compartido con las otras apps de este mismo autor.
export const environment = {
  production: true,
  authApiUrl: 'https://jp-back-auth.onrender.com',
  // A confirmar una vez creado el servicio real en Render — puede llevar
  // sufijo si el nombre "calismap-back" está tomado (mismo aviso que le
  // pasó a mudanza-back). Actualizar acá y re-desplegar si cambia.
  apiUrl: 'https://calismap-back.onrender.com',
  // Bug real 18/08/2026: LoginComponent y el botón de Google en Settings ya
  // estaban construidos y desplegados, pero este comentario (y el '' de
  // abajo) seguían de la época en que Google login era un feature futuro —
  // nadie lo actualizó al construirlo, así que en producción GIS tiraba
  // "Missing required parameter: client_id." en consola y el login con
  // Google no arrancaba nunca. Mismo OAuth Client que mudanza-app/
  // similart-app (ver environment.ts de acá para el porqué completo) —
  // requiere que la URL real de GitHub Pages esté agregada a "Authorized
  // JavaScript origins" de este Client en Google Cloud Console.
  googleClientId: '742581888095-uvrmgbol2d2q78eu6fnm7csk162usvfr.apps.googleusercontent.com',
};
