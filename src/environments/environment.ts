// Config de DESARROLLO — ver environment.prod.ts para producción (deploy
// real armado 16/08/2026, ver ROADMAP-calismap.md "Despliegue"). Puertos
// locales del resto de los backends del mismo autor: 4001=jp-back-auth,
// 4002=similart-room, 4003=mudanza-back, 4004=calismap-back.
export const environment = {
  production: false,
  authApiUrl: 'http://localhost:4001',
  apiUrl: 'http://localhost:4004',
  // Client ID real de Google Cloud Console (OAuth 2.0, tipo "Web
  // application") — el MISMO OAuth Client que mudanza-app/similart-app (ver
  // sus respectivos environment.ts), reusado a propósito: jp-back-auth
  // valida el idToken contra un único GOOGLE_CLIENT_ID (ver
  // jp-back-auth/.env), no uno por app. LoginComponent (paso 6, ver
  // shared/login) lo necesita para google.accounts.id.initialize(). Bug real
  // 18/08/2026: este archivo quedó con '' desde el andamiaje inicial (época
  // en la que Google login "todavía no estaba construido" — ver el mismo
  // comentario, ahora obsoleto, que seguía en environment.prod.ts) y
  // GoogleIdentityService nunca lo notó hasta ahora porque el error de GIS
  // ("Missing required parameter: client_id.") solo aparece en consola, no
  // rompe la carga de la pantalla. Requiere que este origen (localhost:4200
  // en dev, la URL de GitHub Pages en prod) esté en "Authorized JavaScript
  // origins" de este mismo OAuth Client en Google Cloud Console — si falta,
  // el error pasa a ser otro (origin_mismatch), no este.
  googleClientId: '742581888095-uvrmgbol2d2q78eu6fnm7csk162usvfr.apps.googleusercontent.com',
};
