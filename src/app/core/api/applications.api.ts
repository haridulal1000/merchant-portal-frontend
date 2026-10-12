import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type { Paginated } from '@core/models/pagination.model';
import type {
  CreateApplicationRequest,
  ListApplicationsQuery,
  MerchantApplication,
  UpdateApplicationRequest,
} from '@core/models/application.model';

/**
 * Typed client for the /applications endpoints.
 * All endpoints require a bearer token except where noted; role checks
 * are enforced server-side.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/applications`;

  list(query: ListApplicationsQuery = {}): Observable<Paginated<MerchantApplication>> {
    const params: Record<string, string> = {};
    if (query.page !== undefined) params['page'] = String(query.page);
    if (query.limit !== undefined) params['limit'] = String(query.limit);
    if (query.status) params['status'] = query.status;
    if (query.search) params['search'] = query.search;

    return this.http.get<Paginated<MerchantApplication>>(this.baseUrl, { params });
  }

  get(id: string): Observable<MerchantApplication> {
    return this.http.get<MerchantApplication>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateApplicationRequest): Observable<MerchantApplication> {
    return this.http.post<MerchantApplication>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateApplicationRequest): Observable<MerchantApplication> {
    return this.http.patch<MerchantApplication>(`${this.baseUrl}/${id}`, payload);
  }

  submit(id: string): Observable<MerchantApplication> {
    return this.http.patch<MerchantApplication>(`${this.baseUrl}/${id}/submit`, {});
  }

  assign(id: string, reviewerId: string | null): Observable<MerchantApplication> {
    return this.http.patch<MerchantApplication>(`${this.baseUrl}/${id}/assign`, {
      reviewer_id: reviewerId,
    });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}