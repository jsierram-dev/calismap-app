import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { AdminUserRow, AdminUsersService } from '../../services/admin-users.service';

// Solo lectura por decisión del 16/08/2026 (ver [[admin-panel-component-
// reuse]] en memoria) — no hay endpoint todavía para cambiar isAdmin de un
// usuario, se agrega más adelante si hace falta.
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-users.page.html',
  styleUrl: './admin-users.page.css',
})
export class AdminUsersPage implements OnInit {
  users = signal<AdminUserRow[]>([]);
  total = signal(0);
  page = signal(1);
  loading = signal(false);

  private readonly limit = 20;

  constructor(private adminUsers: AdminUsersService) {}

  ngOnInit(): void {
    this.load();
  }

  get hasMore(): boolean {
    return this.users().length < this.total();
  }

  async loadMore(): Promise<void> {
    if (this.loading() || !this.hasMore) return;
    this.page.update((p) => p + 1);
    await this.load(true);
  }

  private async load(append = false): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.adminUsers.list(this.page(), this.limit);
      this.users.set(append ? [...this.users(), ...result.users] : result.users);
      this.total.set(result.total);
    } finally {
      this.loading.set(false);
    }
  }
}
