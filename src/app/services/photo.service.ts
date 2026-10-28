import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { newId } from '../core/utils/sync-meta';

/**
 * Sube/pide los blobs inmutables de calismap-back (`PUT`/`GET /photos/:id`,
 * ver ese README) — foto de portada o video corto de un ejercicio,
 * `Exercise.photoId`/`videoId`. El id lo genera el CLIENTE de antemano (es
 * el mismo id que termina en `Exercise.photoId`/`videoId`, ver
 * `photos/controller.ts` del back), no lo devuelve el servidor.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  constructor(private http: HttpClient) {}

  async upload(file: File): Promise<string> {
    const id = newId();
    const formData = new FormData();
    if (file.type.startsWith('image/')) formData.append('file', await this.shrink(file), 'photo.jpg');
    else formData.append('file', file);
    await firstValueFrom(this.http.put(`${environment.apiUrl}/photos/${id}`, formData));
    return id;
  }

  // Una foto de móvil pesa 3-6 MB y el back acepta 3 MB por imagen: se reduce
  // a 1600 px en JPEG (de paso convierte HEIC, que el back no acepta).
  private async shrink(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', 0.85),
    );
  }

  /**
   * `GET /photos/:id` exige `requireAuth` en el back — un `<img src>`/
   * `<video src>` nativo no manda el Bearer token (no es un pedido de
   * `HttpClient`, el interceptor nunca lo ve), así que un id de foto real
   * nunca cargaría puesto directo como `src`. Acá se pide con `HttpClient`
   * (sí pasa por el interceptor) y se arma un `blob:` URL para poder
   * mostrarlo. Quien llama es responsable de `URL.revokeObjectURL(...)`
   * cuando ya no lo necesite (ver create-exercise.page.ts).
   */
  async getObjectUrl(photoId: string): Promise<string> {
    const blob = await firstValueFrom(this.http.get(`${environment.apiUrl}/photos/${photoId}`, { responseType: 'blob' }));
    return URL.createObjectURL(blob);
  }
}
