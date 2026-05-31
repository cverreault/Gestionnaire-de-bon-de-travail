import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { ExternalClient } from './types/external-client.interface';

/**
 * Noms de colonnes configurables via variables d'environnement.
 * Valeurs par défaut : colonnes canoniques typiques d'une table clients PostgreSQL.
 */
interface ColumnMapping {
  tableName: string;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

/**
 * Service d'accès en lecture seule à la base de données clients externe.
 *
 * Architecture :
 * - Utilise `pg` (Pool) pour une connexion directe configurable via EXTERNAL_DB_URL.
 * - Si EXTERNAL_DB_URL n'est pas défini, le service fonctionne en mode dégradé :
 *   toutes les méthodes retournent un tableau vide sans lever d'exception.
 * - Les requêtes SQL sont paramétrées pour prévenir toute injection SQL.
 * - Un timeout de 5 s est appliqué sur chaque requête.
 * - Les erreurs de connexion ou d'exécution sont loggées et swallowées gracieusement.
 */
@Injectable()
export class ExternalClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExternalClientService.name);
  private pool: Pool | null = null;
  private readonly columns: ColumnMapping;

  constructor(private readonly config: ConfigService) {
    // Mapping des colonnes — configurable via env, avec des valeurs par défaut conventionnelles
    this.columns = {
      tableName: config.get<string>('EXTERNAL_DB_TABLE', 'clients'),
      id:         config.get<string>('EXTERNAL_DB_COL_ID',          'id'),
      firstName:  config.get<string>('EXTERNAL_DB_COL_FIRST_NAME',  'first_name'),
      lastName:   config.get<string>('EXTERNAL_DB_COL_LAST_NAME',   'last_name'),
      email:      config.get<string>('EXTERNAL_DB_COL_EMAIL',       'email'),
      phone:      config.get<string>('EXTERNAL_DB_COL_PHONE',       'phone'),
      address:    config.get<string>('EXTERNAL_DB_COL_ADDRESS',     'address'),
      city:       config.get<string>('EXTERNAL_DB_COL_CITY',        'city'),
      postalCode: config.get<string>('EXTERNAL_DB_COL_POSTAL_CODE', 'postal_code'),
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('EXTERNAL_DB_URL');

    if (!url) {
      this.logger.warn(
        'EXTERNAL_DB_URL non défini — le service de clients externes fonctionne en mode dégradé (retours vides).',
      );
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: url,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });

      // Test de connexion au démarrage
      const client = await this.pool.connect();
      client.release();
      this.logger.log('Connexion à la base de données externe établie avec succès.');
    } catch (err) {
      this.logger.error(
        'Impossible de se connecter à la base de données externe — mode dégradé activé.',
        (err as Error).message,
      );
      this.pool = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Pool de connexion à la base externe fermé.');
    }
  }

  // ── Helpers privés ───────────────────────────────────────────────────────────

  /** Retourne true si le pool est opérationnel */
  private isAvailable(): boolean {
    return this.pool !== null;
  }

  /**
   * Exécute une requête SQL paramétrée avec timeout de 5 secondes.
   * Toutes les erreurs sont capturées et loggées — ne remonte jamais d'exception.
   */
  private async executeQuery<T>(
    sql: string,
    params: any[],
  ): Promise<T[] | null> {
    if (!this.isAvailable()) {
      return null;
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool!.connect();

      // Timeout de 5 secondes sur la requête via SET LOCAL
      await client.query('SET LOCAL statement_timeout = 5000');
      const result = await client.query(sql, params);
      return result.rows as T[];
    } catch (err) {
      this.logger.error(
        `Erreur lors de l'exécution de la requête externe : ${(err as Error).message}`,
        (err as Error).stack,
      );
      return null;
    } finally {
      client?.release();
    }
  }

  /**
   * Mappe une ligne brute de la DB externe vers l'interface ExternalClient.
   * Les colonnes non mappées sont regroupées dans `metadata`.
   */
  private mapRow(row: Record<string, any>): ExternalClient {
    const c = this.columns;
    const knownKeys = new Set([c.id, c.firstName, c.lastName, c.email, c.phone, c.address, c.city, c.postalCode]);

    // Champs supplémentaires non mappés → metadata
    const metadata: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!knownKeys.has(key)) {
        metadata[key] = value;
      }
    }

    return {
      id:         String(row[c.id] ?? ''),
      firstName:  String(row[c.firstName] ?? ''),
      lastName:   String(row[c.lastName] ?? ''),
      email:      row[c.email]      ?? undefined,
      phone:      row[c.phone]      ?? undefined,
      address:    row[c.address]    ?? undefined,
      city:       row[c.city]       ?? undefined,
      postalCode: row[c.postalCode] ?? undefined,
      metadata:   Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  // ── Méthodes publiques ───────────────────────────────────────────────────────

  /**
   * Recherche des clients externes par terme (prénom, nom, email, téléphone).
   * Retourne un tableau vide si la DB externe est indisponible.
   */
  async search(term: string, limit: number = 20): Promise<ExternalClient[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const c = this.columns;
    const pattern = `%${term}%`;

    const sql = `
      SELECT *
      FROM "${c.tableName}"
      WHERE
        "${c.firstName}" ILIKE $1
        OR "${c.lastName}" ILIKE $1
        OR "${c.email}" ILIKE $1
        OR "${c.phone}" ILIKE $1
      ORDER BY "${c.lastName}" ASC, "${c.firstName}" ASC
      LIMIT $2
    `;

    const rows = await this.executeQuery<Record<string, any>>(sql, [pattern, limit]);
    if (!rows) return [];

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Récupère tous les clients externes avec une limite.
   * Retourne un tableau vide si la DB externe est indisponible.
   */
  async findAll(limit: number = 20): Promise<ExternalClient[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const c = this.columns;
    const sql = `
      SELECT *
      FROM "${c.tableName}"
      ORDER BY "${c.lastName}" ASC, "${c.firstName}" ASC
      LIMIT $1
    `;

    const rows = await this.executeQuery<Record<string, any>>(sql, [limit]);
    if (!rows) return [];

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Récupère un client externe par son identifiant.
   * Retourne null si introuvable ou si la DB externe est indisponible.
   */
  async findOne(id: string): Promise<ExternalClient | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const c = this.columns;
    const sql = `
      SELECT *
      FROM "${c.tableName}"
      WHERE "${c.id}" = $1
      LIMIT 1
    `;

    const rows = await this.executeQuery<Record<string, any>>(sql, [id]);
    if (!rows || rows.length === 0) return null;

    return this.mapRow(rows[0]);
  }
}
