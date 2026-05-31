/**
 * Représentation générique d'un client issu de la base de données externe (READ ONLY).
 * Les champs correspondent aux colonnes canoniques attendues dans la table distante.
 * Les champs supplémentaires non mappés sont agrégés dans `metadata`.
 */
export interface ExternalClient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  /** Champs supplémentaires présents dans la table externe mais non mappés explicitement */
  metadata?: Record<string, any>;
}

/**
 * Résultat unifié de recherche : combine clients locaux (enrichis ou temporaires) et clients externes.
 * Le champ `source` permet au front de distinguer l'origine :
 * - `'local'`     → Client enrichi (nouveau modèle Client)
 * - `'temporary'` → Ancien client temporaire (TemporaryClient)
 * - `'external'`  → Client issu de la base de données externe (READ ONLY)
 */
export interface UnifiedClientResult extends ExternalClient {
  source: 'local' | 'temporary' | 'external';
}
