import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, layoutStyles, badgeStyles } from '../theme';
import type { CSSProperties } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY TYPE METADATA — label, emoji, badge style
// ─────────────────────────────────────────────────────────────────────────────

const ENTRY_META: Record<EntryType, { label: string; icon: string; style: CSSProperties }> = {
  new: {
    label: 'Nouvelle fonctionnalité',
    icon: '✨',
    style: { ...badgeStyles.base, ...badgeStyles.success },
  },
  improvement: {
    label: 'Amélioration',
    icon: '🔧',
    style: { ...badgeStyles.base, ...badgeStyles.info },
  },
  fix: {
    label: 'Correction',
    icon: '🐛',
    style: { ...badgeStyles.base, ...badgeStyles.danger },
  },
  infra: {
    label: 'Infrastructure',
    icon: '⚙️',
    style: { ...badgeStyles.base, ...badgeStyles.neutral },
  },
  security: {
    label: 'Sécurité',
    icon: '🔒',
    style: { ...badgeStyles.base, ...badgeStyles.warning },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RELEASE DATA — historique complet, plus récente en premier
// ─────────────────────────────────────────────────────────────────────────────

const VERSIONS: ReleaseVersion[] = [
  {
    version: '2.1.7',
    name: 'Suivi GPS des techniciens (B5)',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Les techniciens peuvent partager leur position GPS depuis leur profil — case « 📍 Suivi de position » avec consentement explicite (Loi 25 / PIPEDA)',
      },
      {
        type: 'new',
        text: 'Carte interactive « Techniciens sur le terrain » sur le tableau de bord du répartiteur — markers OpenStreetMap rafraîchis toutes les 15 s avec les initiales du tech',
      },
      {
        type: 'security',
        text: 'Vérification double opt-in : la préférence est lue côté serveur à chaque envoi de position — un onglet périmé ou un client modifié ne peut pas continuer à envoyer après désactivation',
      },
      {
        type: 'security',
        text: 'Rétention 7 jours stricte : une tâche automatique purge tout enregistrement plus ancien chaque nuit à 03h15 UTC',
      },
      {
        type: 'improvement',
        text: 'Le hook frontend limite l\'envoi à 1 position par 25 s (largement sous le quota throttler de 60/min) et arrête immédiatement le suivi quand la case est décochée',
      },
      {
        type: 'infra',
        text: 'Nouvelle ADR-008 documentant la posture de consentement par défaut OFF, la portée 7 jours, et l\'enforcement serveur',
      },
    ],
  },
  {
    version: '2.1.6',
    name: 'Rapports & KPIs avancés (B3)',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Nouvelle page « 📈 Rapports » dans la sidebar (ADMIN + DISPATCHER) avec sélecteur de période et 4 sections de KPIs : temps de résolution moyen/médian par type, taux de réussite, conformité SLA, charge quotidienne (créés vs complétés)',
      },
      {
        type: 'new',
        text: 'Bouton « Télécharger en PDF » sur chaque bon de travail — produit une fiche d\'intervention propre, prête à imprimer ou à envoyer au client (français ou anglais)',
      },
      {
        type: 'new',
        text: 'Rapport mensuel exécutif téléchargeable en PDF — synthèse des 4 sections de KPIs sur le mois choisi, idéal pour les revues d\'équipe ou les rapports clients',
      },
      {
        type: 'new',
        text: 'Génération PDF basée sur Chromium intégré au container backend — aucune dépendance externe à installer, fonctionne en environnement self-hosted hors-ligne',
      },
      {
        type: 'improvement',
        text: 'Endpoint /reports/capabilities — le frontend détecte automatiquement si la génération PDF est disponible et désactive le bouton sinon (utile pour les déploiements légers)',
      },
      {
        type: 'security',
        text: 'Les techniciens ne peuvent télécharger que le PDF des BTs qui leur sont assignés — protection IDOR identique à celle des endpoints de lecture',
      },
    ],
  },
  {
    version: '2.1.5',
    name: 'Configuration plateforme par le Super-Admin (SA)',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Nouveau rôle SUPER_ADMIN — au-dessus d\'ADMIN, dédié à la configuration de la plateforme (clés VAPID, SMTP, Sentry, rétention audit, futurs tenants)',
      },
      {
        type: 'new',
        text: 'Page « 👑 Super-Admin » dans la sidebar (uniquement visible pour ce rôle) avec un éditeur curé : sections Email SMTP / Web Push / Sentry / Audit, statut DB vs env pour chaque clé, mise à jour instantanée',
      },
      {
        type: 'new',
        text: 'Les secrets sensibles (mot de passe SMTP, clé privée VAPID, DSN Sentry) sont chiffrés AES-GCM en base via une clé maître CONFIG_MASTER_KEY conservée dans .env — un dump DB ne suffit plus à exposer les secrets',
      },
      {
        type: 'new',
        text: 'Bootstrap automatique au démarrage : si SUPER_ADMIN_EMAIL est défini dans .env, l\'utilisateur correspondant est promu au premier boot. Idempotent — les redémarrages suivants sont no-op',
      },
      {
        type: 'improvement',
        text: 'Les services Email et Web Push consultent maintenant la configuration en cascade DB > env > défaut. Une modification depuis l\'UI Super-Admin prend effet immédiatement (Web Push) ou au prochain envoi (Email), sans redémarrage',
      },
      {
        type: 'security',
        text: 'Le SUPER_ADMIN hérite implicitement de toutes les permissions ADMIN, mais la réciproque ne tient pas — les ADMIN classiques ne peuvent pas accéder à /super-admin',
      },
      {
        type: 'infra',
        text: 'Architecture découplée : les changements de config émettent un événement systemConfigs.config.changed que les consommateurs écoutent pour recharger leur état — pas de coupling direct entre les modules',
      },
    ],
  },
  {
    version: '2.1.4',
    name: 'SLA + escalades automatiques (B4)',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Champ « SLA (heures) » sur chaque type de tâche — l\'admin configure le délai max attendu pour chaque catégorie de BT depuis les paramètres',
      },
      {
        type: 'new',
        text: 'Tout BT créé d\'un type avec SLA reçoit une cible automatique (« doit être terminé avant X »). La cible reste figée une fois créée, même si on reclasse le BT',
      },
      {
        type: 'new',
        text: 'Tâche automatique toutes les 15 minutes qui détecte les BT en retard SLA encore actifs — marquage en base + envoi automatique des notifications',
      },
      {
        type: 'new',
        text: 'Quand un BT dépasse son SLA : notification au technicien assigné ET à tous les admins + dispatchers actifs, sur leurs canaux préférés (en-app + email + push selon préférences)',
      },
      {
        type: 'new',
        text: 'Badge « ⚠ Retard » (rouge) sur les BT en breach + badge « 🕒 N min » (orange) sur les BT qui vont breacher dans l\'heure. Visible partout : détail BT, liste admin, liste technicien',
      },
      {
        type: 'new',
        text: 'Bouton « ⚠ En retard » dans la liste des BT — filtre instantané pour ne voir que les BT en breach SLA. Persisté dans le navigateur',
      },
      {
        type: 'infra',
        text: 'Nouvel événement domain workOrders.workOrder.slaBreached qui apparaît dans le journal d\'audit. Drill-down possible depuis la page audit (`/audit?eventName=workOrders.workOrder.slaBreached`)',
      },
    ],
  },
  {
    version: '2.1.3',
    name: 'Notifications multi-canaux (B1)',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Cloche de notifications en haut à droite avec badge du nombre non lus — actualisation automatique toutes les 30 secondes',
      },
      {
        type: 'new',
        text: 'Dropdown des 20 dernières notifications, non-lues en tête. Clic sur une notification : ouverture du bon de travail concerné et marquage comme lue',
      },
      {
        type: 'new',
        text: 'Notification automatique au technicien dès qu\'un bon de travail lui est assigné (plus besoin de rafraîchir la liste)',
      },
      {
        type: 'new',
        text: 'Section « 🔔 Préférences de notifications » sur le profil — matrice événement × canal (en-app / email / push) avec activation instantanée',
      },
      {
        type: 'new',
        text: 'Canal email opt-in : envoi automatique au technicien quand on lui assigne un BT (nécessite la configuration SMTP côté serveur)',
      },
      {
        type: 'new',
        text: 'Canal Web Push opt-in : notifications système même quand l\'onglet TaskMgr est fermé. Bouton « Activer » dans le profil + permission navigateur',
      },
      {
        type: 'infra',
        text: 'Service worker enrichi pour gérer les notifications push et le clic (ouverture du BT dans l\'onglet existant ou un nouveau)',
      },
      {
        type: 'infra',
        text: 'Toutes les notifications envoyées sont enregistrées dans le journal d\'audit (timeline de delivery) avec les canaux qui ont effectivement réussi',
      },
    ],
  },
  {
    version: '2.1.2',
    name: 'Sprint 1 — Observabilité + compliance',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Tableau de bord admin enrichi d\'un graphique d\'activité d\'audit sur 30 jours (barres par jour + top 5 types d\'évènements cliquables qui pré-filtrent la page Audit)',
      },
      {
        type: 'security',
        text: 'Les refus de permission (RBAC) sont maintenant persistés dans le journal d\'audit en plus du log structuré — l\'admin retrouve tous les 403 dans la même timeline qu\'il filtre déjà',
      },
      {
        type: 'infra',
        text: 'Tâche nocturne (3h00) qui purge les refresh tokens révoqués ou expirés depuis plus de 30 jours — la table reste compacte sans compromettre la détection de replay',
      },
      {
        type: 'infra',
        text: 'Tâche nocturne (3h30) qui purge les entrées d\'audit plus vieilles que la fenêtre de rétention configurée (défaut 365 jours, ajustable via AUDIT_RETENTION_DAYS) — conformité Loi 25 / PIPEDA',
      },
      {
        type: 'infra',
        text: 'Intégration Sentry câblée mais optionnelle : sans DSN, aucune télémétrie n\'est envoyée. Coller un DSN dans .env (SENTRY_DSN=…) active la remontée automatique des erreurs 5xx',
      },
    ],
  },
  {
    version: '2.1.1',
    name: 'Sprint 1 — Page audit + qualité',
    date: 'Juin 2026',
    entries: [
      {
        type: 'new',
        text: 'Nouvelle page « 📜 Audit » (ADMIN) : timeline complète avec filtres par type d\'événement, agrégat, acteur, et plage de dates. Payload JSON dépliable. Lien cliquable depuis chaque ID d\'agrégat vers le BT concerné',
      },
      {
        type: 'new',
        text: 'Export CSV de l\'audit (ADMIN) — exporte la sélection filtrée dans un fichier prêt pour les exports compliance Loi 25 / PIPEDA',
      },
      {
        type: 'new',
        text: 'Lien « 🔍 Voir dans l\'audit complet → » sur la timeline d\'un BT (ADMIN) — pivot direct vers la page audit pré-filtrée pour analyser le contexte complet de l\'événement',
      },
      {
        type: 'improvement',
        text: 'Filtre « Acteur » sur la page audit — dropdown de tous les utilisateurs pour ne voir que les actions d\'une personne donnée',
      },
      {
        type: 'infra',
        text: 'TypeScript strict côté backend renforcé : trois flags (noImplicitAny, strictBindCallApply, strictNullChecks) activés sans aucune régression. Filet anti-bug type-safety',
      },
      {
        type: 'infra',
        text: 'Tests E2E (Playwright) introduits côté frontend — deux scénarios automatisables couvrant la navigation admin et le cycle complet création → assignation → terminaison par un technicien',
      },
      {
        type: 'infra',
        text: 'Suite Jest passe de 226 à 244 tests verts ; documentation de spécification ajoutée pour les modules audit, auth et recherche globale',
      },
    ],
  },
  {
    version: '2.1.0',
    name: 'Sprint 1 — Quick wins, sécurité auth et observabilité',
    date: 'Juin 2026',
    entries: [
      // ── Sécurité (priorité affichage) ────────────────────────────────────
      {
        type: 'security',
        text: 'Rotation des refresh tokens en base — chaque login démarre une « famille » de tokens. À chaque refresh l\'ancien est révoqué et un nouveau est émis. Si un token déjà révoqué est rejoué, toute la famille est invalidée immédiatement (détection de vol)',
      },
      {
        type: 'security',
        text: 'Rate limiting maintenant réellement appliqué (avant : les headers étaient présents mais aucune limite n\'était imposée). Limite scopée par utilisateur authentifié au lieu de l\'adresse IP, pour ne pas pénaliser les bureaux derrière un même NAT',
      },
      {
        type: 'security',
        text: 'Chaque refus de permission émet maintenant un log structuré « security.access.denied » avec utilisateur, rôle, route et rôles requis — détection de scans IDOR par lecture de logs',
      },
      {
        type: 'security',
        text: 'Faille IDOR colmatée sur GET /clients/:id et GET /calendar/appointments/:id (un compte technicien pouvait lire n\'importe quelle fiche client) — accès maintenant limité à ADMIN + DISPATCHER, verrouillé par 41 assertions de matrice de permissions',
      },

      // ── UX Dispatcher ────────────────────────────────────────────────────
      {
        type: 'new',
        text: 'Export CSV de la liste des bons de travail — respecte les filtres actifs, ouvert proprement dans Excel (UTF-8 + BOM) (ADMIN + DISPATCHER, bouton ⬇ Exporter CSV)',
      },
      {
        type: 'new',
        text: 'Filtres BT enregistrés — sauvegardez vos combinaisons de filtres usuels (« Mes BT en cours », « Urgents cette semaine », etc.) et rappelez-les en un clic. Persistance navigateur',
      },
      {
        type: 'new',
        text: 'Bouton « 🗐 Dupliquer » sur la page détail d\'un BT — recopie titre, type, client, adresse, données de formulaire, sans le technicien ni les dates. Pratique pour les BT récurrents',
      },

      // ── UX Technicien ────────────────────────────────────────────────────
      {
        type: 'new',
        text: 'Chip « 🚗 En route depuis MM:SS » au-dessus du BT du technicien — le temps de déplacement défile chaque seconde dès le passage en EN_ROUTE',
      },
      {
        type: 'new',
        text: 'Le technicien peut maintenant consulter l\'historique de transitions (timeline) de ses propres BT, comme les admins/dispatchers',
      },

      // ── UX commun ────────────────────────────────────────────────────────
      {
        type: 'improvement',
        text: 'Boutons de transition de statut indiquent maintenant 📝 + tooltip quand une modale va demander des champs supplémentaires (technicien, notes, raison) — fini le clic-erreur-relire',
      },
      {
        type: 'improvement',
        text: 'Fiche imprimée du BT enrichie : affiche maintenant le client V3 (relations modernes), les valeurs du formulaire personnalisé section par section, et une section « Complétion » avec heures effectives + notes + résultat quand le BT est terminé',
      },

      // ── Infra / prod-readiness ──────────────────────────────────────────
      {
        type: 'infra',
        text: 'Test de fumée au démarrage : DB et MinIO sont sondés avant que l\'application accepte du trafic. Si une dépendance est rouge, le démarrage échoue avec un message clair — un déploiement cassé est attrapé tout de suite au lieu de produire des 5xx en monitoring',
      },
      {
        type: 'infra',
        text: 'Suite de tests passée de 192 / 200 à 226 / 226 (toutes les anciennes assertions périmées remises à jour, nouvelle couverture sur les flux d\'authentification et les permissions par rôle)',
      },
    ],
  },
  {
    version: '2.0.0',
    name: 'Templates de formulaires et RBAC granulaire',
    date: 'Mai 2026',
    entries: [
      {
        type: 'new',
        text: 'Templates de formulaires personnalisés — créez des sections et des champs (texte court/long, nombre, case à cocher, liste déroulante, date) directement depuis /parametres/templates',
      },
      {
        type: 'new',
        text: 'Chaque type de tâche peut être associé à un template — le formulaire personnalisé s\'affiche automatiquement à la création/édition d\'un BT de ce type',
      },
      {
        type: 'new',
        text: 'RBAC granulaire par section et par champ : pour chaque rôle, choisir s\'il peut voir, modifier, et pour quel champ il est requis',
      },
      {
        type: 'new',
        text: 'Matrice de permissions visuelle (bouton 🔒) sur chaque section/champ — coche par rôle avec ADMIN toujours en bypass',
      },
      {
        type: 'security',
        text: 'Filtrage côté backend : le template est trimé avant d\'être envoyé selon les viewRoles, et toute écriture sur un champ non éditable retourne 403',
      },
      {
        type: 'improvement',
        text: 'Indicateurs visuels sur les lignes de champ dans le builder : 🙈 (caché pour certains rôles), 🔒 (lecture seule), * (requis)',
      },
      {
        type: 'new',
        text: 'Affichage en lecture seule des valeurs remplies sur la page détail d\'un BT, organisées par section',
      },
    ],
  },
  {
    version: '1.9.0',
    name: 'Adresses structurées et améliorations UX BT',
    date: 'Mai 2026',
    entries: [
      {
        type: 'new',
        text: 'Nouveau module Adresses (/adresses) listant toutes les adresses avec le client associé, type d\'adresse et badge type client',
      },
      {
        type: 'new',
        text: 'Champ « Appartement / Unité » sur les adresses clients (affiché dans toutes les vues : liste, modal, BT)',
      },
      {
        type: 'new',
        text: 'Édition d\'adresses depuis le modal client (bouton ✏️) avec formulaire pré-rempli',
      },
      {
        type: 'new',
        text: 'Sélecteur d\'adresse d\'intervention dans le modal d\'édition d\'un BT — auto-remplit le texte libre',
      },
      {
        type: 'new',
        text: 'Carte « 📍 Emplacement de l\'intervention » sur la page détail d\'un BT avec l\'adresse structurée (rue + appartement + ville + code postal + libellé)',
      },
      {
        type: 'improvement',
        text: 'Modal d\'édition BT : section client/adresse refondue en deux blocs distincts avec carte client (nom + email + téléphone + badge)',
      },
      {
        type: 'improvement',
        text: 'Le formulaire client/adresse sauve désormais infos client ET nouvelle adresse en un seul clic « Enregistrer »',
      },
      {
        type: 'improvement',
        text: 'Dropdown de changement de statut dans l\'en-tête du BT (auparavant bloc « Actions » au bas de page) avec position fixed pour éviter le clipping',
      },
      {
        type: 'improvement',
        text: 'Drag & drop des BT vers techniciens : ligne du BT en fond bleu pointillé pendant le drag, technicien survolé en vert vif avec effet de soulèvement',
      },
      {
        type: 'improvement',
        text: 'Création de BT depuis le calendrier redirige maintenant vers le wizard complet (client → adresse → détails → assignation) avec date/heure pré-remplies depuis le créneau cliqué',
      },
      {
        type: 'fix',
        text: 'Les heures planifiées (scheduled_start_time/end_time) sont maintenant correctement persistées en ISO 8601 — auparavant elles s\'écrivaient NULL silencieusement',
      },
      {
        type: 'fix',
        text: 'Affichage du client sur la page détail d\'un BT : cas Client V3 désormais géré (avant : carte vide pour les BT liés à un client enregistré)',
      },
      {
        type: 'fix',
        text: 'Endpoint /api/clients/addresses/all : nouvelle route retournant toutes les adresses avec leur client associé',
      },
    ],
  },
  {
    version: '1.8.0',
    name: 'Moteur de processus configurable',
    date: 'Mai 2026',
    entries: [
      {
        type: 'new',
        text: 'Moteur de processus dynamique : statuts et transitions configurables depuis /parametres/processus (auparavant codés en dur)',
      },
      {
        type: 'new',
        text: 'Plusieurs processus peuvent coexister — chaque type de tâche peut pointer vers son propre processus avec ses propres étapes et transitions',
      },
      {
        type: 'new',
        text: 'Module Clients V3 avec modèle Client persistant et adresses multiples (vs anciens clients temporaires)',
      },
      {
        type: 'new',
        text: 'Types de tâches configurables avec préfixe (PLB, ELC, MNT…) utilisé pour la génération des numéros de référence (LIV-20260511-0001)',
      },
      {
        type: 'new',
        text: 'Composant TransitionActionBar dynamique : les boutons de transition disponibles sont calculés depuis la définition du processus + le rôle utilisateur',
      },
      {
        type: 'improvement',
        text: 'Page Clients refondue avec recherche, filtre par type, gestion d\'adresses inline, modal détail/édition',
      },
      {
        type: 'improvement',
        text: 'Suppression d\'un processus : soft-delete + filtre des inactifs par défaut + toast de feedback + bouton ♻️ Réactiver',
      },
      {
        type: 'improvement',
        text: 'Création d\'un processus avec messages d\'erreur clairs (nom dupliqué, conflit du processus par défaut)',
      },
      {
        type: 'fix',
        text: 'Nginx frontend : index.html en no-cache pour qu\'un nouveau bundle JS soit chargé immédiatement après login (auparavant nécessitait un hard refresh)',
      },
      {
        type: 'fix',
        text: 'Login depuis le bon hôte (port 8088 du nginx reverse-proxy) : ajout d\'un guide quand l\'utilisateur tape l\'URL avec le port 3801 (qui ne sert que le SPA statique)',
      },
      {
        type: 'fix',
        text: 'AdminSidebar : la limite de fetch des BT pour le compteur par technicien passe de 100 à 500 côté backend pour accommoder de plus grandes bases',
      },
      {
        type: 'infra',
        text: 'Tables process_definitions, process_statuses, process_transitions + colonne template_id sur task_types + colonne template_data JSONB sur work_orders',
      },
    ],
  },
  {
    version: '1.7.0',
    name: 'Profil et administration',
    date: 'Avril 2025',
    entries: [
      {
        type: 'improvement',
        text: 'Rôle DISPATCHER disponible dans les formulaires de création et d\'édition d\'utilisateur',
      },
      {
        type: 'new',
        text: 'Bouton "Réinitialiser le mot de passe" pour l\'administrateur avec validation de sécurité',
      },
      {
        type: 'new',
        text: 'Section Types de clients dans Paramètres (Résidentiel, Commercial, Industriel, Institutionnel)',
      },
      {
        type: 'new',
        text: 'Section Types d\'emplacement dans Paramètres (Bureau, Entrepôt, Résidence, Chantier)',
      },
      {
        type: 'new',
        text: 'Page Notes de version avec historique complet du développement du projet',
      },
    ],
  },
  {
    version: '1.6.0',
    name: 'Rôles et gestion avancée',
    date: 'Mars 2025',
    entries: [
      {
        type: 'new',
        text: 'Nouveau rôle DISPATCHER (Répartiteur) — accès à toutes les sections sauf Paramètres',
      },
      {
        type: 'new',
        text: 'Case à cocher "Masquer les BT complétés" (backend + frontend, interface mobile technicien)',
      },
      {
        type: 'improvement',
        text: 'Endpoint dynamique des transitions disponibles calculé selon le rôle de l\'utilisateur connecté',
      },
      {
        type: 'new',
        text: 'Sidebar techniciens avec Drag & Drop pour assignation directe d\'un bon de travail',
      },
      {
        type: 'new',
        text: 'Modal de confirmation avec 2 options : "Assigner seulement" ou "Assigner + Dispatcher"',
      },
      {
        type: 'fix',
        text: 'Correction de la modale silencieuse sans message d\'erreur lors d\'une assignation échouée',
      },
      {
        type: 'fix',
        text: 'Guard empêchant un technicien de ré-ouvrir un bon de travail terminé',
      },
    ],
  },
  {
    version: '1.5.0',
    name: 'Calendrier interactif et assignation',
    date: 'Février 2025',
    entries: [
      {
        type: 'new',
        text: 'Clic sur une zone vide du calendrier → création rapide d\'un BT avec date et heure pré-remplies',
      },
      {
        type: 'new',
        text: 'Drag & Drop des événements sur le calendrier — déplacement de date/heure avec conservation de la durée',
      },
      {
        type: 'improvement',
        text: 'Réassignation automatique au technicien filtré lors d\'un glisser-déposer sur le calendrier',
      },
      {
        type: 'new',
        text: 'Boutons Voir / Éditer / Assigner dans la liste des bons de travail (vue admin)',
      },
      {
        type: 'new',
        text: 'Bouton "Assigner un client" sur la page de détail d\'un bon de travail',
      },
      {
        type: 'fix',
        text: 'Correction de l\'échelle de priorité inversée (1 = Très basse → 5 = Critique)',
      },
      {
        type: 'fix',
        text: 'Correction du clic sur un événement en vue mois du calendrier (ne s\'ouvrait pas)',
      },
    ],
  },
  {
    version: '1.4.0',
    name: 'Statut En Route et mode offline',
    date: 'Février 2025',
    entries: [
      {
        type: 'new',
        text: 'Nouveau statut EN_ROUTE dans le workflow (DISPATCHED → EN_ROUTE → IN_PROGRESS)',
      },
      {
        type: 'infra',
        text: 'Migration Prisma pour l\'ajout du statut EN_ROUTE en base de données PostgreSQL',
      },
      {
        type: 'improvement',
        text: 'Admin bypass : l\'administrateur peut effectuer toutes les transitions indépendamment des règles de rôle',
      },
      {
        type: 'improvement',
        text: 'Mode offline amélioré pour les techniciens — mutations en file d\'attente avec synchronisation automatique',
      },
      {
        type: 'improvement',
        text: 'Boutons de transition dynamiques sur l\'interface technicien selon l\'état courant du BT',
      },
    ],
  },
  {
    version: '1.3.0',
    name: 'Impression Letter et édition admin',
    date: 'Janvier 2025',
    entries: [
      {
        type: 'improvement',
        text: 'Template d\'impression format Letter (8,5" × 11") optimisé pour tenir sur une seule page',
      },
      {
        type: 'improvement',
        text: 'Marges réduites et polices compactées pour maximiser l\'espace d\'impression',
      },
      {
        type: 'new',
        text: 'L\'administrateur peut éditer TOUS les champs d\'un bon de travail quel que soit son statut',
      },
      {
        type: 'new',
        text: 'Modal d\'édition admin complète : titre, type, priorité, description, client, technicien, planification',
      },
    ],
  },
  {
    version: '1.2.0',
    name: 'Thème visuel',
    date: 'Janvier 2025',
    entries: [
      {
        type: 'new',
        text: 'Fichier thème centralisé (theme.ts) avec palette de 20+ couleurs professionnelles et styles réutilisables',
      },
      {
        type: 'improvement',
        text: 'Fond de page gris-bleu uniforme pour que les cards blanches ressortent visuellement',
      },
      {
        type: 'improvement',
        text: 'Bordures de tables rendues visibles — contraste amélioré pour la lisibilité',
      },
      {
        type: 'improvement',
        text: 'Lignes de tableau alternées (zebrastripes) avec effet hover sur survol',
      },
      {
        type: 'improvement',
        text: 'Cards avec bordures et ombres uniformisées dans toute l\'application',
      },
      {
        type: 'improvement',
        text: 'Page de connexion avec dégradé bleu foncé professionnel',
      },
      {
        type: 'improvement',
        text: 'Cards technicien avec bordure colorée selon le statut du bon de travail',
      },
      {
        type: 'improvement',
        text: 'Modales uniformisées avec styles, espacements et boutons cohérents',
      },
      {
        type: 'improvement',
        text: 'Boutons tokenisés en variantes : primary, secondary, danger, ghost',
      },
      {
        type: 'improvement',
        text: '17 fichiers mis à jour pour utiliser le thème centralisé (suppression des styles ad hoc)',
      },
    ],
  },
  {
    version: '1.1.0',
    name: 'Transitions de statut et filtres',
    date: 'Décembre 2024',
    entries: [
      {
        type: 'improvement',
        text: 'Transitions de statut v2 : l\'admin peut ré-ouvrir un BT terminé positivement avec raison obligatoire',
      },
      {
        type: 'improvement',
        text: 'L\'admin peut ré-ouvrir un bon de travail terminé négativement',
      },
      {
        type: 'improvement',
        text: 'Le technicien peut gérer ses propres transitions : Réparti → En route → Début travaux → Fin',
      },
      {
        type: 'new',
        text: 'Système de filtres avancés sur la liste des BT : statut, type, technicien, date de/à, priorité, recherche texte',
      },
      {
        type: 'new',
        text: 'Badge compteur de filtres actifs pour indiquer les critères appliqués',
      },
      {
        type: 'new',
        text: 'Template d\'impression A4 complet : en-tête, client, technicien, notes, zone terrain et signatures',
      },
      {
        type: 'fix',
        text: 'Correction du calendrier — extraction et affichage des données retournées par l\'API',
      },
    ],
  },
  {
    version: '1.0.0',
    name: 'Fondation — Sprint initial',
    date: 'Novembre 2024',
    entries: [
      {
        type: 'infra',
        text: 'Scaffolding complet : NestJS backend + React frontend + Docker Compose multi-services',
      },
      {
        type: 'new',
        text: 'Authentification JWT avec access tokens et refresh tokens',
      },
      {
        type: 'new',
        text: 'Gestion des utilisateurs avec rôles (Admin, Technicien)',
      },
      {
        type: 'new',
        text: 'CRUD des clients : création temporaire et recherche dans une base de données externe',
      },
      {
        type: 'new',
        text: 'CRUD des bons de travail avec machine d\'états (Créé → Assigné → Réparti → Début travaux → Fin positive/négative)',
      },
      {
        type: 'new',
        text: 'Module pièces jointes avec stockage objet MinIO',
      },
      {
        type: 'new',
        text: 'Calendrier avec vues jour / 3 jours / semaine / mois',
      },
      {
        type: 'new',
        text: 'Dashboard avec statistiques dédiées admin et technicien',
      },
      {
        type: 'new',
        text: 'Interface mobile PWA pour les techniciens (responsive, installable)',
      },
      {
        type: 'new',
        text: 'Mode offline basique pour les techniciens (IndexedDB + Service Worker)',
      },
      {
        type: 'infra',
        text: 'Docker Compose avec ports non-standard : 5433 (PG), 9010 (MinIO), 3800/3801 (app), 8088 (proxy)',
      },
      {
        type: 'infra',
        text: 'Configuration Nginx en reverse proxy pour le routage des services',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — Summary badge in card header
// ─────────────────────────────────────────────────────────────────────────────

function SummaryBadge({ count, type }: { count: number; type: EntryType }) {
  const meta = ENTRY_META[type];
  return (
    <span style={{ ...meta.style, fontSize: theme.font.sizeXs }}>
      {meta.icon} {count}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — Collapsible version card
// ─────────────────────────────────────────────────────────────────────────────

interface VersionCardProps {
  version: ReleaseVersion;
  isOpen: boolean;
  onToggle: () => void;
}

function VersionCard({ version, isOpen, onToggle }: VersionCardProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<EntryType, number>> = {};
    for (const e of version.entries) {
      c[e.type] = (c[e.type] ?? 0) + 1;
    }
    return c;
  }, [version.entries]);

  return (
    <div style={cardStyles.card}>
      {/* ── Clickable header ───────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '1rem 1.25rem',
          background: isOpen ? theme.colors.primaryLight : theme.colors.background,
          border: 'none',
          borderBottom: isOpen ? theme.borders.default : 'none',
          cursor: 'pointer',
          transition: 'background 0.2s ease',
          textAlign: 'left' as CSSProperties['textAlign'],
          gap: '0.75rem',
        }}
      >
        {/* Left — version badge + title + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.2rem 0.7rem',
              background: theme.colors.primary,
              color: '#ffffff',
              borderRadius: theme.radius.full,
              fontSize: theme.font.sizeSm,
              fontWeight: theme.font.weightBold,
              letterSpacing: '0.02em',
              flexShrink: 0,
              whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
            }}
          >
            v{version.version}
          </span>

          <div style={{ overflow: 'hidden' }}>
            <span
              style={{
                fontSize: theme.font.sizeMd,
                fontWeight: theme.font.weightSemibold,
                color: theme.colors.text,
              }}
            >
              {version.name}
            </span>
            <span
              style={{
                marginLeft: '0.75rem',
                fontSize: theme.font.sizeSm,
                color: theme.colors.textMuted,
                fontWeight: theme.font.weightNormal,
              }}
            >
              — {version.date}
            </span>
          </div>
        </div>

        {/* Right — entry-type summary badges + chevron */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            flexShrink: 0,
          }}
        >
          {(counts.new ?? 0) > 0 && (
            <SummaryBadge count={counts.new!} type="new" />
          )}
          {(counts.improvement ?? 0) > 0 && (
            <SummaryBadge count={counts.improvement!} type="improvement" />
          )}
          {(counts.fix ?? 0) > 0 && (
            <SummaryBadge count={counts.fix!} type="fix" />
          )}
          {(counts.infra ?? 0) > 0 && (
            <SummaryBadge count={counts.infra!} type="infra" />
          )}
          {(counts.security ?? 0) > 0 && (
            <SummaryBadge count={counts.security!} type="security" />
          )}
          <span
            style={{
              fontSize: '0.75rem',
              color: theme.colors.textMuted,
              marginLeft: '0.375rem',
              display: 'inline-block',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
              lineHeight: 1,
            }}
          >
            ▼
          </span>
        </div>
      </button>

      {/* ── Collapsible body ────────────────────────────────────────────────── */}
      {isOpen && (
        <div style={{ padding: '0.5rem 1.25rem 1.25rem' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {version.entries.map((entry, idx) => {
              const isLast = idx === version.entries.length - 1;
              const isHovered = hoveredIdx === idx;
              return (
                <li
                  key={idx}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.625rem 0.5rem',
                    borderBottom: isLast ? 'none' : `1px solid ${theme.colors.borderLight}`,
                    borderRadius: theme.radius.sm,
                    background: isHovered ? theme.colors.background : 'transparent',
                    transition: 'background 0.12s ease',
                  }}
                >
                  {/* Type badge */}
                  <span
                    style={{
                      ...ENTRY_META[entry.type].style,
                      flexShrink: 0,
                      marginTop: '0.05rem',
                      whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
                    }}
                  >
                    {ENTRY_META[entry.type].icon} {ENTRY_META[entry.type].label}
                  </span>

                  {/* Entry text */}
                  <span
                    style={{
                      fontSize: theme.font.sizeSm,
                      color: theme.colors.text,
                      lineHeight: 1.6,
                    }}
                  >
                    {entry.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ReleaseNotesPage() {
  const { t: tNav } = useTranslation('nav');
  // Most recent version open by default
  const [openVersions, setOpenVersions] = useState<Set<string>>(
    new Set([VERSIONS[0].version]),
  );
  const [filterVersion, setFilterVersion] = useState<string>('all');

  function toggleVersion(version: string) {
    setOpenVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }

  // Expand / collapse all helpers
  function expandAll() {
    setOpenVersions(new Set(VERSIONS.map((v) => v.version)));
  }

  function collapseAll() {
    setOpenVersions(new Set());
  }

  const filteredVersions = useMemo(() => {
    if (filterVersion === 'all') return VERSIONS;
    return VERSIONS.filter((v) => v.version === filterVersion);
  }, [filterVersion]);

  // Total entry counts for the stat line
  const totalCounts = useMemo(() => {
    const c: Partial<Record<EntryType, number>> = {};
    for (const v of VERSIONS) {
      for (const e of v.entries) {
        c[e.type] = (c[e.type] ?? 0) + 1;
      }
    }
    return c;
  }, []);

  return (
    <div style={layoutStyles.page}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={layoutStyles.pageHeader}>
        <div>
          <h1 style={layoutStyles.pageTitle}>📋 {tNav('releaseNotes')}</h1>
          <p style={layoutStyles.pageSubtitle}>
            Historique complet des évolutions de TaskMgr —{' '}
            <strong>{VERSIONS.length}</strong> versions,{' '}
            <strong>{VERSIONS.reduce((acc, v) => acc + v.entries.length, 0)}</strong> entrées
          </p>
        </div>

        {/* Filter + expand/collapse controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' as CSSProperties['flexWrap'] }}>
          {/* Expand / collapse all */}
          <button
            onClick={expandAll}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: theme.font.sizeXs,
              borderRadius: theme.radius.md,
              border: theme.borders.default,
              background: theme.colors.surface,
              color: theme.colors.textSecondary,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Tout déplier
          </button>
          <button
            onClick={collapseAll}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: theme.font.sizeXs,
              borderRadius: theme.radius.md,
              border: theme.borders.default,
              background: theme.colors.surface,
              color: theme.colors.textSecondary,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Tout replier
          </button>

          {/* Version filter dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <label
              style={{
                fontSize: theme.font.sizeSm,
                color: theme.colors.textSecondary,
                whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
              }}
            >
              Filtrer :
            </label>
            <select
              value={filterVersion}
              onChange={(e) => setFilterVersion(e.target.value)}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: theme.font.sizeSm,
                borderRadius: theme.radius.md,
                border: theme.borders.default,
                background: theme.colors.surface,
                color: theme.colors.text,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">Toutes les versions</option>
              {VERSIONS.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} — {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Legend + global stats ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap' as CSSProperties['flexWrap'],
          padding: '0.75rem 1rem',
          background: theme.colors.surface,
          border: theme.borders.light,
          borderRadius: theme.radius.md,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginRight: '0.25rem' }}>
          Légende :
        </span>
        {(Object.entries(ENTRY_META) as [EntryType, (typeof ENTRY_META)[EntryType]][]).map(
          ([type, meta]) => (
            <span key={type} style={{ ...meta.style, fontSize: theme.font.sizeXs }}>
              {meta.icon} {meta.label}
              {totalCounts[type] ? (
                <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>({totalCounts[type]})</span>
              ) : null}
            </span>
          ),
        )}
      </div>

      {/* ── Version cards ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {filteredVersions.map((v) => (
          <VersionCard
            key={v.version}
            version={v}
            isOpen={openVersions.has(v.version)}
            onToggle={() => toggleVersion(v.version)}
          />
        ))}
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: '2rem',
          textAlign: 'center' as CSSProperties['textAlign'],
          fontSize: theme.font.sizeXs,
          color: theme.colors.textLight,
        }}
      >
        TaskMgr — Application de répartition de bons de travail
      </div>
    </div>
  );
}
