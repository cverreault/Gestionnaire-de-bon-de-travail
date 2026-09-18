import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProcessStepRef, WorkOrderStatus } from '@taskmgr/shared';
import { STATUS_COLORS, font, radius } from '../theme/tokens';

/** Status chip — the process step's own label and colour win over the legacy enum. */
export default function StatusBadge({ status, step }: { status: WorkOrderStatus; step?: ProcessStepRef | null }) {
  const { t, i18n } = useTranslation();
  const label = step
    ? (i18n.language.startsWith('en') ? step.nameEn : step.nameFr) || step.name
    : t(`status.${status}`, { defaultValue: status });
  const color = step?.color || STATUS_COLORS[status] || '#64748b';
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: `${color}22`, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: font.xs, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
