export type PaginatedResponse<T> = {
  data: T[];
  per_page: number;
  current_page: number;
  from: number;
  to: number;
  last_page: number;
  total: number;
};

export type SupabasePaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  hasMore: boolean;
};
