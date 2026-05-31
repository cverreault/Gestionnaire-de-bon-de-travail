/**
 * QA V5 — release-notes-v5.test.ts
 *
 * Validates ReleaseNotesPage.tsx static data and component logic:
 *  - VERSIONS array ordering (descending)
 *  - All entry types are valid (against EntryType union)
 *  - ENTRY_META covers every EntryType
 *  - No duplicate version numbers
 *  - Toggle expand/collapse helper correctness
 *  - Filter logic (filterVersion === 'all' → all versions)
 *  - Version v1.7.0 is the first entry (auto-expanded by default)
 *  - Badge border-override regression (BUG-01)
 *  - TechnicianNav icon duplicate detection (BUG-02)
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror of VERSIONS data structure ───────────────────────────────────────

type EntryType = 'new' | 'improvement' | 'fix' | 'infra' | 'security';

interface ReleaseEntry {
  type: EntryType;
  text: string;
}

interface ReleaseVersion {
  version: string;
  name: string;
  date: string;
  entries: ReleaseEntry[];
}

// ─── Mirror of ENTRY_META keys ────────────────────────────────────────────────

const ENTRY_TYPES: EntryType[] = ['new', 'improvement', 'fix', 'infra', 'security'];

// ─── Mirror of VERSIONS data from ReleaseNotesPage.tsx ───────────────────────

const VERSIONS: ReleaseVersion[] = [
  {
    version: '1.7.0',
    name: 'Profil et administration',
    date: 'Avril 2025',
    entries: [
      { type: 'improvement', text: 'Rôle DISPATCHER disponible dans les formulaires de création et d\'édition d\'utilisateur' },
      { type: 'new', text: 'Bouton "Réinitialiser le mot de passe" pour l\'administrateur avec validation de sécurité' },
      { type: 'new', text: 'Section Types de clients dans Paramètres (Résidentiel, Commercial, Industriel, Institutionnel)' },
      { type: 'new', text: 'Section Types d\'emplacement dans Paramètres (Bureau, Entrepôt, Résidence, Chantier)' },
      { type: 'new', text: 'Page Notes de version avec historique complet du développement du projet' },
    ],
  },
  {
    version: '1.6.0',
    name: 'Rôles et gestion avancée',
    date: 'Mars 2025',
    entries: [
      { type: 'new', text: 'Nouveau rôle DISPATCHER' },
      { type: 'new', text: 'Case à cocher "Masquer les BT complétés"' },
      { type: 'improvement', text: 'Endpoint dynamique des transitions' },
      { type: 'new', text: 'Sidebar techniciens avec Drag & Drop' },
      { type: 'new', text: 'Modal de confirmation dispatch' },
      { type: 'fix', text: 'Correction modale silencieuse' },
      { type: 'fix', text: 'Guard technicien ré-ouverture BT terminé' },
    ],
  },
  {
    version: '1.5.0',
    name: 'Calendrier interactif et assignation',
    date: 'Février 2025',
    entries: [
      { type: 'new', text: 'Clic zone vide calendrier' },
      { type: 'new', text: 'Drag & Drop calendrier' },
      { type: 'improvement', text: 'Réassignation automatique' },
      { type: 'new', text: 'Boutons liste BT' },
      { type: 'new', text: 'Bouton assigner client' },
      { type: 'fix', text: 'Correction priorité inversée' },
      { type: 'fix', text: 'Correction clic événement calendrier' },
    ],
  },
  {
    version: '1.4.0',
    name: 'Statut En Route et mode offline',
    date: 'Février 2025',
    entries: [
      { type: 'new', text: 'Nouveau statut EN_ROUTE' },
      { type: 'infra', text: 'Migration Prisma EN_ROUTE' },
      { type: 'improvement', text: 'Admin bypass transitions' },
      { type: 'improvement', text: 'Mode offline amélioré' },
      { type: 'improvement', text: 'Boutons transition dynamiques' },
    ],
  },
  {
    version: '1.3.0',
    name: 'Impression Letter et édition admin',
    date: 'Janvier 2025',
    entries: [
      { type: 'improvement', text: 'Template Letter' },
      { type: 'improvement', text: 'Marges réduites' },
      { type: 'new', text: 'Admin édite tous champs BT' },
      { type: 'new', text: 'Modal édition admin' },
    ],
  },
  {
    version: '1.2.0',
    name: 'Thème visuel',
    date: 'Janvier 2025',
    entries: [
      { type: 'new', text: 'Fichier thème centralisé' },
      { type: 'improvement', text: 'Fond gris-bleu uniforme' },
      { type: 'improvement', text: 'Bordures tables visibles' },
      { type: 'improvement', text: 'Lignes alternées' },
      { type: 'improvement', text: 'Cards bordures uniformes' },
      { type: 'improvement', text: 'Page connexion dégradé' },
      { type: 'improvement', text: 'Cards technicien bordure colorée' },
      { type: 'improvement', text: 'Modales uniformisées' },
      { type: 'improvement', text: 'Boutons tokenisés' },
      { type: 'improvement', text: '17 fichiers thème' },
    ],
  },
  {
    version: '1.1.0',
    name: 'Transitions de statut et filtres',
    date: 'Décembre 2024',
    entries: [
      { type: 'improvement', text: 'Transitions v2 admin' },
      { type: 'improvement', text: 'Admin ré-ouvre BT négatif' },
      { type: 'improvement', text: 'Technicien transitions' },
      { type: 'new', text: 'Filtres avancés BT' },
      { type: 'new', text: 'Badge compteur filtres' },
      { type: 'new', text: 'Template impression A4' },
      { type: 'fix', text: 'Correction calendrier données API' },
    ],
  },
  {
    version: '1.0.0',
    name: 'Fondation — Sprint initial',
    date: 'Novembre 2024',
    entries: [
      { type: 'infra', text: 'Scaffolding' },
      { type: 'new', text: 'Auth JWT' },
      { type: 'new', text: 'Gestion utilisateurs' },
      { type: 'new', text: 'CRUD clients' },
      { type: 'new', text: 'CRUD BT' },
      { type: 'new', text: 'Module pièces jointes' },
      { type: 'new', text: 'Calendrier' },
      { type: 'new', text: 'Dashboard' },
      { type: 'new', text: 'Interface mobile PWA' },
      { type: 'new', text: 'Mode offline basique' },
      { type: 'infra', text: 'Docker Compose ports non-standard' },
      { type: 'infra', text: 'Nginx reverse proxy' },
    ],
  },
];

// ─── Semver comparison helper ─────────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] {
  const parts = v.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function semverGt(a: string, b: string): boolean {
  const [ma, mi, pa] = parseSemver(a);
  const [mb, mi2, pb] = parseSemver(b);
  if (ma !== mb) return ma > mb;
  if (mi !== mi2) return mi > mi2;
  return pa > pb;
}

// ─── Tests: ordering ──────────────────────────────────────────────────────────

describe('VERSIONS — descending ordering', () => {
  it('has at least one version', () => {
    expect(VERSIONS.length).toBeGreaterThan(0);
  });

  it('first version is the most recent (v1.7.0)', () => {
    expect(VERSIONS[0].version).toBe('1.7.0');
  });

  it('last version is the oldest (v1.0.0)', () => {
    expect(VERSIONS[VERSIONS.length - 1].version).toBe('1.0.0');
  });

  it('versions are in strictly descending semver order', () => {
    for (let i = 0; i < VERSIONS.length - 1; i++) {
      const current = VERSIONS[i].version;
      const next = VERSIONS[i + 1].version;
      expect(
        semverGt(current, next),
        `Expected ${current} > ${next} at index ${i}`,
      ).toBe(true);
    }
  });

  it('has no duplicate version numbers', () => {
    const versions = VERSIONS.map((v) => v.version);
    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
  });
});

// ─── Tests: entry types ───────────────────────────────────────────────────────

describe('VERSIONS — entry type validity', () => {
  it('all entry types are valid EntryType values', () => {
    const validTypes = new Set<string>(ENTRY_TYPES);
    for (const v of VERSIONS) {
      for (const e of v.entries) {
        expect(validTypes.has(e.type), `Invalid type "${e.type}" in v${v.version}`).toBe(true);
      }
    }
  });

  it('every version has at least one entry', () => {
    for (const v of VERSIONS) {
      expect(v.entries.length, `v${v.version} has no entries`).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty text', () => {
    for (const v of VERSIONS) {
      for (const e of v.entries) {
        expect(e.text.trim().length, `Empty text in v${v.version} (type ${e.type})`).toBeGreaterThan(0);
      }
    }
  });

  it('v1.7.0 mentions Release Notes feature (new feature entry)', () => {
    const v170 = VERSIONS.find((v) => v.version === '1.7.0')!;
    const rnEntry = v170.entries.find(
      (e) => e.type === 'new' && e.text.toLowerCase().includes('notes de version'),
    );
    expect(rnEntry).toBeDefined();
  });

  it('v1.7.0 mentions dynamic client types and address types (new entries)', () => {
    const v170 = VERSIONS.find((v) => v.version === '1.7.0')!;
    const hasClientTypes = v170.entries.some(
      (e) => e.type === 'new' && e.text.toLowerCase().includes('types de clients'),
    );
    const hasAddressTypes = v170.entries.some(
      (e) => e.type === 'new' && e.text.toLowerCase().includes("types d'emplacement"),
    );
    expect(hasClientTypes).toBe(true);
    expect(hasAddressTypes).toBe(true);
  });
});

// ─── Tests: ENTRY_META coverage ──────────────────────────────────────────────

describe('ENTRY_META — covers all EntryType values', () => {
  const ENTRY_META: Record<EntryType, { label: string; icon: string }> = {
    new:         { label: 'Nouvelle fonctionnalité', icon: '✨' },
    improvement: { label: 'Amélioration',            icon: '🔧' },
    fix:         { label: 'Correction',              icon: '🐛' },
    infra:       { label: 'Infrastructure',          icon: '⚙️' },
    security:    { label: 'Sécurité',                icon: '🔒' },
  };

  it.each(ENTRY_TYPES)('ENTRY_META has key "%s"', (type) => {
    expect(ENTRY_META[type]).toBeDefined();
  });

  it.each(ENTRY_TYPES)('ENTRY_META["%s"].label is a non-empty string', (type) => {
    expect(ENTRY_META[type].label.trim().length).toBeGreaterThan(0);
  });

  it.each(ENTRY_TYPES)('ENTRY_META["%s"].icon is a non-empty string', (type) => {
    expect(ENTRY_META[type].icon.trim().length).toBeGreaterThan(0);
  });

  it('all badge variant keys are distinct (no two types share a label)', () => {
    const labels = Object.values(ENTRY_META).map((m) => m.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});

// ─── Tests: toggle collapse/expand logic ─────────────────────────────────────

describe('Toggle expand/collapse logic (mirrors component state)', () => {
  /** Simulates the Set-based open/close state */
  function toggleVersion(prev: Set<string>, version: string): Set<string> {
    const next = new Set(prev);
    if (next.has(version)) next.delete(version);
    else next.add(version);
    return next;
  }

  it('initially only the first version is open', () => {
    const initial = new Set<string>([VERSIONS[0].version]);
    expect(initial.has('1.7.0')).toBe(true);
    expect(initial.size).toBe(1);
  });

  it('toggleVersion opens a closed version', () => {
    const state = new Set<string>(['1.7.0']);
    const next = toggleVersion(state, '1.6.0');
    expect(next.has('1.6.0')).toBe(true);
    expect(next.has('1.7.0')).toBe(true);
  });

  it('toggleVersion closes an open version', () => {
    const state = new Set<string>(['1.7.0', '1.6.0']);
    const next = toggleVersion(state, '1.7.0');
    expect(next.has('1.7.0')).toBe(false);
    expect(next.has('1.6.0')).toBe(true);
  });

  it('expandAll opens every version', () => {
    const allOpen = new Set(VERSIONS.map((v) => v.version));
    expect(allOpen.size).toBe(VERSIONS.length);
    for (const v of VERSIONS) {
      expect(allOpen.has(v.version)).toBe(true);
    }
  });

  it('collapseAll results in an empty set', () => {
    const allClosed = new Set<string>();
    expect(allClosed.size).toBe(0);
  });
});

