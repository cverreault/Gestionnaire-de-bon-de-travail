import { Injectable, Logger } from '@nestjs/common';
import type {
  GeocodeInput,
  GeocodeResult,
  IGeocoder,
  PropertyFacts,
  PropertyLookupInput,
  ReverseGeocodeResult,
} from '../../../common/contracts/geocoder.contract';
import { PropertyService } from './property.service';
import { AdressesQuebecClient, type AqCandidate } from '../infrastructure/adresses-quebec.client';
import { NominatimClient, sleep } from '../infrastructure/nominatim.client';
import { formatPostalCode, isQuebec, parseCivicNumber, stripAccents } from './address-normalize';

export interface AddressSuggestion {
  text: string;
  /** Absent when the suggestion comes from the fuzzy candidate search: resolve by text. */
  magicKey?: string;
  /** Provider score for fuzzy entries (exact suggestions have none). */
  score?: number;
}

/** What the form receives when the user picks a suggestion. */
export interface ResolvedAddress {
  streetNumber: string | null;
  street: string;
  apartment: string | null;
  city: string;
  postalCode: string | null;
  province: 'QC';
  country: 'Canada';
  latitude: number;
  longitude: number;
  score: number;
  source: 'adresses-quebec';
}

const ORIENTATION_LABEL: Record<string, string> = {
  E: 'Est', O: 'Ouest', N: 'Nord', S: 'Sud', NE: 'Nord-Est', NO: 'Nord-Ouest', SE: 'Sud-Est', SO: 'Sud-Ouest',
};

/**
 * Address lookup (B40) : as-you-type suggestions and resolution through
 * Adresses Québec, plus the `IGeocoder` contract used by `clients` and
 * `dispatch-map` (Adresses Québec first, Nominatim as a fallback).
 */
@Injectable()
export class AddressLookupService implements IGeocoder {
  private readonly logger = new Logger(AddressLookupService.name);

  /** Above this score Adresses Québec is sure (observed: 100 on exact hits). */
  static readonly MIN_AQ_SCORE = 90;
  /**
   * Best-match floor: a fuzzy hit (missing « rue », typo) scores ~80–85 while a
   * wrong-town guess scores ~73–76. Accepted only when the civic number and
   * the municipality also match the input.
   */
  static readonly MIN_AQ_FUZZY_SCORE = 78;
  /** Candidates fetched for the fuzzy half of suggest(). */
  private static readonly SUGGEST_CANDIDATES = 6;

  constructor(
    private readonly aq: AdressesQuebecClient,
    private readonly nominatim: NominatimClient,
    private readonly properties: PropertyService,
  ) {}

