import { Injectable, Logger } from '@nestjs/common';
import type {
  GeocodeInput,
  GeocodeResult,
  IGeocoder,
} from '../../../common/contracts/geocoder.contract';
import { AdressesQuebecClient, type AqCandidate } from '../infrastructure/adresses-quebec.client';
import { NominatimClient, sleep } from '../infrastructure/nominatim.client';
import { formatPostalCode, isQuebec, parseCivicNumber } from './address-normalize';

export interface AddressSuggestion {
  text: string;
  magicKey: string;
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

  /** Below this score Adresses Québec is guessing another town (observed: 73–76 on misses, 100 on hits). */
  static readonly MIN_AQ_SCORE = 90;

  constructor(
    private readonly aq: AdressesQuebecClient,
    private readonly nominatim: NominatimClient,
  ) {}

  async suggest(q: string, max = 6): Promise<AddressSuggestion[]> {
    const text = q.trim();
    if (text.length < 3) return [];
    return this.aq.suggest(text, max);
  }

  async resolve(text: string, magicKey?: string): Promise<ResolvedAddress | null> {
    const candidates = await this.aq.findCandidates({ singleLine: text, magicKey, maxLocations: 1 });
    const best = candidates[0];
    if (!best || best.score < AddressLookupService.MIN_AQ_SCORE) return null;
    return toResolved(best);
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
    const candidates = await this.aq.findCandidates({ singleLine, maxLocations: 3 });
    const wanted = parseCivicNumber(number);
    const best = candidates.find(
      (c) =>
        c.score >= AddressLookupService.MIN_AQ_SCORE &&
        (wanted === null || c.civicNumber === wanted),
    );
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
  const street = [c.odonyme ?? '', orientation ?? ''].filter(Boolean).join(' ').trim() || c.address;
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
