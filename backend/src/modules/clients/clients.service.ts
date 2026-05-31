import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExternalClientService } from './external-client.service';
import { CreateClientDto, CreateClientAddressDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientAddressDto } from './dto/update-client-address.dto';
import { FindAllClientsDto } from './dto/search-client.dto';
import { PaginatedResponseDto } from './dto/client-response.dto';
import { UnifiedClientResult } from './types/external-client.interface';

/** Statuts de BT considérés comme terminés (non bloquants pour suppression) */
const COMPLETED_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED_POSITIVE,
  WorkOrderStatus.COMPLETED_NEGATIVE,
];

/** Projection partagée pour la liste paginée des clients */
const CLIENT_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  clientType: true,
  isActive: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  addresses: {
    where: { isDefault: true },
    select: {
      id: true,
      street: true,
      city: true,
      postalCode: true,
      province: true,
      addressType: true,
      label: true,
    },
    take: 1,
  },
  _count: { select: { workOrders: true } },
} as const;

/** Projection pour le détail d'un client (avec toutes ses adresses) */
const CLIENT_DETAIL_INCLUDE = {
  addresses: {
    orderBy: [
      { isDefault: 'desc' as const },
      { createdAt: 'asc' as const },
    ] as { isDefault?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc' }[],
  },
  _count: { select: { workOrders: true } },
};

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalClientService: ExternalClientService,
  ) {}

  // ── Clients enrichis — Queries ─────────────────────────────────────────────

  /**
   * Retourne une liste paginée de clients avec filtres optionnels.
   * La recherche ILIKE porte sur : prénom, nom, email.
   */
  async findAll(query: FindAllClientsDto): Promise<PaginatedResponseDto<any>> {
    const { search, clientType, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Construction dynamique du filtre WHERE
    const where: Record<string, any> = {};

    if (search) {
      const q = { contains: search, mode: 'insensitive' as const };
      where.OR = [
        { firstName:   q },
        { lastName:    q },
        { companyName: q },
        { email:       q },
        { phone:       q },
        { notes:       q },
        // Recherche aussi dans les adresses du client
        { addresses: { some: { streetNumber: q } } },
        { addresses: { some: { street:       q } } },
        { addresses: { some: { apartment:    q } } },
        { addresses: { some: { city:         q } } },
        { addresses: { some: { postalCode:   q } } },
        { addresses: { some: { province:     q } } },
        { addresses: { some: { label:        q } } },
      ];
    }

    if (clientType !== undefined) {
      where.clientType = clientType;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        select: CLIENT_LIST_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Retourne le détail complet d'un client (avec adresses et compteur de BT) */
  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: CLIENT_DETAIL_INCLUDE,
    });

    if (!client) {
      throw new NotFoundException(`Client #${id} introuvable`);
    }

    return client;
  }

  // ── Clients enrichis — Commands ────────────────────────────────────────────

  /**
   * Crée un nouveau client avec ses adresses en transaction atomique.
   * Si aucune adresse n'a isDefault=true, la première devient l'adresse par défaut.
   * Si plusieurs ont isDefault=true, une seule sera retenue (la première trouvée).
   */
  async create(dto: CreateClientDto) {
    return this.prisma.$transaction(async (tx) => {
      // Créer le client
      const client = await tx.client.create({
        data: {
          firstName:   dto.firstName,
          lastName:    dto.lastName,
          companyName: dto.companyName,
          email:       dto.email,
          phone:       dto.phone,
          clientType:  dto.clientType,
          notes:       dto.notes,
        },
      });

      // Créer les adresses si présentes
      if (dto.addresses && dto.addresses.length > 0) {
        const hasExplicitDefault = dto.addresses.some((a) => a.isDefault === true);
        let defaultAssigned = false;

        for (let i = 0; i < dto.addresses.length; i++) {
          const addr = dto.addresses[i];

          // Logique de sélection de l'adresse par défaut :
          // - Si une adresse est explicitement marquée default, on la respecte (première seulement)
          // - Sinon, la première adresse devient automatiquement la default
          let isDefault: boolean;
          if (hasExplicitDefault) {
            isDefault = addr.isDefault === true && !defaultAssigned;
          } else {
            isDefault = i === 0;
          }

          if (isDefault) defaultAssigned = true;

          await tx.clientAddress.create({
            data: {
              clientId:     client.id,
              streetNumber: addr.streetNumber,
              street:       addr.street,
              apartment:    addr.apartment,
              city:         addr.city,
              postalCode:   addr.postalCode,
              province:     addr.province,
              country:      addr.country,
              addressType:  addr.addressType,
              label:        addr.label,
              isDefault,
              latitude:     addr.latitude,
              longitude:    addr.longitude,
              typeData:     (addr.typeData ?? undefined) as Prisma.InputJsonValue | undefined,
            },
          });
        }
      }

      // Retourner le client complet avec ses adresses
      return tx.client.findUnique({
        where: { id: client.id },
        include: CLIENT_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Met à jour partiellement un client (pas les adresses).
   * Les adresses sont gérées via les routes dédiées.
   */
  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: dto,
      include: CLIENT_DETAIL_INCLUDE,
    });
  }

  /**
   * Désactive un client (soft delete : isActive = false).
   * Lève ConflictException si des BT actifs sont liés à ce client.
   */
  async softDelete(id: string) {
    await this.findOne(id);

    const activeWorkOrderCount = await this.prisma.workOrder.count({
      where: {
        clientId: id,
        status: { notIn: COMPLETED_STATUSES },
      },
    });

    if (activeWorkOrderCount > 0) {
      throw new ConflictException(
        `Impossible de désactiver ce client : ${activeWorkOrderCount} bon(s) de travail actif(s) y sont associés.`,
      );
    }

    return this.prisma.client.update({
      where: { id },
      data: { isActive: false },
      include: CLIENT_DETAIL_INCLUDE,
    });
  }

  // ── Adresses — Queries (toutes adresses) ──────────────────────────────────

  /**
   * Retourne toutes les adresses (toutes clients confondus) avec
   * les infos du client lié (firstName, lastName, email).
   */
  async findAllAddresses(search?: string) {
    const where: Record<string, any> = {};
    if (search && search.trim()) {
      const q = { contains: search.trim(), mode: 'insensitive' as const };
      where.OR = [
        { streetNumber: q },
        { street:       q },
        { apartment:    q },
        { city:         q },
        { postalCode:   q },
        { province:     q },
        { country:      q },
        { label:        q },
        { client: { firstName:   q } },
        { client: { lastName:    q } },
        { client: { companyName: q } },
        { client: { email:       q } },
        { client: { phone:       q } },
      ];
    }
    return this.prisma.clientAddress.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            clientType: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { client: { lastName: 'asc' } },
        { client: { firstName: 'asc' } },
        { isDefault: 'desc' },
      ],
    });
  }

  // ── Adresses — Commands ────────────────────────────────────────────────────

  /**
   * Crée une adresse "orpheline" — sans client associé.
   * Utile pour bâtir une bibliothèque d'emplacements (ex: campings, dépôts)
   * qu'on pourra ensuite rattacher à un client.
   */
  async createStandaloneAddress(dto: CreateClientAddressDto) {
    return this.prisma.clientAddress.create({
      data: {
        clientId:     null,
        streetNumber: dto.streetNumber,
        street:       dto.street,
        apartment:    dto.apartment,
        city:         dto.city,
        postalCode:   dto.postalCode,
        province:     dto.province,
        country:      dto.country,
        addressType:  dto.addressType,
        label:        dto.label,
        // An orphan address can't be the "default" address of a client, so we
        // ignore that flag at creation time.
        isDefault:    false,
        latitude:     dto.latitude,
        longitude:    dto.longitude,
        typeData:     (dto.typeData ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }


  /**
   * Ajoute une adresse à un client.
   * Si isDefault=true, toutes les adresses existantes sont préalablement passées à false.
   */
  async addAddress(clientId: string, dto: CreateClientAddressDto) {
    await this.findOne(clientId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.clientAddress.updateMany({
          where: { clientId },
          data: { isDefault: false },
        });
      }

      return tx.clientAddress.create({
        data: {
          clientId,
          streetNumber: dto.streetNumber,
          street:       dto.street,
          apartment:    dto.apartment,
          city:         dto.city,
          postalCode:   dto.postalCode,
          province:     dto.province,
          country:      dto.country,
          addressType:  dto.addressType,
          label:        dto.label,
          isDefault:    dto.isDefault ?? false,
          latitude:     dto.latitude,
          longitude:    dto.longitude,
          typeData:     (dto.typeData ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    });
  }

  /**
   * Met à jour partiellement une adresse.
   * Vérifie que l'adresse appartient bien au client.
   * Si isDefault=true, les autres adresses du client sont passées à false.
   */
  async updateAddress(
    clientId: string,
    addressId: string,
    dto: UpdateClientAddressDto,
  ) {
    const address = await this.prisma.clientAddress.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundException(
        `Adresse #${addressId} introuvable pour le client #${clientId}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        // Retirer le statut default des autres adresses
        await tx.clientAddress.updateMany({
          where: { clientId, NOT: { id: addressId } },
          data: { isDefault: false },
        });
      }

      return tx.clientAddress.update({
        where: { id: addressId },
        data: {
          ...dto,
          ...(dto.typeData !== undefined && {
            typeData: (dto.typeData ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          }),
        } as Prisma.ClientAddressUpdateInput,
      });
    });
  }

  /**
   * Supprime une adresse d'un client.
   * Contrôles préalables :
   * - L'adresse doit appartenir au client
   * - Ce ne doit pas être la dernière adresse du client
   * - Aucun BT actif ne doit référencer cette adresse
   */
  async deleteAddress(clientId: string, addressId: string) {
    const address = await this.prisma.clientAddress.findFirst({
      where: { id: addressId, clientId },
    });

    if (!address) {
      throw new NotFoundException(
        `Adresse #${addressId} introuvable pour le client #${clientId}`,
      );
    }

    // Interdire la suppression de la dernière adresse
    const addressCount = await this.prisma.clientAddress.count({
      where: { clientId },
    });

    if (addressCount <= 1) {
      throw new BadRequestException(
        "Impossible de supprimer la dernière adresse d'un client.",
      );
    }

    // Vérifier qu'aucun BT actif ne référence cette adresse
    const activeWorkOrderCount = await this.prisma.workOrder.count({
      where: {
        clientAddressId: addressId,
        status: { notIn: COMPLETED_STATUSES },
      },
    });

    if (activeWorkOrderCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer cette adresse : ${activeWorkOrderCount} bon(s) de travail actif(s) y sont liés.`,
      );
    }

    return this.prisma.clientAddress.delete({ where: { id: addressId } });
  }

  // ── Adresses — accès générique par id (sans clientId dans l'URL) ──────────

  /**
   * Met à jour une adresse par son id, sans dépendre d'un clientId d'URL.
   * Supporte :
   *  - les adresses orphelines (clientId actuel = null)
   *  - le changement de client (`dto.clientId` = nouvel UUID ou null pour détacher)
   *  - la gestion automatique du flag `isDefault` selon le client résultant
   */
  async updateAddressById(addressId: string, dto: UpdateClientAddressDto) {
    const existing = await this.prisma.clientAddress.findUnique({
      where: { id: addressId },
    });
    if (!existing) {
      throw new NotFoundException(`Adresse #${addressId} introuvable`);
    }

    // Si on change le client : vérifier que le nouveau client existe.
    const clientIdChange = dto.clientId !== undefined;
    const newClientId = clientIdChange ? dto.clientId : existing.clientId;
    if (clientIdChange && newClientId !== null) {
      const target = await this.prisma.client.findUnique({
        where: { id: newClientId as string },
        select: { id: true },
      });
      if (!target) {
        throw new NotFoundException(`Client #${newClientId} introuvable`);
      }
    }

    // Une adresse orpheline ne peut pas être marquée "isDefault".
    const effectiveIsDefault =
      newClientId === null ? false : dto.isDefault;

    return this.prisma.$transaction(async (tx) => {
      // Si on passe cette adresse en default, retirer le flag des autres
      // adresses du client courant.
      if (effectiveIsDefault === true && newClientId) {
        await tx.clientAddress.updateMany({
          where: { clientId: newClientId, NOT: { id: addressId } },
          data: { isDefault: false },
        });
      }

      // Extraire le clientId du dto (géré séparément ci-dessous).
      const { clientId: _ignored, isDefault: _ignored2, typeData, ...rest } = dto;
      void _ignored;
      void _ignored2;

      return tx.clientAddress.update({
        where: { id: addressId },
        data: {
          ...rest,
          ...(typeData !== undefined && {
            typeData: (typeData ?? Prisma.JsonNull) as
              | Prisma.InputJsonValue
              | typeof Prisma.JsonNull,
          }),
          ...(clientIdChange && {
            client:
              newClientId === null
                ? { disconnect: true }
                : { connect: { id: newClientId as string } },
          }),
          ...(effectiveIsDefault !== undefined && {
            isDefault: effectiveIsDefault,
          }),
        } as Prisma.ClientAddressUpdateInput,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              clientType: true,
              isActive: true,
            },
          },
        },
      });
    });
  }

  /**
   * Supprime une adresse par son id (orpheline ou rattachée).
   * Contrôles :
   *  - aucun BT actif ne doit y être rattaché
   *  - si l'adresse appartient à un client, ce ne doit pas être sa dernière
   */
  async deleteAddressById(addressId: string) {
    const address = await this.prisma.clientAddress.findUnique({
      where: { id: addressId },
    });
    if (!address) {
      throw new NotFoundException(`Adresse #${addressId} introuvable`);
    }

    if (address.clientId) {
      const count = await this.prisma.clientAddress.count({
        where: { clientId: address.clientId },
      });
      if (count <= 1) {
        throw new BadRequestException(
          "Impossible de supprimer la dernière adresse d'un client.",
        );
      }
    }

    const activeWorkOrderCount = await this.prisma.workOrder.count({
      where: {
        clientAddressId: addressId,
        status: { notIn: COMPLETED_STATUSES },
      },
    });
    if (activeWorkOrderCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer cette adresse : ${activeWorkOrderCount} bon(s) de travail actif(s) y sont liés.`,
      );
    }

    return this.prisma.clientAddress.delete({ where: { id: addressId } });
  }

  // ── Recherche unifiée ──────────────────────────────────────────────────────

  /**
   * Recherche simultanée dans les clients locaux (enrichis) et la base externe.
   * Retourne une liste fusionnée enrichie d'un champ `source` pour distinguer l'origine.
   * En cas d'indisponibilité de la base externe, les résultats locaux sont retournés seuls.
   */
  async searchUnified(q?: string): Promise<UnifiedClientResult[]> {
    const searchTerm = q?.trim() ?? '';

    const localWhere = searchTerm
      ? {
          isActive: true,
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' as const } },
            { lastName:  { contains: searchTerm, mode: 'insensitive' as const } },
            { email:     { contains: searchTerm, mode: 'insensitive' as const } },
          ],
        }
      : { isActive: true };

    const [localClients, externalClients] = await Promise.all([
      this.prisma.client.findMany({
        where: localWhere,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          addresses: {
            where: { isDefault: true },
            select: { street: true, city: true, postalCode: true },
            take: 1,
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 50,
      }),
      searchTerm
        ? this.externalClientService.search(searchTerm, 50)
        : this.externalClientService.findAll(50),
    ]);

    // Mapper les clients locaux vers le format unifié
    const localMapped: UnifiedClientResult[] = localClients.map((c) => {
      const defaultAddr = c.addresses?.[0];
      return {
        id:         c.id,
        firstName:  c.firstName,
        lastName:   c.lastName,
        email:      c.email ?? undefined,
        phone:      c.phone ?? undefined,
        address:    defaultAddr?.street ?? undefined,
        city:       defaultAddr?.city ?? undefined,
        postalCode: defaultAddr?.postalCode ?? undefined,
        metadata:   undefined,
        source:     'local' as const,
      };
    });

    // Mapper les clients externes vers le format unifié
    const externalMapped: UnifiedClientResult[] = externalClients.map((c) => ({
      ...c,
      source: 'external' as const,
    }));

    // Clients locaux en premier, puis externes
    return [...localMapped, ...externalMapped];
  }

  // ── Clients externes — Queries (lecture seule, compatibilité) ──────────────

  /** Recherche ou liste les clients de la base externe */
  async findAllExternal(search?: string, limit: number = 20) {
    if (search) {
      return this.externalClientService.search(search, limit);
    }
    return this.externalClientService.findAll(limit);
  }

  /** Retourne un client externe par son identifiant ou lève NotFoundException */
  async findOneExternal(id: string) {
    const client = await this.externalClientService.findOne(id);

    if (!client) {
      throw new NotFoundException(
        `Client externe #${id} introuvable ou base externe indisponible`,
      );
    }

    return client;
  }

  // ── Clients temporaires — Commands (rétrocompatibilité) ───────────────────

  // Les anciennes méthodes findAllTemporary / createTemporary / etc.
  // ne sont plus exposées via le controller principal mais les workOrders
  // peuvent encore référencer des TemporaryClient.
  // Si d'autres modules en ont besoin, les méthodes restent dans l'interface publique.
}
