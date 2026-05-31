import type { CSSProperties } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE DE COULEURS PROFESSIONNELLE
// Bleu foncé + gris contrasté — cohérent avec la sidebar #1e293b
// ─────────────────────────────────────────────────────────────────────────────
// Colors resolve at CSS-eval time via CSS custom properties declared in
// index.css. The theme picker just flips `data-theme="dark"` on <html> and
// the same `theme.colors.primary` token resolves to its dark-mode value.
export const theme = {
  colors: {
    // Primaires
    primary:       'var(--c-primary)',
    primaryHover:  'var(--c-primaryHover)',
    primaryLight:  'var(--c-primaryLight)',

    // Fond
    background:  'var(--c-background)',
    surface:     'var(--c-surface)',
    surfaceAlt:  'var(--c-surfaceAlt)',

    // Bordures
    border:      'var(--c-border)',
    borderLight: 'var(--c-borderLight)',
    borderDark:  'var(--c-borderDark)',

    // Texte
    text:           'var(--c-text)',
    textSecondary:  'var(--c-textSecondary)',
    textMuted:      'var(--c-textMuted)',
    textLight:      'var(--c-textLight)',

    // Statuts
    success:      'var(--c-success)',
    successLight: 'var(--c-successLight)',
    warning:      'var(--c-warning)',
    warningLight: 'var(--c-warningLight)',
    danger:       'var(--c-danger)',
    dangerLight:  'var(--c-dangerLight)',
    info:         'var(--c-info)',
    infoLight:    'var(--c-infoLight)',

    // Sidebar
    sidebarBg:     'var(--c-sidebarBg)',
    sidebarText:   'var(--c-sidebarText)',
    sidebarActive: 'var(--c-sidebarActive)',
    sidebarHover:  'var(--c-sidebarHover)',
    sidebarBorder: 'var(--c-sidebarBorder)',

    // Interactivité
    rowHover:    'var(--c-rowHover)',
    focusRing:   'var(--c-focusRing)',
  },

  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
    md: '0 4px 6px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
    lg: '0 10px 15px rgba(0,0,0,0.10), 0 4px 6px rgba(0,0,0,0.05)',
    xl: '0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04)',
  },

  borders: {
    default: '1px solid var(--c-border)',
    light:   '1px solid var(--c-borderLight)',
    dark:    '1px solid var(--c-borderDark)',
    focus:   '1px solid var(--c-primary)',
  },

  radius: {
    sm:   '0.375rem',  // 6px
    md:   '0.5rem',    // 8px
    lg:   '0.75rem',   // 12px
    xl:   '1rem',      // 16px
    full: '9999px',
  },

  spacing: {
    xs:  '0.25rem',   // 4px
    sm:  '0.5rem',    // 8px
    md:  '1rem',      // 16px
    lg:  '1.5rem',    // 24px
    xl:  '2rem',      // 32px
    '2xl': '3rem',    // 48px
  },

  font: {
    sizeXs:  '0.75rem',
    sizeSm:  '0.875rem',
    sizeMd:  '1rem',
    sizeLg:  '1.125rem',
    sizeXl:  '1.25rem',
    size2xl: '1.5rem',
    size3xl: '1.875rem',
    weightNormal:   400,
    weightMedium:   500,
    weightSemibold: 600,
    weightBold:     700,
  },

  zIndex: {
    dropdown: 100,
    sticky:   200,
    overlay:  300,
    modal:    400,
    toast:    500,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — TABLES
// ─────────────────────────────────────────────────────────────────────────────
export const tableStyles: Record<string, CSSProperties> = {
  /** Conteneur de table : bordure visible + ombre pour profondeur */
  container: {
    border: theme.borders.default,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    boxShadow: theme.shadows.sm,
    background: theme.colors.surface,
  },

  /** En-tête de table : fond gris-bleu + bordure basse épaisse */
  header: {
    background: theme.colors.borderLight,
    borderBottom: `2px solid ${theme.colors.border}`,
  },

  /** Cellule d'en-tête */
  headerCell: {
    padding: '0.75rem 1rem',
    fontWeight: theme.font.weightSemibold,
    fontSize: theme.font.sizeXs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.colors.textSecondary,
    whiteSpace: 'nowrap',
  },

  /** Ligne standard : bordure basse bien visible */
  row: {
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    transition: 'background 0.15s ease',
  },

  /** Ligne alternée (index pair) */
  rowAlt: {
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    background: theme.colors.surfaceAlt,
    transition: 'background 0.15s ease',
  },

  /** Ligne au survol */
  rowHover: {
    background: theme.colors.rowHover,
  },

  /** Dernière ligne : pas de bordure basse */
  rowLast: {
    borderBottom: 'none',
  },

  /** Cellule standard */
  cell: {
    padding: '0.75rem 1rem',
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
    verticalAlign: 'middle',
  },

  /** Cellule muted (données secondaires) */
  cellMuted: {
    padding: '0.75rem 1rem',
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    verticalAlign: 'middle',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — CARDS
// ─────────────────────────────────────────────────────────────────────────────
export const cardStyles: Record<string, CSSProperties> = {
  /** Card principale : fond blanc, bordure visible, ombre */
  card: {
    background: theme.colors.surface,
    border: theme.borders.default,
    borderRadius: theme.radius.lg,
    boxShadow: theme.shadows.sm,
    overflow: 'hidden',
  },

  /** En-tête de card : fond gris-bleu clair + bordure basse */
  cardHeader: {
    background: theme.colors.background,
    borderBottom: theme.borders.default,
    padding: '1rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /** Titre dans cardHeader */
  cardTitle: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightSemibold,
    color: theme.colors.text,
    margin: 0,
  },

  /** Corps de card */
  cardBody: {
    padding: '1.25rem',
  },

  /** Pied de card */
  cardFooter: {
    background: theme.colors.surfaceAlt,
    borderTop: theme.borders.default,
    padding: '0.875rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — FORMULAIRES
// ─────────────────────────────────────────────────────────────────────────────
export const formStyles: Record<string, CSSProperties> = {
  /** Label de champ */
  label: {
    display: 'block',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    color: theme.colors.text,
    marginBottom: '0.375rem',
  },

  /** Label requis (à compléter avec le ::after *) */
  labelRequired: {
    display: 'block',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    color: theme.colors.text,
    marginBottom: '0.375rem',
  },

  /** Input texte */
  input: {
    display: 'block',
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
    background: theme.colors.surface,
    border: theme.borders.default,
    borderRadius: theme.radius.md,
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },

  /** Input focus (appliquer via onFocus/onBlur handlers) */
  inputFocus: {
    borderColor: theme.colors.primary,
    boxShadow: `0 0 0 3px ${theme.colors.focusRing}40`,
  },

  /** Input désactivé */
  inputDisabled: {
    display: 'block',
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceAlt,
    border: theme.borders.light,
    borderRadius: theme.radius.md,
    cursor: 'not-allowed',
    opacity: 0.7,
  },

  /** Select */
  select: {
    display: 'block',
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
    background: theme.colors.surface,
    border: theme.borders.default,
    borderRadius: theme.radius.md,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'auto' as CSSProperties['appearance'],
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },

  /** Textarea */
  textarea: {
    display: 'block',
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
    background: theme.colors.surface,
    border: theme.borders.default,
    borderRadius: theme.radius.md,
    outline: 'none',
    resize: 'vertical' as CSSProperties['resize'],
    minHeight: '5rem',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },

  /** Groupe de champ (espacement vertical) */
  fieldGroup: {
    marginBottom: '1rem',
  },

  /** Grille de champs 2 colonnes */
  fieldGrid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },

  /** Grille de champs 3 colonnes */
  fieldGrid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '1rem',
  },

  /** Message d'erreur de champ */
  fieldError: {
    fontSize: theme.font.sizeXs,
    color: theme.colors.danger,
    marginTop: '0.25rem',
  },

  /** Message d'aide de champ */
  fieldHint: {
    fontSize: theme.font.sizeXs,
    color: theme.colors.textMuted,
    marginTop: '0.25rem',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — BOUTONS
// ─────────────────────────────────────────────────────────────────────────────
export const buttonStyles: Record<string, CSSProperties> = {
  /** Base commune à tous les boutons */
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.5rem 1rem',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    borderRadius: theme.radius.md,
    border: '1px solid transparent',
    cursor: 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
    lineHeight: 1.5,
  },

  /** Bouton principal bleu */
  primary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.5rem 1rem',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    borderRadius: theme.radius.md,
    border: '1px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
    lineHeight: 1.5,
    background: theme.colors.primary,
    color: '#ffffff',
    boxShadow: theme.shadows.sm,
  },

  /** Bouton principal au survol */
  primaryHover: {
    background: theme.colors.primaryHover,
    boxShadow: theme.shadows.md,
  },

  /** Bouton secondaire (outline) */
  secondary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.5rem 1rem',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease, border-color 0.15s ease',
    outline: 'none',
    lineHeight: 1.5,
    background: theme.colors.surface,
    color: theme.colors.text,
    border: theme.borders.default,
  },

  /** Bouton secondaire au survol */
  secondaryHover: {
    background: theme.colors.background,
    borderColor: theme.colors.borderDark,
  },

  /** Bouton danger / destructif */
  danger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.5rem 1rem',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    borderRadius: theme.radius.md,
    border: '1px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
    lineHeight: 1.5,
    background: theme.colors.danger,
    color: '#ffffff',
    boxShadow: theme.shadows.sm,
  },

  /** Bouton danger au survol */
  dangerHover: {
    background: 'var(--c-dangerHover)',
  },

  /** Bouton ghost (transparent) */
  ghost: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.5rem 1rem',
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightMedium,
    borderRadius: theme.radius.md,
    border: '1px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease',
    outline: 'none',
    lineHeight: 1.5,
    background: 'transparent',
    color: theme.colors.textSecondary,
  },

  /** Bouton ghost au survol */
  ghostHover: {
    background: theme.colors.background,
    color: theme.colors.text,
  },

  /** Bouton petit */
  sm: {
    padding: '0.25rem 0.625rem',
    fontSize: theme.font.sizeXs,
  },

  /** Bouton grand */
  lg: {
    padding: '0.625rem 1.25rem',
    fontSize: theme.font.sizeMd,
  },

  /** Bouton désactivé */
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    pointerEvents: 'none' as CSSProperties['pointerEvents'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — MODALS
// ─────────────────────────────────────────────────────────────────────────────
export const modalStyles: Record<string, CSSProperties> = {
  /** Overlay sombre */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: theme.zIndex.overlay,
    padding: '1rem',
  },

  /** Fenêtre modale */
  content: {
    background: theme.colors.surface,
    border: theme.borders.default,
    borderRadius: theme.radius.lg,
    boxShadow: theme.shadows.xl,
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: theme.zIndex.modal,
  },

  /** En-tête de modale */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.125rem 1.5rem',
    borderBottom: theme.borders.default,
    background: theme.colors.surfaceAlt,
    flexShrink: 0,
  },

  /** Titre en-tête modale */
  headerTitle: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightSemibold,
    color: theme.colors.text,
    margin: 0,
  },

  /** Corps de modale */
  body: {
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1,
  },

  /** Pied de modale */
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    borderTop: theme.borders.default,
    background: theme.colors.surfaceAlt,
    flexShrink: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — BADGES / PILLS
