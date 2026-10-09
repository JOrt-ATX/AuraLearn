import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from './schema';

/** A failed API call, reduced to what the UI may use: a stable code and the request id. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId: string | undefined,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Raised when the server could not be reached at all (offline, DNS, CORS). */
export class NetworkError extends Error {
  constructor() {
    super('network');
    this.name = 'NetworkError';
  }
}

interface ErrorEnvelope {
  error: { code: string; request_id?: string };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  );
}

/** Turn every non-2xx response into an ApiError so components never parse error bodies. */
const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined;
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      body = undefined; // not JSON (e.g. a proxy page): fall back to the generic code below
    }
    if (isErrorEnvelope(body)) {
      throw new ApiError(response.status, body.error.code, body.error.request_id);
    }
    throw new ApiError(
      response.status,
      'unknown',
      response.headers.get('X-Request-ID') ?? undefined,
    );
  },
  onError() {
    throw new NetworkError();
  },
};

// Same origin in production (nginx proxies /api); the dev server proxies it as well.
const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL ?? globalThis.location.origin;

/** Build a typed client. `fetch` is resolved per call so tests can replace the global. */
export function createApi(
  baseUrl: string = defaultBaseUrl,
): ReturnType<typeof createClient<paths>> {
  const client = createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: (request) => globalThis.fetch(request),
  });
  client.use(errorMiddleware);
  return client;
}

export const api = createApi();

/** Map any thrown value to the i18n key under `errors.*` (HR15/HR21: never show a raw code). */
export function errorMessageKey(error: unknown): `errors.${string}` {
  if (error instanceof NetworkError) return 'errors.network';
  if (error instanceof ApiError) return `errors.${error.code}`;
  return 'errors.unknown';
}
