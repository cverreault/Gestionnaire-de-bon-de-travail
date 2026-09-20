import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
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
import { ApiError } from '../api/client';
import { attachmentContentSource, type LocalFile } from '../api/endpoints';
import { font, radius, spacing, useTheme } from '../theme/tokens';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

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

  // Offline-first (B38.5): the compressed copy is persisted in the sandbox and
  // queued ; the drain uploads it with op.id as Idempotency-Key.
  const upload = useMutation({
    mutationFn: async (assets: ImagePicker.ImagePickerAsset[]) => {
      if (!user) return;
      for (const asset of assets) {
        const file = await prepareForUpload(asset);
        const opId = Crypto.randomUUID();
        const uri = await persistForQueue(opId, file.uri, 'jpg');
        await enqueueOp(user.id, workOrderId, 'attachment', { uri, name: file.name, type: file.type }, opId);
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
    if (!res.canceled) upload.mutate(res.assets);
  }

  async function choosePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('workOrder.photosDenied'), undefined, [{ text: t('common.cancel') }, { text: 'OK', onPress: () => void Linking.openSettings() }]);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 1 });
    if (!res.canceled) upload.mutate(res.assets);
  }

  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const others = attachments.filter((a) => !a.mimeType.startsWith('image/'));
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
      {others.map((a) => (
        <Text key={a.id} style={{ color: theme.textSecondary, fontSize: font.sm }}>
          📎 {a.fileName} · {(a.fileSize / 1024).toFixed(0)} Ko
        </Text>
      ))}
      {canUpload && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          {btn(upload.isPending ? t('workOrder.uploading') : `📷 ${t('workOrder.takePhoto')}`, () => void takePhoto(), true)}
          {btn(`🖼 ${t('workOrder.choosePhoto')}`, () => void choosePhoto())}
        </View>
      )}
      {error && <Text style={{ color: theme.danger, fontSize: font.sm }}>{error}</Text>}
      <PhotoViewer attachment={viewing} onClose={() => setViewing(null)} />
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
function PhotoViewer({ attachment, onClose }: { attachment: AttachmentRef | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  if (!attachment) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={attachmentContentSource(attachment.id)} style={{ width, height: height * 0.8 }} contentFit="contain" cachePolicy="memory-disk" />
        <Text style={{ position: 'absolute', bottom: 40, color: '#fff', fontSize: font.sm }}>{attachment.fileName}</Text>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: font.lg }}>✕</Text>
        </Pressable>
        <Text style={{ position: 'absolute', top: 60, left: 20, color: theme.textMuted, fontSize: font.xs }}>{(attachment.fileSize / 1024).toFixed(0)} Ko</Text>
      </Pressable>
    </Modal>
  );
}
