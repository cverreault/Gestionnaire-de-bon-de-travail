import { Pressable, Text, View } from 'react-native';
import type { SyncTag } from '@taskmgr/shared';
import { font, radius } from '../theme/tokens';

/** B44 — one coloured pill ; `selected` inverts the tint (filter chips). */
export function TagChip({ tag, selected, onPress }: { tag: SyncTag; selected?: boolean; onPress?: () => void }) {
  const color = tag.color || '#6b7280';
  const chip = (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: selected ? color : `${color}22`,
        borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2,
        borderWidth: 1, borderColor: selected ? color : `${color}44`,
      }}
    >
      {!selected && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />}
      <Text style={{ color: selected ? '#fff' : color, fontSize: font.xs, fontWeight: '600' }}>{tag.name}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} hitSlop={4}>{chip}</Pressable> : chip;
}

/** Wrapping row of chips ; renders nothing when empty. */
export default function TagChips({ tags }: { tags?: SyncTag[] | null }) {
  if (!tags || tags.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {tags.map((tg) => <TagChip key={tg.id} tag={tg} />)}
    </View>
  );
}
