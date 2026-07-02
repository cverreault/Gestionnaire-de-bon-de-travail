import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientType, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { parseCsv, stringifyCsv } from '../../common/csv/csv-utils';

/** Max upload size — protects against multi-MB CSVs of nonsense. */
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/**
 * Column mapping — the CSV files use human-readable French headers so a
 * tenant admin doesn't have to guess what `firstName` means. The import
 * parser accepts BOTH the friendly label AND the technical field name
 * (either the admin filled the modele in-place, or exported → tweaked →
 * re-imported).
 *
 * Adding a new column : add an entry here + handle it in the export /
 * import mapping below.
 */
interface CsvColumn<TKey extends string> {
  /** Header shown in the template + expected in the imported file. */
  label: string;
  /** Internal name used in the DB / DTO. */
  key: TKey;
  /** True → the import fails the row if the value is empty. */
  required?: boolean;
  /** Human-readable hint appended to the label (`Prénom (obligatoire)`). */
  hint?: string;
}

const CLIENT_COLUMNS = [
  { label: 'Prénom', key: 'firstName', required: true, hint: 'obligatoire' },
  { label: 'Nom', key: 'lastName', required: true, hint: 'obligatoire' },
  { label: 'Entreprise', key: 'companyName' },
  { label: 'Courriel', key: 'email' },
  { label: 'Téléphone', key: 'phone' },
  {
    label: 'Type de client',
    key: 'clientType',
    required: true,
    hint: 'RESIDENTIAL / COMMERCIAL / INDUSTRIAL / INSTITUTIONAL — ou en français : Résidentiel, Commercial, Industriel, Institutionnel',
  },
  { label: 'Notes', key: 'notes' },
] as const satisfies readonly CsvColumn<
  'firstName' | 'lastName' | 'companyName' | 'email' | 'phone' | 'clientType' | 'notes'
>[];
type ClientKey = (typeof CLIENT_COLUMNS)[number]['key'];

const ADDRESS_COLUMNS = [
  { label: 'Courriel client', key: 'clientEmail', required: true, hint: 'doit correspondre à un client existant' },
  { label: 'Numéro civique', key: 'streetNumber' },
  { label: 'Rue', key: 'street', required: true },
  { label: 'Appartement', key: 'apartment' },
  { label: 'Ville', key: 'city', required: true },
  { label: 'Code postal', key: 'postalCode', required: true },
  { label: 'Province', key: 'province' },
  { label: 'Pays', key: 'country' },
  { label: 'Type d\'adresse', key: 'addressType' },
  { label: 'Libellé', key: 'label' },
  { label: 'Par défaut', key: 'isDefault', hint: 'true / false / oui / non' },
] as const satisfies readonly CsvColumn<
  | 'clientEmail'
  | 'streetNumber'
  | 'street'
  | 'apartment'
  | 'city'
  | 'postalCode'
  | 'province'
  | 'country'
  | 'addressType'
  | 'label'
  | 'isDefault'
>[];
type AddressKey = (typeof ADDRESS_COLUMNS)[number]['key'];

/** Accept the enum keys OR their French labels. */
const CLIENT_TYPE_ALIASES: Record<string, ClientType> = {
  RESIDENTIAL: ClientType.RESIDENTIAL,
  RÉSIDENTIEL: ClientType.RESIDENTIAL,
  RESIDENTIEL: ClientType.RESIDENTIAL,
  COMMERCIAL: ClientType.COMMERCIAL,
  INDUSTRIAL: ClientType.INDUSTRIAL,
  INDUSTRIEL: ClientType.INDUSTRIAL,
  INSTITUTIONAL: ClientType.INSTITUTIONAL,
  INSTITUTIONNEL: ClientType.INSTITUTIONAL,
};

const CLIENT_TYPE_LABEL_FR: Record<ClientType, string> = {
  [ClientType.RESIDENTIAL]: 'Résidentiel',
  [ClientType.COMMERCIAL]: 'Commercial',
  [ClientType.INDUSTRIAL]: 'Industriel',
  [ClientType.INSTITUTIONAL]: 'Institutionnel',
};

/**
 * Bulk CSV import / export for clients and addresses (B7.11).
 *
 * ADMIN-only. Templates use human-readable French headers with the
 * required columns marked (« Prénom », « Nom », …). The parser accepts
 * either the French label or the internal key so re-importing an export
 * (or a template filled in mid-edit) always works.
 */
