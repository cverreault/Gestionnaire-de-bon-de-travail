import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clientsService from '../services/clients.service';
import {
  CreateTemporaryClientDto,
  UpdateTemporaryClientDto,
  CreateV3ClientDto,
  UpdateV3ClientDto,
  CreateClientAddressDto,
  UpdateClientAddressDto,
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  addClientAddress,
  updateClientAddress,
  deleteClientAddress,
  getAllAddresses,
  createStandaloneAddress,
  updateAddressById,
  deleteAddressById,
} from '../services/clients.service';
import type { Client, ClientAddress, ClientAddressWithClient, ClientType } from '../types';

export const CLIENTS_KEY = 'clients';
export const ADDRESSES_KEY = 'addresses';

// ─── Temporary Clients ────────────────────────────────────────────────────────

export function useTemporaryClients(params?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [CLIENTS_KEY, 'temporary', params],
    queryFn: () => clientsService.findAllTemporary(params),
  });
}

export function useTemporaryClient(id: string) {
  return useQuery({
    queryKey: [CLIENTS_KEY, 'temporary', id],
    queryFn: () => clientsService.findOneTemporary(id),
    enabled: !!id,
  });
}

export function useCreateTemporaryClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTemporaryClientDto) => clientsService.createTemporary(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useUpdateTemporaryClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateTemporaryClientDto) => clientsService.updateTemporary(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY, 'temporary', id] });
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useDeleteTemporaryClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientsService.deleteTemporary(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

// ─── Unified Search ───────────────────────────────────────────────────────────

export function useSearchUnifiedClients(q: string) {
  return useQuery({
    queryKey: [CLIENTS_KEY, 'unified', q],
    queryFn: () => clientsService.searchUnified(q),
    enabled: q.length >= 2,
  });
}

// ─── V3 Clients ───────────────────────────────────────────────────────────────

interface V3ClientsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface V3ClientsResponse {
  data: Client[];
  meta: V3ClientsMeta;
}

export function useV3Clients(params?: {
  search?: string;
  clientType?: ClientType;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [CLIENTS_KEY, 'v3', params],
    queryFn: async (): Promise<V3ClientsResponse> => {
      const res = await getClients(params);
      // Support both { success, data: { data, meta } } and flat array shapes
      const payload = res.data?.data ?? res.data;
      if (Array.isArray(payload)) {
        return {
          data: payload as Client[],
          meta: { page: 1, limit: payload.length, total: payload.length, totalPages: 1 },
        };
      }
      return payload as V3ClientsResponse;
    },
  });
}

export function useV3Client(id: string) {
  return useQuery({
    queryKey: [CLIENTS_KEY, 'v3', id],
    queryFn: async () => {
      const res = await getClient(id);
      return (res.data?.data ?? res.data) as Client;
    },
    enabled: !!id,
  });
}

export function useCreateV3Client() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateV3ClientDto) => {
      const res = await createClient(dto);
      return (res.data?.data ?? res.data) as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENTS_KEY] }),
  });
}

export function useUpdateV3Client() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateV3ClientDto }) => {
      const res = await updateClient(id, data);
      return (res.data?.data ?? res.data) as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENTS_KEY] }),
  });
}

export function useDeleteV3Client() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENTS_KEY] }),
  });
}

export function useAddClientAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, data }: { clientId: string; data: CreateClientAddressDto }) => {
      const res = await addClientAddress(clientId, data);
      return (res.data?.data ?? res.data) as ClientAddress;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}

export function useUpdateClientAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      addressId,
      data,
    }: {
      clientId: string;
      addressId: string;
      data: UpdateClientAddressDto;
    }) => {
      const res = await updateClientAddress(clientId, addressId, data);
      return (res.data?.data ?? res.data) as ClientAddress;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}

export function useDeleteClientAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, addressId }: { clientId: string; addressId: string }) =>
      deleteClientAddress(clientId, addressId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}

export function useCreateStandaloneAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateClientAddressDto) => {
      const res = await createStandaloneAddress(data);
      return (res.data?.data ?? res.data) as ClientAddress;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}

export function useUpdateAddressById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      addressId,
      data,
    }: {
      addressId: string;
      data: UpdateClientAddressDto & { clientId?: string | null };
    }) => {
      const res = await updateAddressById(addressId, data);
      return (res.data?.data ?? res.data) as ClientAddress;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}

export function useDeleteAddressById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (addressId: string) => deleteAddressById(addressId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ADDRESSES_KEY] });
    },
  });
}

export function useAllAddresses(search?: string) {
  return useQuery({
    queryKey: [ADDRESSES_KEY, 'all', search ?? ''],
    queryFn: async () => {
      const res = await getAllAddresses(search);
      return (res.data?.data ?? res.data) as ClientAddressWithClient[];
    },
  });
}
