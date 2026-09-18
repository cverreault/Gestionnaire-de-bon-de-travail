import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AttachmentRef } from '@taskmgr/shared';
import { ApiError } from '../api/client';
import { attachmentContentSource, fetchAttachments, uploadAttachment, type LocalFile } from '../api/endpoints';
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
  /** Uploads are allowed only on the technician's active work orders. */
  canUpload: boolean;
}

/** Photos card (B38.6, online slice): list via the streaming proxy, camera / library upload. */
export default function AttachmentsCard({ workOrderId, canUpload }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['work-order', workOrderId, 'attachments'], queryFn: () => fetchAttachments(workOrderId) });

  const upload = useMutation({
    mutationFn: async (assets: ImagePicker.ImagePickerAsset[]) => {
      for (const asset of assets) {
        await uploadAttachment(workOrderId, await prepareForUpload(asset));
      }
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['work-order', workOrderId, 'attachments'] });
      void qc.invalidateQueries({ queryKey: ['work-order', workOrderId] });
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

  const images = (list.data ?? []).filter((a) => a.mimeType.startsWith('image/'));
  const others = (list.data ?? []).filter((a) => !a.mimeType.startsWith('image/'));
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
      {list.isLoading && <ActivityIndicator color={theme.primary} />}
      {list.data && list.data.length === 0 && <Text style={{ color: theme.textMuted }}>{t('workOrder.noPhotos')}</Text>}
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {images.map((a) => (
            <Thumb key={a.id} attachment={a} />
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
    </View>
  );
}

function Thumb({ attachment }: { attachment: AttachmentRef }) {
  const theme = useTheme();
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
