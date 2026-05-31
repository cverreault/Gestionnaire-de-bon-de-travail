import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import backupService from '../services/backup.service';

export const BACKUP_KEY = 'backup';
export const VERSION_KEY = 'health-version';

export function useVersion() {
  return useQuery({
    queryKey: [VERSION_KEY],
    queryFn: () => backupService.health(),
    staleTime: 5 * 60_000,
  });
}

export function useBackupInfo() {
  return useQuery({
    queryKey: [BACKUP_KEY, 'info'],
    queryFn: () => backupService.info(),
    staleTime: 30_000,
  });
}

export function useDownloadBackup() {
  return useMutation({
    mutationFn: () => backupService.downloadBackup(),
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => backupService.restore(file),
    onSuccess: () => {
      // Tout le cache est potentiellement périmé après un restore.
      qc.invalidateQueries();
    },
  });
}
