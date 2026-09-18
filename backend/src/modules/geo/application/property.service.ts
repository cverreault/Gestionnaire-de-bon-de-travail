import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { PropertyFacts, PropertyLookupInput } from '../../../common/contracts/geocoder.contract';
import {
  distanceMeters,
  normalizeStreet,
  parseCivicNumber,
  stripAccents,
} from './address-normalize';

/** Re-exported for the controller and specs; the shape lives in the contract. */
export type PropertySheet = PropertyFacts;
export type { PropertyLookupInput };

type Row = {
  idProvinc: string;
  addressSeq: number;
  codeMun: string;
  matricule: string;
  civicNumber: number | null;
  civicSuffix: string | null;
  civicNumberEnd: number | null;
  streetGeneric: string | null;
  streetLink: string | null;
  streetName: string;
  streetNorm: string;
  orientation: string | null;
  unitNumber: string | null;
  latitude: number;
  longitude: number;
  landUseCode: string | null;
  yearBuilt: number | null;
  storeys: number | null;
  dwellings: number | null;
  landAreaM2: number | null;
  floorAreaM2: number | null;
  valueLand: number | null;
  valueBuilding: number | null;
  valueTotal: number | null;
  lotNumbers: string | null;
  rollYear: number;
};

/**
 * Matches an address to a unit of the georeferenced assessment roll.
 *
 * With coordinates (the normal case after Adresses Québec geocoding) we
 * search a ~150 m box and score civic number + street; without them we
 * fall back to municipality name + street + number. `property_units` is
 * platform-wide reference data, so no tenant scoping applies.
 */
@Injectable()
export class PropertyService {
  /** Half-side of the search box, in degrees (~150 m). */
  private static readonly BOX_DEG = 0.0015;
  /** Nearest-point fallback only within this radius. */
  private static readonly NEAREST_MAX_M = 40;

  constructor(private readonly prisma: PrismaService) {}

  /** Looks up the client address (tenant-scoped by the Prisma middleware) then matches it. */
  async findForClientAddress(addressId: string): Promise<PropertySheet | null> {
    const addr = await this.prisma.clientAddress.findUnique({
      where: { id: addressId },
      select: { latitude: true, longitude: true, streetNumber: true, street: true, city: true },
    });
    if (!addr) return null;
    return this.find(addr);
  }

