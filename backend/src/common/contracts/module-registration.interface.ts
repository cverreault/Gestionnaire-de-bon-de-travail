/**
 * Contrat que tout module métier devrait implémenter pour s'enficher dans
 * l'écosystème TaskMgr. Permet :
 *
 *  - **Validation des dépendances au boot** : si un module consomme un event
 *    publié par un module absent, l'erreur sort à la startup (pas en runtime).
 *  - **Page admin "modules actifs"** future : itérer les enregistrements
 *    pour afficher version, état, dépendances.
 *  - **Documentation auto-générée** : extraire la liste des events
 *    publiés/consommés pour la doc du système.
 *
 * Convention : chaque `{module}.module.ts` exporte une constante
 * `{ModuleName}Registration: IModuleRegistration`, déclarée comme provider.
 * Un service central (à venir) la collectera au boot.
 *
 * Voir : docs/adrs/ADR-001 §3, docs/adrs/ADR-007 (à venir).
 */
export interface IModuleRegistration {
  /** Identifiant kebab-case unique du module. Ex: 'work-orders', 'notifications' */
  readonly moduleId: string;

  /** Version semver — incrémentée à chaque changement de contrats publics */
  readonly version: string;

  /**
   * Catégorie du module.
   *  - 'core' : toujours présent, fait partie du squelette de l'app
   *  - 'optional' : activable/désactivable (futur, multi-tenant)
   */
  readonly type: 'core' | 'optional';

  /** Liste des `moduleId` dont ce module dépend (hard dependency). */
  readonly dependsOn: readonly string[];

  /** Events de domaine que ce module **publie**. */
  readonly publishedEvents: readonly string[];

  /** Events de domaine que ce module **consomme** (via `@OnEvent`). */
  readonly consumedEvents: readonly string[];

  /**
   * Hook optionnel exécuté une seule fois au démarrage du module, après que
   * tous les autres modules dépendants sont enregistrés.
   * Utile pour des seeds, des warmup cache, des validations de config.
   */
  onBootstrap?(): Promise<void>;
}
