export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const bad = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'unauthorized') => new HttpError(401, m);
export const forbidden = (m = 'forbidden') => new HttpError(403, m);
export const notFound = (m = 'not found') => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