@ApiTags('Clients CSV')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('clients/csv')
export class ClientsCsvController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Templates ────────────────────────────────────────────────────

  @Get('template')
  @ApiOperation({ summary: 'Télécharger le modèle CSV pour les clients' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="clients-modele.csv"')
  clientsTemplate() {
    const example = [
      'Jean',
      'Tremblay',
      'Construction ABC inc.',
      'jean.tremblay@example.com',
      '514-555-0101',
      'Résidentiel',
      'Client VIP — préfère les interventions en avant-midi.',
    ];
    return csvDownload(templateHeader(CLIENT_COLUMNS), example);
  }

  @Get('addresses/template')
  @ApiOperation({ summary: 'Télécharger le modèle CSV pour les adresses' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="adresses-modele.csv"')
  addressesTemplate() {
    const example = [
      'jean.tremblay@example.com',
      '123',
      'rue Principale',
      '',
      'Montréal',
      'H2X 1Y5',
      'Québec',
      'Canada',
      'OFFICE',
      'Siège social',
      'oui',
    ];
    return csvDownload(templateHeader(ADDRESS_COLUMNS), example);
  }

  // ─── Export ───────────────────────────────────────────────────────

  @Get('export')
  @ApiOperation({ summary: 'Exporter tous les clients du tenant en CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="clients.csv"')
  async exportClients() {
    const clients = await this.prisma.client.findMany({
      select: {
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        clientType: true,
        notes: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const rows: (string | number | null)[][] = [CLIENT_COLUMNS.map((c) => c.label)];
    for (const c of clients) {
      rows.push([
        c.firstName,
        c.lastName,
        c.companyName ?? '',
        c.email ?? '',
        c.phone ?? '',
        CLIENT_TYPE_LABEL_FR[c.clientType],
        c.notes ?? '',
      ]);
    }
    return withBom(stringifyCsv(rows));
  }

  @Get('addresses/export')
  @ApiOperation({ summary: 'Exporter toutes les adresses du tenant en CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="adresses.csv"')
  async exportAddresses() {
    const addresses = await this.prisma.clientAddress.findMany({
      select: {
        streetNumber: true,
        street: true,
        apartment: true,
        city: true,
        postalCode: true,
        province: true,
        country: true,
        addressType: true,
        label: true,
        isDefault: true,
        client: { select: { email: true } },
      },
      orderBy: [{ city: 'asc' }, { street: 'asc' }],
    });
    const rows: (string | number | null)[][] = [ADDRESS_COLUMNS.map((c) => c.label)];
    for (const a of addresses) {
      rows.push([
        a.client?.email ?? '',
        a.streetNumber ?? '',
        a.street,
        a.apartment ?? '',
        a.city,
        a.postalCode,
        a.province ?? '',
        a.country ?? '',
        a.addressType ?? '',
        a.label ?? '',
        a.isDefault ? 'oui' : 'non',
      ]);
    }
    return withBom(stringifyCsv(rows));
  }

  // ─── Import ───────────────────────────────────────────────────────

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Importer un CSV de clients (transaction atomique)' })
  async importClients(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ imported: number; errors: RowError[] }> {
    const text = await validateAndDecodeCsv(file);
    const { rows, missing } = parseWithColumns(text, CLIENT_COLUMNS);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes : ${missing.map((c) => c.label).join(', ')}. Redémarrez avec le modèle fourni.`,
      );
    }
    if (rows.length === 0) {
      throw new BadRequestException('Le fichier ne contient aucune ligne de données.');
    }

    const errors: RowError[] = [];
    const seenEmails = new Set<string>();
    const toCreate: Array<{
      firstName: string;
      lastName: string;
      companyName?: string;
      email?: string;
      phone?: string;
      clientType: ClientType;
      notes?: string;
    }> = [];

    rows.forEach((r, idx) => {
      const line = idx + 2;
      const rowErrors: string[] = [];

      const firstName = r.firstName.trim();
      const lastName = r.lastName.trim();
      const email = r.email.trim().toLowerCase();
      const clientTypeInput = r.clientType.trim().toUpperCase();
      const clientType = CLIENT_TYPE_ALIASES[clientTypeInput];

      if (!firstName) rowErrors.push('Prénom obligatoire');
      if (!lastName) rowErrors.push('Nom obligatoire');
      if (!clientType) {
        rowErrors.push(
          `Type de client invalide (${r.clientType || 'vide'}) — valeurs acceptées : ${Object.keys(CLIENT_TYPE_LABEL_FR).join(', ')}`,
        );
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        rowErrors.push(`Courriel invalide (${email})`);
      }
      if (email && seenEmails.has(email)) {
        rowErrors.push(`Doublon courriel dans le CSV (${email})`);
      }

      if (rowErrors.length > 0) {
        errors.push({ line, message: rowErrors.join(' ; ') });
        return;
      }
      if (email) seenEmails.add(email);

      toCreate.push({
        firstName,
        lastName,
        companyName: r.companyName.trim() || undefined,
        email: email || undefined,
        phone: r.phone.trim() || undefined,
        clientType: clientType!,
        notes: r.notes.trim() || undefined,
      });
    });

    if (errors.length > 0) return { imported: 0, errors };

    await this.prisma.$transaction(async (tx) => {
      for (const c of toCreate) {
        await tx.client.create({ data: c });
      }
    });

    return { imported: toCreate.length, errors: [] };
  }

  @Post('addresses/import')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Importer un CSV d\'adresses (transaction atomique)' })
  async importAddresses(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ imported: number; errors: RowError[] }> {
    const text = await validateAndDecodeCsv(file);
    const { rows, missing } = parseWithColumns(text, ADDRESS_COLUMNS);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes : ${missing.map((c) => c.label).join(', ')}. Redémarrez avec le modèle fourni.`,
      );
    }
    if (rows.length === 0) {
      throw new BadRequestException('Le fichier ne contient aucune ligne de données.');
    }

    const clients = await this.prisma.client.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true },
    });
    const emailToClientId = new Map<string, string>();
    for (const c of clients) {
      if (c.email) emailToClientId.set(c.email.toLowerCase(), c.id);
    }

    const errors: RowError[] = [];
    const toCreate: Array<{
      clientId: string;
      streetNumber?: string;
      street: string;
      apartment?: string;
      city: string;
      postalCode: string;
      province?: string;
      country?: string;
      addressType?: string;
      label?: string;
      isDefault: boolean;
    }> = [];

    rows.forEach((r, idx) => {
      const line = idx + 2;
      const rowErrors: string[] = [];
      const email = r.clientEmail.trim().toLowerCase();
      const clientId = emailToClientId.get(email);
      if (!email) rowErrors.push('Courriel client obligatoire');
      else if (!clientId) rowErrors.push(`Courriel client inconnu (${email}) — créez le client d'abord`);
      if (!r.street.trim()) rowErrors.push('Rue obligatoire');
      if (!r.city.trim()) rowErrors.push('Ville obligatoire');
      if (!r.postalCode.trim()) rowErrors.push('Code postal obligatoire');

      if (rowErrors.length > 0) {
        errors.push({ line, message: rowErrors.join(' ; ') });
        return;
      }
      toCreate.push({
        clientId: clientId!,
        streetNumber: r.streetNumber.trim() || undefined,
        street: r.street.trim(),
        apartment: r.apartment.trim() || undefined,
        city: r.city.trim(),
        postalCode: r.postalCode.trim(),
        province: r.province.trim() || undefined,
        country: r.country.trim() || undefined,
        addressType: r.addressType.trim() || undefined,
        label: r.label.trim() || undefined,
        isDefault: /^(true|1|oui|yes|vrai)$/i.test(r.isDefault.trim()),
      });
    });

    if (errors.length > 0) return { imported: 0, errors };

    await this.prisma.$transaction(async (tx) => {
      for (const a of toCreate) {
        await tx.clientAddress.create({ data: a });
      }
    });

    return { imported: toCreate.length, errors: [] };
  }
}

interface RowError {
  line: number;
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function templateHeader<K extends string>(cols: readonly CsvColumn<K>[]): string[] {
  return cols.map((c) => c.label);
}

/**
 * Parse a CSV text against a column spec. Accepts either the French label
 * OR the internal key as the actual header name so users can freely
 * rename the columns as long as one of the two forms is preserved.
 */
function parseWithColumns<K extends string>(
  text: string,
  cols: readonly CsvColumn<K>[],
): { rows: Record<K, string>[]; missing: CsvColumn<K>[] } {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { rows: [], missing: [...cols] };
  }
  const headers = grid[0].map((h) => h.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((h, idx) => {
    headerIndex.set(h.toLowerCase(), idx);
  });

  const resolved: Record<K, number> = {} as Record<K, number>;
  const missing: CsvColumn<K>[] = [];
  for (const col of cols) {
    const idx =
      headerIndex.get(col.label.toLowerCase()) ??
      headerIndex.get(col.key.toLowerCase());
    if (idx === undefined) {
      missing.push(col);
    } else {
      resolved[col.key] = idx;
    }
  }
  if (missing.length > 0) {
    return { rows: [], missing };
  }

  const rows: Record<K, string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    if (raw.every((c) => c === '')) continue;
    const obj = {} as Record<K, string>;
    for (const col of cols) {
      const idx = resolved[col.key];
      obj[col.key] = (raw[idx] ?? '').trim();
    }
    rows.push(obj);
  }
  return { rows, missing: [] };
}

async function validateAndDecodeCsv(
  file: Express.Multer.File | undefined,
): Promise<string> {
  if (!file) {
    throw new BadRequestException('Aucun fichier reçu (champ « file »).');
  }
  if (file.size > MAX_CSV_BYTES) {
    throw new BadRequestException(
      `Le fichier dépasse ${MAX_CSV_BYTES / 1024 / 1024} Mo.`,
    );
  }
  // Strip a UTF-8 BOM if present so Excel-exported files parse cleanly.
  let text = file.buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.includes(',')) {
    throw new BadRequestException(
      'Le fichier ne ressemble pas à un CSV (pas de séparateur virgule sur la 1ʳᵉ ligne). Vérifiez le format d\'export de votre tableur.',
    );
  }
  return text;
}

/**
 * UTF-8 BOM prefix so Excel opens the file with correct accent rendering.
 * `﻿` is (U+FEFF) — writing it as — the escape sequence \uFEFF
 * the source file is fragile because some editors strip or duplicate it.
 */
function withBom(csv: string): string {
  return '\uFEFF' + csv;
}

/** Header row + one example row, BOM-prefixed for Excel. */
function csvDownload(headers: string[], example: string[]): string {
  return withBom(stringifyCsv([headers, example]));
}