// ─── Tests: filter logic ──────────────────────────────────────────────────────

describe('Version filter logic', () => {
  function applyFilter(versions: ReleaseVersion[], filter: string): ReleaseVersion[] {
    if (filter === 'all') return versions;
    return versions.filter((v) => v.version === filter);
  }

  it('filter "all" returns all versions', () => {
    const result = applyFilter(VERSIONS, 'all');
    expect(result.length).toBe(VERSIONS.length);
  });

  it('filter "1.7.0" returns exactly one version', () => {
    const result = applyFilter(VERSIONS, '1.7.0');
    expect(result.length).toBe(1);
    expect(result[0].version).toBe('1.7.0');
  });

  it('filter for unknown version returns empty array', () => {
    const result = applyFilter(VERSIONS, '99.99.99');
    expect(result.length).toBe(0);
  });

  it('each version can be individually selected', () => {
    for (const v of VERSIONS) {
      const result = applyFilter(VERSIONS, v.version);
      expect(result.length).toBe(1);
      expect(result[0].version).toBe(v.version);
    }
  });
});

// ─── Tests: totalCounts computation ──────────────────────────────────────────

describe('Total entry counts computation', () => {
  function computeTotalCounts(versions: ReleaseVersion[]): Partial<Record<EntryType, number>> {
    const c: Partial<Record<EntryType, number>> = {};
    for (const v of versions) {
      for (const e of v.entries) {
        c[e.type] = (c[e.type] ?? 0) + 1;
      }
    }
    return c;
  }

  const counts = computeTotalCounts(VERSIONS);

  it('total entry count equals sum of all version entry lengths', () => {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    const expected = VERSIONS.reduce((s, v) => s + v.entries.length, 0);
    expect(total).toBe(expected);
  });

  it('has at least one "new" entry across all versions', () => {
    expect((counts.new ?? 0)).toBeGreaterThan(0);
  });

  it('has at least one "improvement" entry across all versions', () => {
    expect((counts.improvement ?? 0)).toBeGreaterThan(0);
  });

  it('has at least one "fix" entry across all versions', () => {
    expect((counts.fix ?? 0)).toBeGreaterThan(0);
  });

  it('has at least one "infra" entry across all versions', () => {
    expect((counts.infra ?? 0)).toBeGreaterThan(0);
  });
});

