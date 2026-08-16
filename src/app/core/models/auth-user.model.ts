// Mismo contrato que jp-back-auth/src/types/auth-user.ts — copiado a mano,
// no como dependencia file: (esa carpeta no existe en un despliegue basado
// en git). Si el contrato cambia del lado de jp-back-auth hay que replicar
// el cambio acá. Ver ROADMAP-calismap.md, "Arquitectura".
export interface AuthUser {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  isGuest: boolean; // true por default al arrancar la app (AuthService.ensureSession) — login OPCIONAL, corregido 15 de agosto de 2026, ver ROADMAP-calismap.md
  isAdmin: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
