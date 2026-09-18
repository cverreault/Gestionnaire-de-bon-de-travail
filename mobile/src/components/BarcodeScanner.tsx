import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { font, radius, spacing, useTheme } from '../theme/tokens';

interface Props {
  visible: boolean;
  onScanned: (value: string) => void;
  onCancel: () => void;
}

/** Barcode / QR scanner (B38.7) : emits the first code seen, once. */
export default function BarcodeScanner({ visible, onScanned, onCancel }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [asked, setAsked] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (visible) fired.current = false;
    if (visible && permission && !permission.granted && !asked) {
      setAsked(true);
      void requestPermission();
    }
  }, [visible, permission, asked, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'itf14', 'datamatrix'] }}
            onBarcodeScanned={({ data }) => {
              if (fired.current || !data) return;
              fired.current = true;
              onScanned(data);
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
            <Text style={{ color: '#fff', textAlign: 'center' }}>{t('workOrder.cameraDenied')}</Text>
            <Pressable onPress={() => void Linking.openSettings()}><Text style={{ color: theme.primary, fontWeight: '600' }}>OK</Text></Pressable>
          </View>
        )}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, gap: spacing.sm, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: font.sm }}>{t('workOrder.scanHint')}</Text>
          <Pressable onPress={onCancel} style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
