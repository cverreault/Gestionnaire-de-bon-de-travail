import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useVersion,
  useBackupInfo,
  useDownloadBackup,
  useRestoreBackup,
} from '../hooks/useBackup';
import { theme, cardStyles, buttonStyles, layoutStyles } from '../theme';
import LoadingSpinner from '../components/LoadingSpinner';

export default function BackupPage() {
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const versionQuery = useVersion();
  const infoQuery = useBackupInfo();
  const download = useDownloadBackup();
  const restore = useRestoreBackup();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const version = versionQuery.data?.version;

  const handleDownload = () => {
    download.mutate();
  };

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.tar.gz')) {
      alert(tCommon('common:backupPage.invalidFormat', { defaultValue: 'Format invalide : seuls les fichiers .tar.gz sont acceptés.' }));
      e.target.value = '';
      return;
    }
    setPendingFile(file);
    setConfirmRestore(true);
  };

  const handleConfirmRestore = () => {
    if (!pendingFile) return;
    restore.mutate(pendingFile, {
      onSettled: () => {
        setPendingFile(null);
        setConfirmRestore(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const handleCancelRestore = () => {
    setPendingFile(null);
    setConfirmRestore(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Extrait la version du nom de fichier sélectionné (info indicative).
  const detectedVersion = pendingFile
    ? extractVersionFromFilename(pendingFile.name)
    : null;
  const versionMatches = detectedVersion ? detectedVersion === version : null;

  return (
    <div style={{ ...layoutStyles.page, maxWidth: '900px' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: theme.colors.text }}>
          💾 {tNav('backup')}
        </h1>
        <p style={{ marginTop: '0.5rem', color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
          {tCommon('backup.intro', { defaultValue: "Exportez l'intégralité de l'instance (base de données + pièces jointes) ou restaurez une sauvegarde précédente." })}
        </p>
      </header>

      {/* Version banner */}
      <div
        style={{
          ...cardStyles.card,
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderLeft: `4px solid ${theme.colors.primary}`,
        }}
      >
        <div>
          <div
            style={{
              fontSize: theme.font.sizeXs,
              fontWeight: theme.font.weightBold,
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem',
            }}
          >
            {tCommon('common:backupPage.systemVersion', { defaultValue: 'Version du système' })}
          </div>
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: theme.font.weightBold,
              color: theme.colors.primary,
              fontFamily: 'monospace',
            }}
          >
            {versionQuery.isLoading ? '…' : version ? `v${version}` : '?'}
          </div>
        </div>
        {infoQuery.data && (
          <div style={{ textAlign: 'right', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
            <div>{tCommon('common:backupPage.attachmentsCount', { defaultValue: 'Pièces jointes :' })} <strong>{infoQuery.data.attachmentsCount}</strong></div>
            <div style={{ fontSize: theme.font.sizeXs, marginTop: '0.25rem' }}>
              {tCommon('common:backupPage.versionInFilename', { defaultValue: 'Cette version sera intégrée au nom du fichier de sauvegarde' })}
            </div>
          </div>
        )}
      </div>

      {/* Backup section */}
      <section style={{ ...cardStyles.card, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: theme.colors.text }}>
          📥 {tCommon('backup.download', { defaultValue: 'Télécharger une sauvegarde' })}
        </h2>
        <p style={{ margin: '0 0 1rem', color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
          {tCommon('common:backupPage.downloadDescPrefix', { defaultValue: 'Génère une archive' })}{' '}
          <code>tar.gz</code>{' '}
          {tCommon('common:backupPage.downloadDescSuffix', { defaultValue: 'contenant un dump SQL complet et les pièces jointes MinIO. Le nom de fichier inclut la version courante pour assurer la compatibilité au restore.' })}
        </p>
        {infoQuery.data && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: theme.colors.primaryLight,
              borderRadius: theme.radius.md,
              marginBottom: '1rem',
              fontFamily: 'monospace',
              fontSize: theme.font.sizeSm,
              color: theme.colors.primaryHover,
              wordBreak: 'break-all',
            }}
          >
            📄 {infoQuery.data.suggestedFilename}
          </div>
        )}
        <button
          onClick={handleDownload}
          disabled={download.isPending}
          style={{
            ...buttonStyles.primary,
            opacity: download.isPending ? 0.6 : 1,
            cursor: download.isPending ? 'wait' : 'pointer',
          }}
        >
          {download.isPending ? '⏳ ' + tCommon('backup.generating', { defaultValue: 'Génération en cours…' }) : '📥 ' + tCommon('actions.download')}
        </button>
        {download.isError && (
          <p style={{ color: theme.colors.danger, marginTop: '0.75rem', fontSize: theme.font.sizeSm }}>
            {tCommon('common:backupPage.failurePrefix', { defaultValue: 'Échec :' })} {(download.error as Error)?.message ?? tCommon('common:backupPage.unknownError', { defaultValue: 'erreur inconnue' })}
          </p>
        )}
        {download.isSuccess && download.data && (
          <p style={{ color: theme.colors.success, marginTop: '0.75rem', fontSize: theme.font.sizeSm }}>
            ✅ {tCommon('common:backupPage.downloadedPrefix', { defaultValue: 'Téléchargé :' })} {download.data.filename} ({formatBytes(download.data.size)})
          </p>
        )}
      </section>

      {/* Restore section */}
      <section style={{ ...cardStyles.card, padding: '1.5rem', borderLeft: `4px solid ${theme.colors.danger}` }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: theme.colors.text }}>
          📤 {tCommon('backup.restore', { defaultValue: 'Restaurer une sauvegarde' })}
        </h2>
        <div
          style={{
            padding: '0.875rem 1rem',
            background: theme.colors.dangerLight,
            border: `1px solid ${theme.colors.danger}`,
            borderRadius: theme.radius.md,
            marginBottom: '1rem',
            fontSize: theme.font.sizeSm,
            color: '#7f1d1d',
          }}
        >
          ⚠️ <strong>{tCommon('common:backupPage.destructiveTitle', { defaultValue: 'Action destructive.' })}</strong>{' '}
          {tCommon('common:backupPage.destructiveBody', { defaultValue: 'Toutes les données actuelles (BD + pièces jointes) seront' })}{' '}
          <strong>{tCommon('common:backupPage.overwritten', { defaultValue: 'écrasées' })}</strong>{tCommon('common:backupPage.destructiveTail', { defaultValue: ". Téléchargez une sauvegarde de l'état courant avant de procéder." })}
        </div>
        <p style={{ margin: '0 0 0.75rem', color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
          {tCommon('common:backupPage.versionMatchPrefix', { defaultValue: 'La version contenue dans la sauvegarde doit correspondre à la version courante (' })}<strong>v{version ?? '?'}</strong>{tCommon('common:backupPage.versionMatchSuffix', { defaultValue: '). Sinon, la restauration sera refusée.' })}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".tar.gz,application/gzip"
          onChange={handleSelectFile}
          style={{ display: 'none' }}
          id="backup-file"
        />
        <label
          htmlFor="backup-file"
          style={{
            ...buttonStyles.secondary,
            display: 'inline-block',
            cursor: 'pointer',
          }}
        >
          📁 {tCommon('common:backupPage.chooseArchive', { defaultValue: 'Choisir une archive .tar.gz' })}
        </label>

        {restore.isError && (
          <p style={{ color: theme.colors.danger, marginTop: '0.75rem', fontSize: theme.font.sizeSm }}>
            ❌ {extractApiError(restore.error)}
          </p>
        )}
        {restore.isSuccess && restore.data && (
          <p style={{ color: theme.colors.success, marginTop: '0.75rem', fontSize: theme.font.sizeSm }}>
            ✅ {tCommon('common:backupPage.restoreSuccess', { defaultValue: 'Restauration réussie — version {{version}}, {{count}} pièce(s) jointe(s).', version: restore.data.backupVersion, count: restore.data.attachmentsRestored })}
          </p>
        )}
      </section>

      {/* Confirm modal */}
      {confirmRestore && pendingFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: theme.zIndex.modal,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: theme.radius.lg,
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: theme.shadows.xl,
            }}
          >
            <h3 style={{ margin: '0 0 1rem', color: theme.colors.danger }}>
              ⚠️ {tCommon('common:backupPage.confirmRestoreTitle', { defaultValue: 'Confirmer la restauration ?' })}
            </h3>
            <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeSm }}>
              {tCommon('common:backupPage.fileLabel', { defaultValue: 'Fichier :' })} <strong style={{ wordBreak: 'break-all' }}>{pendingFile.name}</strong>
            </p>
            <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeSm }}>
              {tCommon('common:backupPage.sizeLabel', { defaultValue: 'Taille :' })} <strong>{formatBytes(pendingFile.size)}</strong>
            </p>
            {detectedVersion && (
              <p
                style={{
                  margin: '0.5rem 0',
                  padding: '0.5rem 0.75rem',
                  background: versionMatches ? theme.colors.successLight : theme.colors.warningLight,
                  borderRadius: theme.radius.sm,
                  fontSize: theme.font.sizeSm,
                }}
              >
                {tCommon('common:backupPage.detectedVersion', { defaultValue: 'Version détectée :' })} <strong>v{detectedVersion}</strong>{' '}
                {versionMatches
                  ? `✅ ${tCommon('common:backupPage.compatible', { defaultValue: 'compatible' })}`
                  : `⚠️ ${tCommon('common:backupPage.versionMismatch', { defaultValue: 'ne correspond pas à v{{version}} — sera refusé', version })}`}
              </p>
            )}
            <p style={{ margin: '1rem 0', fontSize: theme.font.sizeSm, color: theme.colors.danger }}>
              {tCommon('common:backupPage.irreversibleWarning', { defaultValue: 'Toutes les données actuelles seront écrasées. Cette action est irréversible.' })}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={handleCancelRestore} style={buttonStyles.ghost}>
                {tCommon('common:backupPage.cancel', { defaultValue: 'Annuler' })}
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={restore.isPending}
                style={{
                  ...buttonStyles.danger,
                  opacity: restore.isPending ? 0.6 : 1,
                  cursor: restore.isPending ? 'wait' : 'pointer',
                }}
              >
                {restore.isPending ? `⏳ ${tCommon('common:backupPage.restoring', { defaultValue: 'Restauration…' })}` : tCommon('common:backupPage.restore', { defaultValue: 'Restaurer' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {restore.isPending && <LoadingSpinner fullPage />}
    </div>
  );
}

function extractVersionFromFilename(name: string): string | null {
  const m = /taskmgr-backup_v([\d.]+)_/.exec(name);
  return m?.[1] ?? null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string; error?: { message?: string } } }; message?: string };
  return (
    e?.response?.data?.error?.message ??
    e?.response?.data?.message ??
    e?.message ??
    'erreur inconnue'
  );
}
