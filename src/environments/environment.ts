// Deploy queda deliberadamente fuera de esta fase (ver ROADMAP-calismap.md,
// "Pendiente") — todavía no hay environment.prod.ts ni file replacement en
// angular.json, se agrega recién cuando se retome el deploy. Puertos locales
// del resto de los backends del mismo autor: 4001=jp-back-auth,
// 4002=similart-room, 4003=mudanza-back, 4004=calismap-back.
export const environment = {
  production: false,
  authApiUrl: 'http://localhost:4001',
  apiUrl: 'http://localhost:4004',
  // Client ID real de Google Cloud Console (OAuth 2.0, tipo "Web
  // application") — sin valor por defecto a propósito, no hay uno genérico
  // que sirva (es específico del proyecto de Google Cloud). LoginComponent
  // (paso 6, ver shared/login) lo necesita para google.accounts.id.initialize().
  googleClientId: '',
};
