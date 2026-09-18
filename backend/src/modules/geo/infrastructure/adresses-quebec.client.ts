import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin client for the official Québec geocoder (Adresses Québec, MRNF —
 * open data CC-BY 4.0, exposed as an Esri GeocodeServer).
 *
 *   suggest              → as-you-type suggestions (text + magicKey)
 *   findAddressCandidates → candidates with civic parts, postal code, lat/lng
 *
 * Never throws: network or parse failures are logged and yield an empty list.
 */

export interface AqSuggestion {
  text: string;
  magicKey: string;
}

export interface AqCandidate {
  address: string;
  score: number;
  addrType: string;
  latitude: number;
  longitude: number;
  postalCode: string | null;
  city: string | null;
  odonyme: string | null;
  civicNumber: number | null;
  civicSuffix: string | null;
  unit: string | null;
  orientation: string | null;
}

interface RawCandidate {
  address?: string;
  score?: number;
  attributes?: Record<string, unknown>;
  location?: { x?: number; y?: number };
}

@Injectable()
export class AdressesQuebecClient {
  private readonly logger = new Logger(AdressesQuebecClient.name);

  static readonly BASE =
    'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/Adresse_Geocodage/GeocodeServer';
  private static readonly TIMEOUT_MS = 6000;

  async suggest(text: string, max = 6): Promise<AqSuggestion[]> {
    const url = new URL(`${AdressesQuebecClient.BASE}/suggest`);
    url.searchParams.set('text', text);
    url.searchParams.set('maxSuggestions', String(max));
    url.searchParams.set('f', 'json');
    const json = await this.get<{ suggestions?: Array<{ text?: string; magicKey?: string }> }>(url);
    return (json?.suggestions ?? [])
      .filter((s) => typeof s.text === 'string' && typeof s.magicKey === 'string')
      .map((s) => ({ text: s.text as string, magicKey: s.magicKey as string }));
  }

  async findCandidates(input: {
    singleLine: string;
    magicKey?: string;
    maxLocations?: number;
  }): Promise<AqCandidate[]> {
    const url = new URL(`${AdressesQuebecClient.BASE}/findAddressCandidates`);
    url.searchParams.set('SingleLine', input.singleLine);
    if (input.magicKey) url.searchParams.set('magicKey', input.magicKey);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('maxLocations', String(input.maxLocations ?? 3));
    url.searchParams.set('outSR', '4326');
    url.searchParams.set('f', 'json');
    const json = await this.get<{ candidates?: RawCandidate[] }>(url);
    return (json?.candidates ?? []).map(toCandidate).filter((c): c is AqCandidate => c !== null);
  }

  private async get<T>(url: URL): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(AdressesQuebecClient.TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Adresses Québec ${url.pathname} → HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(
        `Adresses Québec ${url.pathname} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

function toCandidate(raw: RawCandidate): AqCandidate | null {
  const a = raw.attributes ?? {};
  const lat = Number(a.Latitude ?? raw.location?.y);
  const lng = Number(a.Longitude ?? raw.location?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const str = (v: unknown): string | null => {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s ? s : null;
  };
  const num = Number(a.Num);
  return {
    address: String(raw.address ?? a.Match_addr ?? ''),
    score: Number(raw.score ?? a.Score ?? 0),
    addrType: String(a.Addr_type ?? ''),
    latitude: lat,
    longitude: lng,
    postalCode: str(a.ZIP),
    city: str(a.City),
    odonyme: str(a.Odonyme),
    civicNumber: Number.isFinite(num) && num > 0 ? num : null,
    civicSuffix: str(a.SufNum),
    unit: str(a.Unite),
    orientation: str(a.Dir),
  };
}
