import api from './api';

export interface ConfigSummary {
  key: string;
  encrypted: boolean;
  updatedAt: string;
  updatedBy: string | null;
  source: 'db';
}

export interface ConfigListResponse {
  items: ConfigSummary[];
  encryptionAvailable: boolean;
}

export interface ConfigValueResponse {
  key: string;
  value: string;
  source: 'db' | 'env';
  encrypted: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const listConfigs = () => api.get('/super-admin/configs');

export const getConfigValue = (key: string) =>
  api.get(`/super-admin/configs/${encodeURIComponent(key)}`);

export const upsertConfig = (key: string, value: string, encrypted: boolean) =>
  api.put(`/super-admin/configs/${encodeURIComponent(key)}`, { value, encrypted });

export const deleteConfig = (key: string) =>
  api.delete(`/super-admin/configs/${encodeURIComponent(key)}`);