// ─────────────────────────────────────────────────────────────────────────────
export const badgeStyles: Record<string, CSSProperties> = {
  /** Base commune */
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.125rem 0.625rem',
    borderRadius: theme.radius.full,
    fontSize: theme.font.sizeXs,
    fontWeight: theme.font.weightMedium,
    whiteSpace: 'nowrap',
    border: '1px solid transparent',
  },

  /** Badge succès */
  success: {
    background: theme.colors.successLight,
    color: 'var(--c-successBadgeText)',
    border: '1px solid var(--c-successBadgeBorder)',
  },

  /** Badge avertissement */
  warning: {
    background: theme.colors.warningLight,
    color: 'var(--c-warningBadgeText)',
    border: '1px solid var(--c-warningBadgeBorder)',
  },

  /** Badge danger */
  danger: {
    background: theme.colors.dangerLight,
    color: 'var(--c-dangerBadgeText)',
    border: '1px solid var(--c-dangerBadgeBorder)',
  },

  /** Badge info */
  info: {
    background: theme.colors.infoLight,
    color: 'var(--c-infoBadgeText)',
    border: '1px solid var(--c-infoBadgeBorder)',
  },

  /** Badge neutre */
  neutral: {
    background: theme.colors.background,
    color: theme.colors.textSecondary,
    border: theme.borders.light,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RÉUTILISABLES — LAYOUT / PAGES
// ─────────────────────────────────────────────────────────────────────────────
export const layoutStyles: Record<string, CSSProperties> = {
  /** Zone de contenu principale */
  page: {
    padding: '1.5rem',
    background: theme.colors.background,
    minHeight: '100%',
    flex: 1,
  },

  /** En-tête de page (titre + actions) */
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
    flexWrap: 'wrap' as CSSProperties['flexWrap'],
    gap: '0.75rem',
  },

  /** Titre de page (h1) */
  pageTitle: {
    fontSize: theme.font.size2xl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    margin: 0,
    lineHeight: 1.25,
  },

  /** Sous-titre de page */
  pageSubtitle: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    marginTop: '0.25rem',
  },

  /** Barre de filtres / recherche */
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.25rem',
    flexWrap: 'wrap' as CSSProperties['flexWrap'],
  },

  /** Séparateur horizontal */
  divider: {
    height: '1px',
    background: theme.colors.borderLight,
    margin: '1.25rem 0',
    border: 'none',
  },

  /** Grille de cards 2 colonnes */
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.25rem',
  },

  /** Grille de cards 3 colonnes */
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1.25rem',
  },

  /** Grille de cards 4 colonnes */
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1.25rem',
  },

  /** État vide (aucun résultat) */
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as CSSProperties['flexDirection'],
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem 1.5rem',
    color: theme.colors.textMuted,
    fontSize: theme.font.sizeSm,
    gap: '0.75rem',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — FONCTIONS UTILITAIRES DE STYLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le style combiné d'une cellule de tableau selon son index de ligne.
 * Utilisation : style={getRowStyle(index)}
 */
export function getRowStyle(
  index: number,
  isHovered = false,
): CSSProperties {
  const base = index % 2 === 0 ? tableStyles.row : tableStyles.rowAlt;
  if (isHovered) return { ...base, ...tableStyles.rowHover };
  return base;
}

/**
 * Retourne le style d'un badge selon le statut passé en paramètre.
 * Utilisation : style={getStatusBadgeStyle('success')}
 */
export function getStatusBadgeStyle(
  status: 'success' | 'warning' | 'danger' | 'info' | 'neutral',
): CSSProperties {
  return { ...badgeStyles.base, ...badgeStyles[status] };
}

/**
 * Retourne les styles inline d'un input avec gestion du focus.
 * Utilisation : spread {...getInputStyle(focused)}
 */
export function getInputStyle(focused = false): CSSProperties {
  if (focused) return { ...formStyles.input, ...formStyles.inputFocus };
  return { ...formStyles.input };
}
