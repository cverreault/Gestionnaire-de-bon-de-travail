import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type { Params as PinoParams } from 'nestjs-pino';

/**
 * Configuration du logger Pino — ADR-007 / C1.
 *
 * Objectifs :
 *  - Logs JSON structurés (parsable par Loki, Datadog, BetterStack)
 *  - Pretty-print en dev pour lisibilité humaine
 *  - Request ID propagé via header `x-request-id` (créé si absent)
 *  - Niveau configurable via env `LOG_LEVEL`
 *  - Redaction automatique des headers sensibles (Authorization, Cookie)
 *  - Pas de logging du corps des requêtes (risques RGPD / fuite secrets)
 */

const isProd = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');

export const loggerConfig: PinoParams = {
  pinoHttp: {
    level: logLevel,

    // ── Request ID — fourni par un proxy ou généré ici ──────────────────
    genReqId: (req: IncomingMessage) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) return headerId;
      return randomUUID();
    },

    // ── Pretty-print en dev, JSON brut en prod ──
    transport: isProd
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },

    // ── Redaction des champs sensibles ──
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.refreshToken',
        '*.accessToken',
      ],
      censor: '[REDACTED]',
    },

    // ── Endpoints à ne pas logguer (health checks) ──
    autoLogging: {
      ignore: (req) => {
        const url = req.url ?? '';
        return url === '/api/health' || url.startsWith('/health');
      },
    },

    // ── Sérialiseurs : ne garder que l'essentiel pour la lisibilité ──
    // Évite que chaque log fasse 2 KB de headers de sécurité Helmet.
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
          userAgent: req.headers?.['user-agent'],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  },
};