// ─── BUG-01 Regression: border vs borderBottom in button style ────────────────

describe('BUG-01 — borderBottom overridden by border: none in version card header', () => {
  /**
   * In ReleaseNotesPage.tsx, the accordion button style object sets:
   *   borderBottom: isOpen ? theme.borders.default : 'none',  // line 392
   *   border: 'none',                                          // line 394
   *
   * When React applies these as DOM style properties in insertion order,
   * element.style.border = 'none' is applied AFTER element.style.borderBottom,
   * effectively resetting the bottom border and making it invisible when expanded.
   *
   * This test documents the expected correct order: border shorthand must come
   * BEFORE borderBottom override to let borderBottom win.
   */
  it('style object: borderBottom set after border shorthand should win (CSS specificity)', () => {
    // Correct order: border first, then borderBottom override
    const correctStyle = {
      border: 'none',
      borderBottom: '1px solid #cbd5e1',
    };
    // Incorrect order (as in current implementation):
    const buggyStyle = {
      borderBottom: '1px solid #cbd5e1',
      border: 'none',
    };

    // With correct order, the last-defined property in source governs.
    // borderBottom appears after border → borderBottom value is '1px solid #cbd5e1'
    const correctKeys = Object.keys(correctStyle);
    expect(correctKeys.indexOf('borderBottom')).toBeGreaterThan(correctKeys.indexOf('border'));

    // With buggy order, border appears after borderBottom → border resets it
    const buggyKeys = Object.keys(buggyStyle);
    expect(buggyKeys.indexOf('border')).toBeGreaterThan(buggyKeys.indexOf('borderBottom'));
    // This demonstrates the bug: in buggyStyle, 'border' comes last and would override
    expect(buggyStyle.border).toBe('none');
    expect(buggyStyle.borderBottom).toBe('1px solid #cbd5e1');
    // The bug: DOM will apply border='none' LAST, removing the bottom border
  });

  it('expected fix: borderBottom must be declared AFTER border in the style object', () => {
    // The fix: declare border first, borderBottom last
    const fixedStyle: Record<string, string> = {};
    fixedStyle['border'] = 'none';
    fixedStyle['borderBottom'] = '1px solid #cbd5e1';
    const keys = Object.keys(fixedStyle);
    expect(keys[keys.length - 1]).toBe('borderBottom');
  });
});

