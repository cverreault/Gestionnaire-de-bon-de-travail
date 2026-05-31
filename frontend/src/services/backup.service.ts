import api from './api';
import type { ApiResponse } from '../types';

export interface BackupInfo {
  version: string;
  attachmentsCount: number;
  suggestedFilename: string;
  generatedAt: string;
}

export interface RestoreResult {
  restored: boolean;
  backupVersion: string;
  attachmentsRestored: number;
  restoredAt: string;
}

export interface HealthInfo {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
}

const backupService = {
  async health(): Promise<HealthInfo> {
    const { data } = await api.get<ApiResponse<HealthInfo>>('/health');
    return data.data;
  },

  async info(): Promise<BackupInfo> {
    const { data } = await api.get<ApiResponse<BackupInfo>>('/backup/info');
    return data.data;
  },

  /**
   * Télécharge l'archive et déclenche la sauvegarde côté browser.
   * Lit le filename dans Content-Disposition pour préserver le pattern versionné.
   */
  async downloadBackup(): Promise<{ filename: string; size: number }> {
    const response = await api.get('/backup/export', {
      responseType: 'blob',
      timeout: 0, // pas de timeout : un dump peut prendre plusieurs minutes
    });

    const cd = response.headers['content-disposition'] as string | undefined;
    const fallback = `taskmgr-backup_${new Date().toISOString().slice(0, 10)}.tar.gz`;
    const filename = parseFilename(cd) ?? fallback;

    const blob = response.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return { filename, size: blob.size };
  },

  async restore(file: File): Promise<RestoreResult> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post<ApiResponse<RestoreResult>>(
      '/backup/restore',
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0,
      },
    );
    return data.data;
  },
};

function parseFilename(contentDisposition?: string): string | null {
  if (!contentDisposition) return null;
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

export default backupService;
