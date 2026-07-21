import api from './api';
import type { ApiResponse } from '../types';

/**
 * Tenant admin CRUD for API keys (B8).
 *
 * Backed by `/api/tenant/api-keys`. ADMIN role — the sidebar entry is
 * hidden for other roles and the backend enforces the guard regardless.
 */

export type ApiKeyScope = 'read-only' | 'read-write' | 'admin';

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scope: ApiKeyScope;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  scope: ApiKeyScope;
  expiresAt?: string;
}

export interface MintedApiKey {
  id: string;
  name: string;
  scope: ApiKeyScope;
  keyPrefix: string;
  expiresAt: string | null;
  createdAt: string;
  /** ⚠️ Shown once — the UI must present it and then discard. */
  plaintext: string;
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data } = await api.get<ApiResponse<ApiKeyRow[]>>(
    '/tenant/api-keys',
  );
  return data.data;
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<MintedApiKey> {
  const { data } = await api.post<ApiResponse<MintedApiKey>>(
    '/tenant/api-keys',
    input,
  );
  return data.data;
}

export async function revokeApiKey(id: string): Promise<void> {
  await api.delete(`/tenant/api-keys/${id}`);
}
