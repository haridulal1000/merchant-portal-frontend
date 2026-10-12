import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type { Paginated } from '@core/models/pagination.model';
import type { User, UserRole } from '@core/models/user.model';

interface ListUsersQuery {
  page?: number;
  limit?: number;
  role?: UserRole;
}

/**
 * HTTP client for the /users endpoints.
 * All endpoints require the ADMIN role; the backend returns 403 otherwise.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  list(query: ListUsersQuery = {}): Observable<Paginated<User>> {
    const params: Record<string, string> = {};
    if (query.page !== undefined) params['page'] = String(query.page);
    if (query.limit !== undefined) params['limit'] = String(query.limit);
    if (query.role) params['role'] = query.role;

    return this.http.get<Paginated<User>>(this.baseUrl, { params });
  }

  updateRole(userId: string, role: UserRole): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/${userId}/role`, { role });
  }

  delete(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}`);
  }
}