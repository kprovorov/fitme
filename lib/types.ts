export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  from: number;
  last_page: number;
  per_page: number;
  to: number;
  total: number;
}

export interface SupabasePaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  page: number;
  total: number;
}
