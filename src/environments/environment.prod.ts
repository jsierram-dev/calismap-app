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
  // LoginComponent (Google) todavía no está construido en este frontend —
  // ver ROADMAP-calismap.md, "Login: OPCIONAL", paso 4/6 sin hacer todavía
  // — así que no hace falta un Client ID real todavía para este deploy. La
  // app funciona completa como invitado sin él. Completar cuando se
  // construya ese componente.
  googleClientId: '',
};