// ─── BUG-02 Regression: duplicate icons in TechnicianNav ─────────────────────

describe('BUG-02 — Duplicate 📋 icon in TechnicianNav for Mes BT and Notes de version', () => {
  /**
   * TechnicianNav.tsx uses 📋 for both "Mes BT" (line 39) and "Notes de version" (line 51).
   * This causes visual ambiguity in the bottom navigation bar.
   * The nav items should each have a unique icon.
   */
  const navItems = [
    { to: '/mes-bons',      label: 'Mes BT',    icon: '📋' },
    { to: '/profil',        label: 'Mon profil', icon: '🙍' },
    { to: '/release-notes', label: 'Notes',      icon: '📋' }, // BUG: same as Mes BT
  ];

  it('should have unique icons across all nav items (currently FAILS — documents BUG-02)', () => {
    const icons = navItems.map((n) => n.icon);
    const uniqueIcons = new Set(icons);
    // This assertion FAILS with the current implementation — it documents the bug.
    // Expected fix: change /release-notes icon to e.g. 📝 or 🗒️
    expect(uniqueIcons.size).toBe(icons.length); // Will FAIL: 2 items share 📋
  });

  it('Mes BT and Notes de version do not share the same icon', () => {
    const mesBTItem = navItems.find((n) => n.to === '/mes-bons')!;
    const notesItem = navItems.find((n) => n.to === '/release-notes')!;
    // Documents the bug — currently these ARE equal
    expect(mesBTItem.icon).not.toBe(notesItem.icon); // Will FAIL with current code
  });
});
