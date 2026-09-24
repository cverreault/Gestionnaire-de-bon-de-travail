import { useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { WebView } from 'react-native-webview';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useSession } from '../stores/session.store';
import { useSyncStore } from '../sync/sync.store';
import { persistForQueue } from '../sync/senders';
import { useTranslation } from 'react-i18next';
import type { AttachmentRef } from '@taskmgr/shared';
import { ApiError, authHeaders } from '../api/client';
import { attachmentContentSource, renameAttachment, type LocalFile } from '../api/endpoints';
import { font, radius, spacing, useTheme } from '../theme/tokens';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;
/** B56 — server limit for videos (the phone's camera rarely exceeds it under ~3 min). */
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 180;

/** Downscale to 1600 px / JPEG 0.8 before upload (roadmap B38.6): field photos are 3–8 MB otherwise. */
async function prepareForUpload(asset: ImagePicker.ImagePickerAsset): Promise<LocalFile> {
  const needsResize = Math.max(asset.width ?? 0, asset.height ?? 0) > MAX_EDGE;
  const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
  const out = await manipulateAsync(
    asset.uri,
    needsResize ? [{ resize: landscape ? { width: MAX_EDGE } : { height: MAX_EDGE } }] : [],
    { compress: JPEG_QUALITY, format: SaveFormat.JPEG },
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return { uri: out.uri, name: `photo-${stamp}.jpg`, type: 'image/jpeg' };
}

/** B56 — videos are queued as-is (no re-encoding on the phone) ; MOV on iOS, MP4 on Android. */
async function prepareVideo(asset: ImagePicker.ImagePickerAsset): Promise<LocalFile & { ext: string }> {
  const ext = asset.uri.toLowerCase().endsWith('.mov') ? 'mov' : asset.uri.toLowerCase().endsWith('.3gp') ? '3gp' : asset.uri.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
  const type = asset.mimeType ?? (ext === 'mov' ? 'video/quicktime' : ext === '3gp' ? 'video/3gpp' : ext === 'webm' ? 'video/webm' : 'video/mp4');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return { uri: asset.uri, name: `video-${stamp}.${ext}`, type, ext };
}

interface Props {
  workOrderId: string;
  /** Metadata from the local work order row, pending uploads projected. */
  attachments: AttachmentRef[];
  /** Ids of attachments that are still in the offline queue. */
  pendingIds: Set<string>;
  canUpload: boolean;
  /** Called after an upload was queued. */
  onChanged: () => void;
}

/** Photos card (B38.6, online slice): thumbnails via the streaming proxy, camera / library upload. */
export default function AttachmentsCard({ workOrderId, attachments, pendingIds, canUpload, onChanged }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const enqueueOp = useSyncStore((s) => s.enqueueOp);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AttachmentRef | null>(null);
  // B68 — caption asked right after the capture ; local overrides until the next pull.
  const [naming, setNaming] = useState<{ assets: ImagePicker.ImagePickerAsset[]; title: string } | null>(null);
  const [titles, setTitles] = useState<Record<string, string | null>>({});
  const labelOf = (a: AttachmentRef) => (a.id in titles ? titles[a.id] : a.title)?.trim() || a.fileName;
  async function rename(a: AttachmentRef, title: string) {
    try {
      const updated = await renameAttachment(a.id, title);
      setTitles((p) => ({ ...p, [a.id]: updated.title ?? null }));
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('workOrder.renameFailed'));
    }
  }

  // Offline-first (B38.5): the compressed copy is persisted in the sandbox and
  // queued ; the drain uploads it with op.id as Idempotency-Key.
  const upload = useMutation({
    mutationFn: async ({ assets, title }: { assets: ImagePicker.ImagePickerAsset[]; title?: string }) => {
      if (!user) return;
      const caption = title?.trim() || undefined;
      for (const [i, asset] of assets.entries()) {
        const opId = Crypto.randomUUID();
        // Several files under one name : « Nom (1) », « Nom (2) »…
        const named = caption ? (assets.length > 1 ? `${caption} (${i + 1})` : caption) : undefined;
        if (asset.type === 'video') {
          const info = await FileSystem.getInfoAsync(asset.uri);
          const size = info.exists && 'size' in info ? info.size : asset.fileSize ?? 0;
          if (size > MAX_VIDEO_BYTES) throw new ApiError(413, t('workOrder.videoTooLarge'));
          const file = await prepareVideo(asset);
          const uri = await persistForQueue(opId, file.uri, file.ext);
          await enqueueOp(user.id, workOrderId, 'attachment', { uri, name: file.name, type: file.type, ...(named ? { title: named } : {}) }, opId);
          continue;
        }
        const file = await prepareForUpload(asset);
        const uri = await persistForQueue(opId, file.uri, 'jpg');
        await enqueueOp(user.id, workOrderId, 'attachment', { uri, name: file.name, type: file.type, ...(named ? { title: named } : {}) }, opId);
      }
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : t('workOrder.uploadFailed')),
  });

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('workOrder.cameraDenied'), undefined, [{ text: t('common.cancel') }, { text: 'OK', onPress: () => void Linking.openSettings() }]);
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled) setNaming({ assets: res.assets, title: '' });
  }

  async function recordVideo() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('workOrder.cameraDenied'), undefined, [{ text: t('common.cancel') }, { text: 'OK', onPress: () => void Linking.openSettings() }]);
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: MAX_VIDEO_SECONDS,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!res.canceled) setNaming({ assets: res.assets, title: '' });
  }

  async function choosePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('workOrder.photosDenied'), undefined, [{ text: t('common.cancel') }, { text: 'OK', onPress: () => void Linking.openSettings() }]);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 1 });
    if (!res.canceled) setNaming({ assets: res.assets, title: '' });
  }

  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const videos = attachments.filter((a) => a.mimeType.startsWith('video/'));
  const others = attachments.filter((a) => !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/'));
  const [openingVideo, setOpeningVideo] = useState<string | null>(null);
  const [iosVideo, setIosVideo] = useState<{ uri: string; name: string } | null>(null);

  /** B56 — the proxy needs the bearer : download to the cache, then hand to the system player (Android) or an in-app player (iOS). */
  async function openVideo(a: AttachmentRef) {
    if (pendingIds.has(a.id) || openingVideo) return;
    setOpeningVideo(a.id);
    setError(null);
    try {
      const ext = a.fileName.split('.').pop()?.toLowerCase() || 'mp4';
      const target = `${FileSystem.cacheDirectory ?? ''}video-${a.id}.${ext}`;
      const info = await FileSystem.getInfoAsync(target);
      if (!info.exists) {
        const dl = await FileSystem.downloadAsync(attachmentContentSource(a.id).uri, target, { headers: authHeaders() });
        if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
      }
      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(target);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: a.mimeType });
      } else {
        setIosVideo({ uri: target, name: a.fileName });
      }
    } catch {
      setError(t('workOrder.videoOpenFailed'));
    } finally {
      setOpeningVideo(null);
    }
  }
  const btn = (label: string, onPress: () => void, primary = false) => (
    <Pressable
      disabled={upload.isPending}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center',
        backgroundColor: primary ? theme.primary : 'transparent',
        borderWidth: 1, borderColor: primary ? theme.primary : theme.border,
        opacity: pressed || upload.isPending ? 0.6 : 1,
      })}
    >
      <Text style={{ color: primary ? theme.onPrimary : theme.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.textMuted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase' }}>{t('workOrder.photos')}</Text>
      {attachments.length === 0 && <Text style={{ color: theme.textMuted }}>{t('workOrder.noPhotos')}</Text>}
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {images.map((a) => (
            <Pressable key={a.id} onPress={() => !pendingIds.has(a.id) && setViewing(a)}>
              <Thumb attachment={a} pending={pendingIds.has(a.id)} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {videos.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: theme.textMuted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase' }}>{t('workOrder.videos')}</Text>
          {videos.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => void openVideo(a)}
              disabled={pendingIds.has(a.id) || !!openingVideo}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontSize: 22 }}>{pendingIds.has(a.id) ? '⏳' : openingVideo === a.id ? '⌛' : '🎬'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: font.sm }} numberOfLines={1}>{labelOf(a)}</Text>
                <Text style={{ color: theme.textMuted, fontSize: font.xs }}>
                  {(a.fileSize / 1024 / 1024).toFixed(1)} Mo{openingVideo === a.id ? ` · ${t('workOrder.openingVideo')}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {others.map((a) => (
        <Text key={a.id} style={{ color: theme.textSecondary, fontSize: font.sm }}>
          📎 {labelOf(a)} · {(a.fileSize / 1024).toFixed(0)} Ko
        </Text>
      ))}
      {canUpload && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          {btn(upload.isPending ? t('workOrder.uploading') : `📷 ${t('workOrder.takePhoto')}`, () => void takePhoto(), true)}
          {btn(`🎬 ${t('workOrder.recordVideo')}`, () => void recordVideo())}
          {btn(`🖼 ${t('workOrder.choosePhoto')}`, () => void choosePhoto())}
        </View>
      )}
      {error && <Text style={{ color: theme.danger, fontSize: font.sm }}>{error}</Text>}
      {naming && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setNaming(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: font.md }}>{t('workOrder.nameMedia', { count: naming.assets.length })}</Text>
              <TextInput
                autoFocus
                value={naming.title}
                onChangeText={(v) => setNaming((n) => (n ? { ...n, title: v } : n))}
                placeholder={t('workOrder.namePlaceholder')}
                placeholderTextColor={theme.textMuted}
                maxLength={120}
                style={{ borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.md, color: theme.text, backgroundColor: theme.surfaceAlt }}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Pressable onPress={() => { const n = naming; setNaming(null); upload.mutate({ assets: n.assets }); }} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ color: theme.text }}>{t('workOrder.skipName')}</Text>
                </Pressable>
                <Pressable onPress={() => { const n = naming; setNaming(null); upload.mutate({ assets: n.assets, title: n.title }); }} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary }}>
                  <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('workOrder.confirm')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
      <PhotoViewer attachment={viewing} label={viewing ? labelOf(viewing) : ''} canRename={canUpload} onRename={(title) => viewing && void rename(viewing, title)} onClose={() => setViewing(null)} />
      {iosVideo && (
        <Modal visible animationType="slide" onRequestClose={() => setIosVideo(null)}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView source={{ uri: iosVideo.uri }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} allowingReadAccessToURL={FileSystem.cacheDirectory ?? undefined} style={{ flex: 1, backgroundColor: '#000' }} />
            <Pressable onPress={() => setIosVideo(null)} style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: font.lg }}>✕</Text>
            </Pressable>
            <Text style={{ position: 'absolute', bottom: 40, alignSelf: 'center', color: '#fff', fontSize: font.sm }}>{iosVideo.name}</Text>
          </View>
        </Modal>
      )}
    </View>
  );
}

function Thumb({ attachment, pending }: { attachment: AttachmentRef; pending: boolean }) {
  const theme = useTheme();
  if (pending) {
    return (
      <View style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 24 }}>⏳</Text>
      </View>
    );
  }
  const source = attachmentContentSource(attachment.id);
  return (
    <Image
      source={source}
      accessibilityLabel={attachment.fileName}
      style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: theme.surfaceAlt }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
    />
  );
}

/** Full-screen photo (proxy + bearer) ; tap anywhere or ✕ to close. */
function PhotoViewer({ attachment, label, canRename, onRename, onClose }: { attachment: AttachmentRef | null; label: string; canRename: boolean; onRename: (title: string) => void; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  if (!attachment) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={attachmentContentSource(attachment.id)} style={{ width, height: height * 0.8 }} contentFit="contain" cachePolicy="memory-disk" />
        {editing === null ? (
          <Pressable onPress={() => canRename && setEditing(attachment.title ?? '')} style={{ position: 'absolute', bottom: 36, left: 20, right: 20, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: font.sm, fontWeight: '600' }} numberOfLines={2}>{canRename ? '✏️ ' : ''}{label}</Text>
            {label !== attachment.fileName && <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: font.xs }}>{attachment.fileName}</Text>}
          </Pressable>
        ) : (
          <View style={{ position: 'absolute', bottom: 24, left: 16, right: 16, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }} onStartShouldSetResponder={() => true}>
            <TextInput
              autoFocus
              value={editing}
              onChangeText={setEditing}
              placeholder={attachment.fileName}
              placeholderTextColor="rgba(255,255,255,0.5)"
              maxLength={120}
              style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: radius.md, padding: spacing.sm, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)' }}
            />
            <Pressable onPress={() => { const v = editing; setEditing(null); onRename(v); }} style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: theme.primary }}>
              <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('workOrder.confirm')}</Text>
            </Pressable>
          </View>
        )}
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: font.lg }}>✕</Text>
        </Pressable>
        <Text style={{ position: 'absolute', top: 60, left: 20, color: theme.textMuted, fontSize: font.xs }}>{(attachment.fileSize / 1024).toFixed(0)} Ko</Text>
      </Pressable>
    </Modal>
  );
}
