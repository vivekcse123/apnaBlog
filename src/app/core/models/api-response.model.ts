export interface apiResponse<T> {
  data: T;
  status: number;
  message: string;
  page?: number | string;
  limit?: number | string;
  total?: number;
  totalPages?: number;
}