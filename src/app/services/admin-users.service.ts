import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// GET /auth/admin/users vive en jp-back-auth (la identidad no vive acá, ver
// ROADMAP-calismap.md "Arquitectura") — a diferencia del resto de los
// servicios admin de este proyecto (que pegan contra calismap-back), este
// va contra environment.authApiUrl. Solo lectura por ahora: no hay
// endpoint todavía para cambiar isAdmin de un usuario (decisión del
// 16/08/2026, ver [[admin-panel-component-reuse]] en memoria — se agrega
// más adelante si hace falta).
export interface AdminUserRow {
  id: string;
  username: string;
  is_guest: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  constructor(private http: HttpClient) {}

  async list(page = 1, limit = 20): Promise<AdminUsersPage> {
    return firstValueFrom(
      this.http.get<AdminUsersPage>(`${environment.authApiUrl}/auth/admin/users`, { params: { page, limit } }),
    );
  }
}
