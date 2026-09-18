import { useRef } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { useTranslation } from 'react-i18next';
import { font, radius, spacing, useTheme } from '../theme/tokens';

interface Props {
  visible: boolean;
  title: string;
  onSave: (pngDataUrl: string) => void;
  onCancel: () => void;
}

/** Full-screen signature capture (B38.6) : returns a PNG data-URL, the format the server stores inline (ADR-016 §6). */
export default function SignaturePad({ visible, title, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ref = useRef<SignatureViewRef>(null);

  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: 1px dashed ${theme.border}; border-radius: 12px; }
    .m-signature-pad--footer { display: none; }
    body, html { background: ${theme.surface}; }
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: theme.surface, padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: theme.text, fontSize: font.lg, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{t('workOrder.signatureHint')}</Text>
        <View style={{ flex: 1 }}>
          <SignatureScreen
            ref={ref}
            onOK={(sig: string) => onSave(sig)}
            onEmpty={() => undefined}
            webStyle={webStyle}
            backgroundColor={theme.surface}
            penColor={theme.text}
            imageType="image/png"
            descriptionText=""
            autoClear={false}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable onPress={onCancel} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.text }}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable onPress={() => ref.current?.clearSignature()} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.text }}>{t('workOrder.clear')}</Text>
          </Pressable>
          <Pressable onPress={() => ref.current?.readSignature()} style={{ flex: 2, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary }}>
            <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('workOrder.save')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
