import api from './api';

/**
 * Fetches the OpenAPI 3.0 spec for the public API v1 (B8).
 *
 * Backend gates `/api/v1/docs-json` with the standard JwtAuthGuard, so
 * the caller must be a logged-in TaskMgr user. The axios interceptor
 * attaches the JWT automatically.
 */
export async function getOpenApiSpec(): Promise<unknown> {
  const { data } = await api.get('/v1/docs-json', {
    // The response is the raw OpenAPI object, not the standard
    // { success, data, timestamp } envelope, so bypass the interceptor's
    // unwrap by using a manual axios path if needed. In practice the
    // Swagger docs route is served outside the TransformInterceptor's
    // scope — the raw JSON reaches us.
  });
  return data;
}
