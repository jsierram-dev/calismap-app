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
    formData.append('file', file);
    await firstValueFrom(this.http.put(`${environment.apiUrl}/photos/${id}`, formData));
    return id;
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
