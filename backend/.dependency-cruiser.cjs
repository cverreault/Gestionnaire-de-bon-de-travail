/**
 * dependency-cruiser config — enforces ADR-001 (Modular Monolith).
 *
 * Règle principale : aucun module métier ne peut importer directement
 * depuis un autre module métier. Toute communication passe par les
 * contrats partagés dans `src/common/contracts/`.
 *
 * Lancer :  npx depcruise src --config .dependency-cruiser.cjs
 * Ou via npm script :  npm run arch:check
 */
module.exports = {
  forbidden: [
    // ── Règle 1 : pas d'import croisé entre modules métier ────────────
    // Exception : process-engine emit work-orders domain events (ADR-001
    // accepte cette exception car les events sont par nature publics).
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment:
        "Un module métier ne peut pas importer depuis un autre module métier. " +
        "Toute communication passe par les events (EventEmitter2) ou les contrats " +
        "partagés dans src/common/contracts/. Voir ADR-001 §3.",
      from: {
        path: '^src/modules/([^/]+)/',
      },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: [
          // Same module is fine
          '^src/modules/$1/',

          // ─── Exceptions documentées ───────────────────────────────────
          // Ces couplages existaient AVANT la mise en place de cette règle.
          // Chacun a une justification ou une dette à payer (suivie en TODO).

          // process-engine emit des events de work-orders pour les publier.
          // Acceptable : events = contrats publics (cf. ADR-001 §3a).
          '^src/modules/work-orders/domain/events/',

          // process-engine consomme le include shape des work-orders.
          // Dette : à déplacer dans common/ (TODO refacto).
          '^src/modules/work-orders/work-order-includes',

          // templates.service exporte un helper RBAC utilisé par
          // work-orders. Dette : à déplacer dans common/ (TODO refacto).
          '^src/modules/templates/templates\\.service',

          // work-orders + settings utilisent le moteur de processus
          // (process-engine + process-cache). Dette : le moteur de processus
          // est un service partagé, à déplacer hors d'un "module" ou à
          // ré-exposer via interface dans common/. TODO refacto.
          '^src/modules/process/process-engine\\.service',
          '^src/modules/process/process-cache\\.service',
          '^src/modules/process/process\\.module',

          // backup orchestre la sauvegarde, doit toucher MinIO et attachments
          // pour le full dump. Dette : créer un IBackupContributor dans
          // common/ que chaque module implémente. TODO refacto.
          '^src/modules/attachments/minio\\.service',
          '^src/modules/attachments/attachments\\.module',

          // auth retourne un UserResponseDto à la connexion. Acceptable :
          // DTOs publics font partie du contrat du module users.
          '^src/modules/users/dto/',
        ],
      },
    },

    // ── Règle 2 : pas de cycle ────────────────────────────────────────
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Un cycle de dépendances rend le code impossible à raisonner et ' +
        'casse souvent les tests. Brisez-le via une interface ou un event.',
      from: {},
      to: {
        circular: true,
      },
    },

    // ── Règle 3 : domain layer ne dépend pas d'infrastructure ─────────
    {
      name: 'domain-purity',
      severity: 'warn',
      comment:
        "La couche domain/ d'un module ne doit dépendre ni de @nestjs/* " +
        "ni de Prisma directement (sauf types). Sinon la testabilité unitaire " +
        "souffre. Voir ADR-001 §2.",
      from: {
        path: '^src/modules/[^/]+/domain/',
      },
      to: {
        path: ['^node_modules/@nestjs/', '^node_modules/@prisma/client/runtime'],
      },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },

    tsConfig: {
      fileName: 'tsconfig.json',
    },

    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },

    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
