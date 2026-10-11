/**
 * Generic pagination envelope returned by every list endpoint.
 * The shape mirrors the backend `Paginated<T>` Pydantic model.
 */

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}