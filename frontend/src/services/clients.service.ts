import api from './api';
import type {
  TemporaryClient,
  Client,
  ClientAddress,
  ClientType,
  ApiResponse,
} from '../types';

// ─── Shared ───────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UnifiedClient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  source: 'local' | 'external';
}

// ─── Legacy DTOs ──────────────────────────────────────────────────────────────

export interface CreateTemporaryClientDto {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
}

export interface UpdateTemporaryClientDto extends Partial<CreateTemporaryClientDto> {}

// ─── V3 DTOs ──────────────────────────────────────────────────────────────────

export interface CreateV3ClientDto {
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  clientType: ClientType;
  notes?: string;
  /** Optionally include addresses to be created atomically with the client. */
  addresses?: CreateClientAddressDto[];
}

export interface UpdateV3ClientDto extends Partial<Omit<CreateV3ClientDto, 'addresses' | 'companyName'>> {
  /** Pass `null` to clear the company name on an existing client. */
  companyName?: string | null;
}

export interface CreateClientAddressDto {
  streetNumber?: string;
  street: string;
  apartment?: string;
  city: string;
  postalCode?: string;
  province?: string;
  country?: string;
  addressType: string;
  label?: string;
  isDefault?: boolean;
  /** Values for the AddressTypeConfig.fields keyed by AddressTypeField.id */
  typeData?: Record<string, unknown>;
}

export interface UpdateClientAddressDto extends Partial<CreateClientAddressDto> {}

// ─── V3 Named Exports ─────────────────────────────────────────────────────────

export const getClients = (params?: {
  search?: string;
  clientType?: ClientType;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) => api.get('/clients', { params });

export const getClient = (id: string) => api.get(`/clients/${id}`);

export const createClient = (data: CreateV3ClientDto) =>
  api.post('/clients', data);

export const updateClient = (id: string, data: UpdateV3ClientDto) =>
  api.patch(`/clients/${id}`, data);

export const deleteClient = (id: string) => api.delete(`/clients/${id}`);

export const addClientAddress = (clientId: string, data: CreateClientAddressDto) =>
  api.post(`/clients/${clientId}/addresses`, data);

export const updateClientAddress = (
  clientId: string,
  addressId: string,
  data: UpdateClientAddressDto,
) => api.patch(`/clients/${clientId}/addresses/${addressId}`, data);

export const deleteClientAddress = (clientId: string, addressId: string) =>
  api.delete(`/clients/${clientId}/addresses/${addressId}`);

export const getAllAddresses = (search?: string) =>
  api.get('/clients/addresses/all', { params: search ? { search } : undefined });

/** Standalone address — no client linked. */
export const createStandaloneAddress = (data: CreateClientAddressDto) =>
  api.post('/clients/addresses', data);

/**
 * Update an address by id without knowing its client (works for orphan
 * addresses too). Pass `clientId: null` to detach, or a uuid to link/relink.
 */
export const updateAddressById = (
  addressId: string,
  data: UpdateClientAddressDto & { clientId?: string | null },
) => api.patch(`/clients/addresses/${addressId}`, data);

/** Delete an address by id (orphan or linked). */
export const deleteAddressById = (addressId: string) =>
  api.delete(`/clients/addresses/${addressId}`);

export const searchClients = (q: string) =>
  api.get('/clients/search', { params: { q } });

// ─── Legacy Service Object ────────────────────────────────────────────────────

const clientsService = {
  // ─── Temporary Clients (redirected to V3 /clients endpoints) ─────────────

  async findAllTemporary(params?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<TemporaryClient>> {
    const { data } = await api.get<ApiResponse<{ data: any[]; meta: any }>>(
      '/clients',
      { params },
    );
    const payload = data.data as any;
    // V3 returns { data: [...], meta: { page, limit, total, totalPages } }
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return {
        data: payload.data,
        total: payload.meta?.total ?? payload.data.length,
        page: payload.meta?.page ?? 1,
        limit: payload.meta?.limit ?? (params?.limit ?? 20),
        totalPages: payload.meta?.totalPages ?? 1,
      } as PaginatedResult<TemporaryClient>;
    }
    const arr = Array.isArray(payload) ? payload : [];
    return { data: arr, total: arr.length, page: 1, limit: arr.length, totalPages: 1 };
  },

  async findOneTemporary(id: string): Promise<TemporaryClient> {
    const { data } = await api.get<ApiResponse<TemporaryClient>>(`/clients/${id}`);
    return data.data;
  },

  async createTemporary(dto: CreateTemporaryClientDto): Promise<TemporaryClient> {
    const { data } = await api.post<ApiResponse<TemporaryClient>>('/clients', {
      ...dto,
      clientType: 'RESIDENTIAL', // default clientType for legacy temporary-client form
    });
    return data.data;
  },

  async updateTemporary(id: string, dto: UpdateTemporaryClientDto): Promise<TemporaryClient> {
    const { data } = await api.patch<ApiResponse<TemporaryClient>>(`/clients/${id}`, dto);
    return data.data;
  },

  async deleteTemporary(id: string): Promise<void> {
    await api.delete(`/clients/${id}`);
  },

  // ─── Unified Search ───────────────────────────────────────────────────────

  async searchUnified(q: string): Promise<UnifiedClient[]> {
    const { data } = await api.get<ApiResponse<UnifiedClient[]>>('/clients/search', {
      params: { q },
    });
    return data.data;
  },
};

export default clientsService;
