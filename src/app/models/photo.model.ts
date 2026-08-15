// Blob inmutable (foto o video corto) — se sube una vez (PUT /photos/:id) y
// no se reescribe, mismo patrón que mudanza-back. El binario nunca viaja acá
// ni en el snapshot de /sync: esto es solo el metadato; el archivo en sí se
// pide con GET /photos/:id (ver core/services/photo.service.ts, cuando
// exista) y se cachea en el dispositivo, igual que un video de catálogo.
export interface Photo {
  id: string;
  userId: string;
  contentType: string;
  createdAt: string;
}