  async find(input: PropertyLookupInput): Promise<PropertySheet | null> {
    const wantedNumber = parseCivicNumber(input.streetNumber);
    const wantedStreet = normalizeStreet(input.street);

    let candidates: Row[] = [];
    const hasCoords =
      typeof input.latitude === 'number' && Number.isFinite(input.latitude) &&
      typeof input.longitude === 'number' && Number.isFinite(input.longitude);

    if (hasCoords) {
      const lat = input.latitude as number;
      const lng = input.longitude as number;
      candidates = await this.prisma.propertyUnit.findMany({
        where: {
          latitude: { gte: lat - PropertyService.BOX_DEG, lte: lat + PropertyService.BOX_DEG },
          longitude: { gte: lng - PropertyService.BOX_DEG, lte: lng + PropertyService.BOX_DEG },
        },
        take: 400,
      });
    } else if (wantedStreet && input.city) {
      const codes = await this.municipalityCodes(input.city);
      if (codes.length === 0) return null;
      candidates = await this.prisma.propertyUnit.findMany({
        where: {
          codeMun: { in: codes },
          streetNorm: wantedStreet,
          ...(wantedNumber !== null ? { civicNumber: wantedNumber } : {}),
        },
        take: 50,
      });
    }
    if (candidates.length === 0) return null;

    let best: { row: Row; score: number; dist: number | null; by: PropertySheet['matchedBy'] } | null = null;
    for (const row of candidates) {
      const dist = hasCoords
        ? distanceMeters(input.latitude as number, input.longitude as number, row.latitude, row.longitude)
        : null;
      const numberMatch =
        wantedNumber !== null &&
        (row.civicNumber === wantedNumber ||
          (row.civicNumber !== null && row.civicNumberEnd !== null &&
            row.civicNumber <= wantedNumber && wantedNumber <= row.civicNumberEnd));
      const streetMatch = wantedStreet !== '' && row.streetNorm === wantedStreet;
      const streetOverlap =
        !streetMatch && wantedStreet !== '' &&
        wantedStreet.split(' ').some((t) => t.length > 2 && row.streetNorm.split(' ').includes(t));

      let score = 0;
      if (numberMatch) score += 100;
      if (streetMatch) score += 50;
      else if (streetOverlap) score += 20;
      if (dist !== null) score -= dist / 10;
      // Prefer the unit without an apartment number (the building itself).
      if (!row.unitNumber) score += 1;

      const acceptable =
        (numberMatch && (streetMatch || streetOverlap || !wantedStreet)) ||
        (dist !== null && dist <= PropertyService.NEAREST_MAX_M);
      if (!acceptable) continue;
      const by: PropertySheet['matchedBy'] = numberMatch ? 'number+street' : 'nearest';
      if (!best || score > best.score) best = { row, score, dist, by };
    }
    if (!best) return null;

    const [municipality, landUse] = await Promise.all([
      this.prisma.municipality.findUnique({ where: { code: best.row.codeMun } }),
      best.row.landUseCode
        ? this.prisma.landUseCode.findUnique({ where: { code: best.row.landUseCode } })
        : Promise.resolve(null),
    ]);
    return toSheet(best.row, municipality?.name ?? best.row.codeMun, landUse?.label ?? null, best.by, best.dist);
  }

  private async municipalityCodes(city: string): Promise<string[]> {
    const wanted = stripAccents(city.trim().toLowerCase());
    if (!wanted) return [];
    // 1 100 rows — cheap to scan; avoids unaccent/trigram extensions.
    const all = await this.prisma.municipality.findMany({ select: { code: true, name: true } });
    return all
      .filter((m) => stripAccents(m.name.toLowerCase()) === wanted)
      .map((m) => m.code);
  }
}

function toSheet(
  r: Row,
  municipality: string,
  landUseLabel: string | null,
  matchedBy: PropertySheet['matchedBy'],
  dist: number | null,
): PropertySheet {
  const number = r.civicNumber !== null ? `${r.civicNumber}${r.civicSuffix ?? ''}` : '';
  const range = r.civicNumberEnd !== null && r.civicNumberEnd !== r.civicNumber ? `-${r.civicNumberEnd}` : '';
  const street = [r.streetGeneric, r.streetLink, titleCase(r.streetName), r.orientation]
    .filter(Boolean)
    .join(' ');
  return {
    matricule: r.matricule,
    municipality,
    address: `${number}${range} ${street}${r.unitNumber ? `, unité ${r.unitNumber}` : ''}`.trim(),
    landUseCode: r.landUseCode,
    landUseLabel,
    dwellings: r.dwellings,
    storeys: r.storeys,
    yearBuilt: r.yearBuilt,
    landAreaM2: r.landAreaM2,
    floorAreaM2: r.floorAreaM2,
    lotNumbers: r.lotNumbers ? r.lotNumbers.split(',').map((s) => s.trim()).filter(Boolean) : [],
    valueLand: r.valueLand,
    valueBuilding: r.valueBuilding,
    valueTotal: r.valueTotal,
    rollYear: r.rollYear,
    latitude: r.latitude,
    longitude: r.longitude,
    matchedBy,
    distanceMeters: dist === null ? null : Math.round(dist),
  };
}

/** `SAINT-DENIS` → `Saint-Denis` (accents are lost in the roll; nothing to restore). */
function titleCase(upper: string): string {
  return upper
    .toLowerCase()
    .replace(/(^|[\s\-'’])([a-z0-9])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
