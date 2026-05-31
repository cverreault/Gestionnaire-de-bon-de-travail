import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAddressTypes } from '../hooks/useSettings';
import { theme, formStyles } from '../theme';

export interface AddressFormValues {
  streetNumber: string;
  street: string;
  apartment: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  /** Free-form code matching an AddressTypeConfig.code (admin-configurable). */
  addressType: string;
  label: string;
  isDefault: boolean;
}

/**
 * Reusable address form fields. Render the inputs only — no submit, no wrapper card.
 * Caller controls the surrounding `<form>` and provides the react-hook-form instance.
 */
export default function AddressFormFields({
  form,
  title,
}: {
  form: UseFormReturn<AddressFormValues>;
  /** Optional header text rendered above the inputs. Skip to embed in a parent layout. */
  title?: string;
}) {
  const { register, formState: { errors } } = form;
  const { data: addressTypes = [] } = useAddressTypes(true);
  const { t } = useTranslation('addresses');
  const { t: tCommon } = useTranslation('common');
  return (
    <div
      style={{
        background: theme.colors.surfaceAlt,
        border: theme.borders.default,
        borderRadius: theme.radius.md,
        padding: '1rem',
      }}
    >
      {title && (
        <p style={{ margin: '0 0 0.75rem', fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: theme.colors.text }}>
          {title}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.streetNumber')}</label>
          <input style={{ ...formStyles.input }} placeholder="123" {...register('streetNumber')} />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.street')} <span style={{ color: theme.colors.danger }}>*</span></label>
          <input style={{ ...formStyles.input }} placeholder={t('fields.streetPlaceholder', { defaultValue: 'rue des Érables' })} {...register('street', { required: tCommon('validation.required') })} />
          {errors.street && <span style={{ ...formStyles.fieldError }}>{errors.street.message}</span>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.apartment')}</label>
          <input style={{ ...formStyles.input }} placeholder="301, app. 2B..." {...register('apartment')} />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.city')} <span style={{ color: theme.colors.danger }}>*</span></label>
          <input style={{ ...formStyles.input }} placeholder="Montréal" {...register('city', { required: tCommon('validation.required') })} />
          {errors.city && <span style={{ ...formStyles.fieldError }}>{errors.city.message}</span>}
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.postalCode')}</label>
          <input style={{ ...formStyles.input }} placeholder="H1A 2B3" {...register('postalCode')} />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.province')}</label>
          <input style={{ ...formStyles.input }} placeholder="QC" {...register('province')} />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.country')}</label>
          <input style={{ ...formStyles.input }} placeholder="Canada" {...register('country')} />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.addressType')}</label>
          <select style={{ ...formStyles.select }} {...register('addressType')}>
            {addressTypes.map((typeCfg) => (
              <option key={typeCfg.code} value={typeCfg.code}>
                {typeCfg.icon ? `${typeCfg.icon} ` : ''}{typeCfg.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('fields.label')} <span style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeXs }}>{tCommon('labels.optional')}</span></label>
          <input style={{ ...formStyles.input }} placeholder={t('fields.labelPlaceholder', { defaultValue: 'Ex: Siège social' })} {...register('label')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.6rem' }}>
          <input type="checkbox" id={`isDefault-${title ?? 'addr'}`} {...register('isDefault')} />
          <label htmlFor={`isDefault-${title ?? 'addr'}`} style={{ fontSize: theme.font.sizeSm, color: theme.colors.text, cursor: 'pointer' }}>
            {t('fields.isDefault')}
          </label>
        </div>
      </div>
    </div>
  );
}

export const ADDRESS_FORM_DEFAULTS: AddressFormValues = {
  streetNumber: '',
  street: '',
  apartment: '',
  city: '',
  postalCode: '',
  province: 'QC',
  country: 'Canada',
  addressType: 'WORKSITE',
  label: '',
  isDefault: false,
};