  async findProperty(input: PropertyLookupInput): Promise<PropertyFacts | null> {
    try {
      return await this.properties.find(input);
    } catch (err) {
      this.logger.warn(`Property lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Best-match suggestions. Adresses Québec's `suggest` only matches when the
   * street generic is typed (« 669 rue principale » yes, « 669 principale » no),
   * while `findAddressCandidates` is fuzzy. We run both and merge: exact
   * suggestions first, then fuzzy candidates above the floor, de-duplicated.
   */
  async suggest(q: string, max = 6): Promise<AddressSuggestion[]> {
    const text = q.trim();
    if (text.length < 3) return [];
    const [exact, fuzzy] = await Promise.all([
      this.aq.suggest(text, max),
      this.aq.findCandidates({ singleLine: text, maxLocations: AddressLookupService.SUGGEST_CANDIDATES }),
    ]);
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    const push = (item: AddressSuggestion) => {
      const key = stripAccents(item.text.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    exact.forEach(push);
    fuzzy
      .filter((c) => c.score >= AddressLookupService.MIN_AQ_FUZZY_SCORE && c.address)
      .sort((a, b) => b.score - a.score)
      .forEach((c) => push({ text: c.address, score: c.score }));
    return out.slice(0, max);
  }

  async resolve(text: string, magicKey?: string): Promise<ResolvedAddress | null> {
    const candidates = await this.aq.findCandidates({ singleLine: text, magicKey, maxLocations: 1 });
    const best = candidates[0];
    if (!best || best.score < AddressLookupService.MIN_AQ_SCORE) return null;
    return toResolved(best);
  }

  /** B57 — nearest address to a point (Nominatim ; Adresses Québec has no reverse API). */
  async reverse(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null> {
    const hit = await this.nominatim.reverse(latitude, longitude);
    return hit ? { ...hit, source: 'nominatim' } : null;
  }

  async geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
    if (isQuebec(input.province) && (input.country ?? 'Canada').toLowerCase().includes('canada')) {
      const hit = await this.geocodeQuebec(input);
      if (hit) return hit;
      // Polite pacing before the fallback provider.
      await sleep(1100);
    }
    return this.geocodeNominatim(input);
  }

  private async geocodeQuebec(input: GeocodeInput): Promise<GeocodeResult | null> {
    const number = input.streetNumber?.trim() ?? '';
    const singleLine = [
      [number, input.street].filter(Boolean).join(' '),
      [input.city, input.postalCode?.replace(/\s+/g, '')].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ');
    const candidates = await this.aq.findCandidates({ singleLine, maxLocations: 5 });
    const wanted = parseCivicNumber(number);
    const wantedCity = normalizeCity(input.city);
    const best = candidates.find((c) => {
      const numberOk = wanted === null || c.civicNumber === wanted;
      if (!numberOk) return false;
      if (c.score >= AddressLookupService.MIN_AQ_SCORE) return true;
      // Best match: fuzzy score is enough when number AND municipality agree.
      return (
        c.score >= AddressLookupService.MIN_AQ_FUZZY_SCORE &&
        wanted !== null &&
        wantedCity !== '' &&
        normalizeCity(c.city) === wantedCity
      );
    });
    if (!best) return null;
    return {
      latitude: best.latitude,
      longitude: best.longitude,
      source: 'adresses-quebec',
      score: best.score,
      postalCode: formatPostalCode(best.postalCode),
    };
  }

  private async geocodeNominatim(input: GeocodeInput): Promise<GeocodeResult | null> {
    // Most specific first, then degrade — Nominatim often misses exact civic
    // numbers in rural areas but knows the street.
    const country = input.country ?? 'Canada';
    const attempts = [
      [input.streetNumber, input.street, input.city, input.province, input.postalCode, country],
      [input.street, input.city, input.province, country],
      [input.city, input.postalCode, input.province, country],
    ];
    for (let i = 0; i < attempts.length; i++) {
      const q = attempts[i].filter(Boolean).join(', ');
      if (!q) continue;
      const hit = await this.nominatim.search(q);
      if (hit) return { ...hit, source: 'nominatim' };
      if (i < attempts.length - 1) await sleep(1100);
    }
    this.logger.debug(`No geocode for "${input.street}, ${input.city}"`);
    return null;
  }
}

function toResolved(c: AqCandidate): ResolvedAddress {
  const orientation = c.orientation ? ORIENTATION_LABEL[c.orientation.toUpperCase()] ?? c.orientation : null;
  const odonyme = (c.odonyme ?? '').trim();
  // Adresses Québec sometimes already carries the orientation inside the
  // odonym (« Rue Jacques-Cartier Sud » + Dir « S ») — never append it twice.
  const alreadySuffixed =
    orientation !== null && odonyme.toLowerCase().endsWith(' ' + orientation.toLowerCase());
  const street = [odonyme, alreadySuffixed ? '' : orientation ?? ''].filter(Boolean).join(' ').trim() || c.address;
  const streetNumber =
    c.civicNumber !== null ? `${c.civicNumber}${c.civicSuffix ?? ''}` : null;
  return {
    streetNumber,
    street,
    apartment: c.unit,
    city: c.city ?? '',
    postalCode: formatPostalCode(c.postalCode),
    province: 'QC',
    country: 'Canada',
    latitude: c.latitude,
    longitude: c.longitude,
    score: c.score,
    source: 'adresses-quebec',
  };
}

/** « Sainte-Marthe » / « ste-marthe » → « sainte marthe » (accents, punctuation, common abbreviations). */
function normalizeCity(raw: string | null | undefined): string {
  if (!raw) return '';
  return stripAccents(raw.toLowerCase())
    .replace(/\bste?\b\.?/g, (m) => (m.startsWith('ste') ? 'sainte' : 'saint'))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
