import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAllAddresses } from '../hooks/useClients';
import { useAddressTypes } from '../hooks/useSettings';
import { AddressType, ClientType } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressCreateModal from '../components/AddressCreateModal';
import CsvImportExportPanel from '../components/CsvImportExportPanel';
import {
  downloadAddressTemplate,
  exportAddressesCsv,
  importAddressesCsv,
} from '../services/clients-csv.service';
import {
  theme,
  buttonStyles,
  tableStyles,
  formStyles,
  layoutStyles,
  getRowStyle,
} from '../theme';
import { formatStreet } from '../utils/addressFormat';

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  [AddressType.OFFICE]: 'Bureau',
  [AddressType.WAREHOUSE]: 'Entrepôt',
  [AddressType.RESIDENCE]: 'Résidence',
  [AddressType.WORKSITE]: 'Chantier',
};

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  [ClientType.RESIDENTIAL]: 'Résidentiel',
  [ClientType.COMMERCIAL]: 'Commercial',
  [ClientType.INDUSTRIAL]: 'Industriel',
  [ClientType.INSTITUTIONAL]: 'Institutionnel',
};

const CLIENT_TYPE_COLORS: Record<ClientType, { bg: string; color: string }> = {
  [ClientType.RESIDENTIAL]: { bg: '#dbeafe', color: '#1e40af' },
  [ClientType.COMMERCIAL]: { bg: '#ede9fe', color: '#6d28d9' },
  [ClientType.INDUSTRIAL]: { bg: '#ffedd5', color: '#c2410c' },
  [ClientType.INSTITUTIONAL]: { bg: '#dcfce7', color: '#15803d' },
};

export default function AddressesPage() {
  const { t } = useTranslation('addresses');
  const { t: tClients } = useTranslation('clients');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<
    import('../types').ClientAddressWithClient | null
  >(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: addresses = [], isLoading, isError } = useAllAddresses(debouncedSearch || undefined);
  const { data: addressTypeConfigs = [] } = useAddressTypes(true);
  // Server-side search returns the filtered list directly; we keep the variable
  // name `filtered` for minimal diff with the existing render block.
  const filtered = addresses;

  /** Resolve the predominant field value for an address (if its AddressType has one). */
  function getPredominantDisplay(addr: typeof addresses[number]): { label: string; value: string } | null {
    const config = addressTypeConfigs.find((c) => c.code === addr.addressType);
    if (!config || !config.predominantFieldId || !config.fields) return null;
    const field = config.fields.find((f) => f.id === config.predominantFieldId);
    if (!field) return null;
    const td = addr.typeData ?? {};
    const raw = (td as Record<string, unknown>)[field.id];
    if (raw === null || raw === undefined || raw === '') return null;
    return { label: field.label, value: String(raw) };
  }

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* Header */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle }}>{t('title')}</h1>
          {addresses.length > 0 && (
            <p style={{ ...layoutStyles.pageSubtitle }}>
              {addresses.length} {addresses.length > 1 ? t('title').toLowerCase() : t('titleSingular').toLowerCase()}
              {debouncedSearch && ` (${t('filtered', { defaultValue: 'filtré' })})`}
            </p>
          )}
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{ ...buttonStyles.primary }}>
          {t('create')}
        </button>
      </div>

      {/* CSV import / export — ADMIN only */}
      <CsvImportExportPanel
        title={t('csv:addresses.title', 'Import / export addresses')}
        helpText={t('csv:addresses.help')}
        onDownloadTemplate={downloadAddressTemplate}
        onExport={exportAddressesCsv}
        onImport={importAddressesCsv}
        invalidateKeys={[['clients'], ['addresses']]}
      />

      {/* Filters */}
      <div style={{ ...layoutStyles.filterBar }}>
        <input
          style={{ ...formStyles.input, maxWidth: '360px' }}
          placeholder={t('messages.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {showCreateModal && (
        <AddressCreateModal onClose={() => setShowCreateModal(false)} />
      )}

      {editingAddress && (
        <AddressCreateModal
          address={editingAddress}
          onClose={() => setEditingAddress(null)}
        />
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <div style={{ color: theme.colors.danger, padding: '1rem' }}>
          {t('messages.loadError', { defaultValue: 'Erreur lors du chargement des adresses.' })}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...layoutStyles.emptyState, background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.lg }}>
          <span style={{ fontSize: '2.5rem' }}>📍</span>
          <p style={{ margin: 0 }}>
            {addresses.length === 0 ? t('messages.empty') : t('messages.noMatch')}
          </p>
        </div>
      ) : (
        <div style={{ ...tableStyles.container, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
            <thead style={{ ...tableStyles.header }}>
              <tr>
                {[t('titleSingular'), t('fields.addressType'), tClients('titleSingular'), tClients('fields.clientType')].map((h) => (
                  <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, idx) => {
                const cc = a.client ? CLIENT_TYPE_COLORS[a.client.clientType] : null;
                return (
                  <tr
                    key={a.id}
                    style={{ ...getRowStyle(idx, hoveredRow === idx), cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredRow(idx)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => setEditingAddress(a)}
                  >
                    <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
                      {(() => {
                        const pre = getPredominantDisplay(a);
                        if (pre) {
                          return (
                            <>
                              <div style={{ fontSize: theme.font.sizeMd, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
                                {pre.label}&nbsp;: {pre.value}
                                {a.isDefault && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, background: theme.colors.primaryLight, color: theme.colors.primary, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full }}>
                                    Défaut
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
                                {formatStreet(a)}{a.apartment ? ` app. ${a.apartment}` : ''}, {a.city} {a.postalCode}
                                {a.label && ` · ${a.label}`}
                              </div>
                            </>
                          );
                        }
                        return (
                          <>
                            <div>
                              {formatStreet(a)}{a.apartment ? ` app. ${a.apartment}` : ''}
                              {a.isDefault && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, background: theme.colors.primaryLight, color: theme.colors.primary, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full }}>
                                  Défaut
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem', fontWeight: theme.font.weightNormal }}>
                              {a.city} {a.postalCode}{a.province ? ` · ${a.province}` : ''}
                              {a.label && ` · ${a.label}`}
                            </div>
                          </>
                        );
                      })()}
                    </td>
                    <td style={{ ...tableStyles.cellMuted }}>
                      {ADDRESS_TYPE_LABELS[a.addressType] ?? a.addressType}
                    </td>
                    <td style={{ ...tableStyles.cell }}>
                      {a.client ? (
                        <>
                          <Link
                            to={`/clients?focus=${a.client.id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: theme.colors.primary, textDecoration: 'none', fontWeight: theme.font.weightSemibold }}
                          >
                            {a.client.firstName} {a.client.lastName}
                          </Link>
                          {a.client.email && (
                            <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
                              {a.client.email}
                            </div>
                          )}
                          {!a.client.isActive && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', background: theme.colors.dangerLight, color: theme.colors.danger, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, fontWeight: theme.font.weightSemibold }}>
                              {tClients('messages.inactive', { defaultValue: 'Inactif' })}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontStyle: 'italic' }}>
                          {t('messages.noClient')}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tableStyles.cell }}>
                      {a.client && cc ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.15rem 0.6rem',
                          borderRadius: theme.radius.full,
                          fontSize: theme.font.sizeXs,
                          fontWeight: theme.font.weightSemibold,
                          background: cc.bg,
                          color: cc.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {CLIENT_TYPE_LABELS[a.client.clientType]}
                        </span>
                      ) : (
                        <span style={{ color: theme.colors.textLight }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
