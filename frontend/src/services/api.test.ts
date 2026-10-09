import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApi, errorMessageKey, NetworkError } from '@/services/api';
import { jsonResponse, mockFetch } from '@/test/render';

describe('api client', () => {
  it('returns typed data on success', async () => {
    mockFetch(() => jsonResponse({ status: 'ok' }));
    const { data } = await createApi('http://api.test').GET('/api/ready');
    expect(data).toEqual({ status: 'ok' });
  });

  it('turns the server error envelope into an ApiError with code and request id', async () => {
    mockFetch(() =>
      jsonResponse(
        { error: { code: 'service_unavailable', message: 'x', request_id: 'abc123' } },
        503,
      ),
    );
    const error = await createApi('http://api.test')
      .GET('/api/ready')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'service_unavailable', requestId: 'abc123' });
  });

  it('uses a generic code when the body is not our envelope (e.g. a proxy page)', async () => {
    mockFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await createApi('http://api.test')
      .GET('/api/ready')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: 'unknown' });
  });

  it('reports unreachable servers as NetworkError', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    const error = await createApi('http://api.test')
      .GET('/api/ready')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
  });
});

describe('errorMessageKey', () => {
  it('maps errors to i18n keys, never to raw codes (HR21)', () => {
    expect(errorMessageKey(new ApiError(404, 'not_found', undefined))).toBe('errors.not_found');
    expect(errorMessageKey(new NetworkError())).toBe('errors.network');
    expect(errorMessageKey(new Error('boom'))).toBe('errors.unknown');
  });
});
