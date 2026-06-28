import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface SearchHit {
  type: 'workOrder' | 'client' | 'address';
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

export interface SearchResults {
  query: string;
  total: number;
  hits: SearchHit[];
}

/**
 * Service de recherche unifiée — interroge work_orders + clients +
 * client_addresses en parallèle et fusionne le résultat.
 *
 * Lit Prisma directement (pas d'import des services métier — respect
 * ADR-001 §3). Cap de 10 résultats par type pour rester rapide.
 */
@Injectable()
export class SearchService {
  private static readonly LIMIT_PER_TYPE = 10;

  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string): Promise<SearchResults> {
    const query = rawQuery.trim();
    if (query.length < 2) {
      return { query, total: 0, hits: [] };
    }

    const q: Prisma.StringFilter = { contains: query, mode: 'insensitive' };
    const limit = SearchService.LIMIT_PER_TYPE;

    // 3 reads en parallèle pour minimiser la latence.
    const [workOrders, clients, addresses] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: {
          OR: [
            { referenceNumber: q },
            { title: q },
            { externalClientName: q },
            { client: { firstName: q } },
            { client: { lastName: q } },
            { client: { companyName: q } },
          ],
        },
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          status: true,
          client: { select: { firstName: true, lastName: true, companyName: true } },
          externalClientName: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),

      this.prisma.client.findMany({
        where: {
          OR: [
            { firstName: q },
            { lastName: q },
            { companyName: q },
            { email: q },
            { phone: q },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
          clientType: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: limit,
      }),

      this.prisma.clientAddress.findMany({
        where: {
          OR: [
            { street: q },
            { city: q },
            { postalCode: q },
            { label: q },
          ],
        },
        select: {
          id: true,
          streetNumber: true,
          street: true,
          city: true,
          postalCode: true,
          label: true,
          client: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    // Mapping → format unifié pour le frontend.
    const hits: SearchHit[] = [
      ...workOrders.map((wo): SearchHit => {
        const clientName = wo.client
          ? (wo.client.companyName?.trim() ||
              `${wo.client.firstName} ${wo.client.lastName}`.trim())
          : wo.externalClientName?.trim() || null;
        return {
          type: 'workOrder',
          id: wo.id,
          title: `${wo.referenceNumber} · ${wo.title}`,
          subtitle: clientName ? `${clientName} · ${wo.status}` : wo.status,
          url: `/bons-de-travail/${wo.id}`,
        };
      }),

      ...clients.map((c): SearchHit => {
        const displayName = c.companyName?.trim() ||
          `${c.firstName} ${c.lastName}`.trim();
        const subtitleBits = [c.email, c.phone].filter(Boolean).join(' · ') || null;
        return {
          type: 'client',
          id: c.id,
          title: displayName,
          subtitle: subtitleBits,
          url: `/clients?focus=${c.id}`,
        };
      }),

      ...addresses.map((a): SearchHit => {
        const num = a.streetNumber ? `${a.streetNumber} ` : '';
        const line = `${num}${a.street}, ${a.city}`;
        const tail = a.postalCode ? ` ${a.postalCode}` : '';
        const clientName = a.client
          ? (a.client.companyName?.trim() ||
              `${a.client.firstName} ${a.client.lastName}`.trim())
          : null;
        return {
          type: 'address',
          id: a.id,
          title: line + tail,
          subtitle: [a.label, clientName].filter(Boolean).join(' · ') || null,
          url: '/adresses',
        };
      }),
    ];

    return { query, total: hits.length, hits };
  }
}
