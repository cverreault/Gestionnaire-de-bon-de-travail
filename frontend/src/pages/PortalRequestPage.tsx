import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createWorkRequest,
  getPortalAddresses,
  getPortalTaskTypes,
} from '../services/portal.service';
import { theme, cardStyles, buttonStyles, formStyles } from '../theme';
import { toast } from '../context/toast.store';

/**
 * B21 — work-request form: task type + one of the client's addresses +
 * description. The request lands as a WO at the « Demandé » step,
 * pending admin approval.
 */
export default function PortalRequestPage() {
  const { t, i18n } = useTranslation('portal');
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [taskTypeId, setTaskTypeId] = useState('');
  const [clientAddressId, setClientAddressId] = useState('');
  const [description, setDescription] = useState('');

  const { data: taskTypes } = useQuery({
    queryKey: ['portal', 'task-types'],
    queryFn: getPortalTaskTypes,
  });
  const { data: addresses } = useQuery({
    queryKey: ['portal', 'addresses'],
    queryFn: getPortalAddresses,
  });

  const submit = useMutation({
    mutationFn: () => createWorkRequest({ taskTypeId, clientAddressId, description }),
    onSuccess: (wo) => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'work-orders'] });
      toast.success(t('request.success', { reference: wo.referenceNumber }));
      navigate('/portail');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  const canSubmit = taskTypeId && clientAddressId && description.trim().length > 0;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeXl, color: theme.colors.text }}>
        {t('request.title')}
      </h1>
      <p style={{ margin: '0 0 1rem', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
        {t('request.subtitle')}
      </p>

      <div style={{ ...cardStyles.card, padding: '1.25rem' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit && !submit.isPending) submit.mutate();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div>
            <label style={formStyles.label}>{t('request.taskType')} *</label>
            <select
              value={taskTypeId}
              onChange={(e) => setTaskTypeId(e.target.value)}
              style={formStyles.select}
              required
            >
              <option value="">{t('request.selectTaskType')}</option>
              {(taskTypes ?? []).map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {(locale === 'en' ? tt.nameEn : tt.nameFr) || tt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={formStyles.label}>{t('request.address')} *</label>
            <select
              value={clientAddressId}
              onChange={(e) => setClientAddressId(e.target.value)}
              style={formStyles.select}
              required
            >
              <option value="">{t('request.selectAddress')}</option>
              {(addresses ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.street}, {a.city}
                  {a.isDefault ? ` — ${t('request.defaultAddress')}` : ''}
                </option>
              ))}
            </select>
            {addresses && addresses.length === 0 && (
              <p style={{ margin: '0.35rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.danger }}>
                {t('request.noAddress')}
              </p>
            )}
          </div>

          <div>
            <label style={formStyles.label}>{t('request.description')} *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder={t('request.descriptionPlaceholder')}
              style={{ ...formStyles.textarea, resize: 'vertical' }}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => navigate('/portail')}
              style={buttonStyles.secondary}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submit.isPending}
              style={{ ...buttonStyles.primary, opacity: !canSubmit || submit.isPending ? 0.6 : 1 }}
            >
              {submit.isPending ? t('request.submitting') : t('request.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
