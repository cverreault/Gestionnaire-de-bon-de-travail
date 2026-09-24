/**
 * Shapes of the backend responses the mobile app consumes (B38.2, first slice).
 * Mirror of the frontend types; kept minimal and UI-free.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN' | 'CLIENT';

export type WorkOrderStatus =
  | 'REQUESTED' | 'CREATED' | 'ASSIGNED' | 'DISPATCHED' | 'EN_ROUTE' | 'IN_PROGRESS'
  | 'COMPLETED_POSITIVE' | 'COMPLETED_NEGATIVE' | 'CANCELLED';

export const ACTIVE_STATUSES: WorkOrderStatus[] = ['ASSIGNED', 'DISPATCHED', 'EN_ROUTE', 'IN_PROGRESS'];

/** B54 — statuses that close a work order (nothing editable any more). */
export const CLOSED_STATUSES: WorkOrderStatus[] = ['COMPLETED_POSITIVE', 'COMPLETED_NEGATIVE', 'CANCELLED'];
export const isClosedStatus = (status: WorkOrderStatus): boolean => CLOSED_STATUSES.includes(status);

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string | null;
  /** B46 — the app refuses to work without location permission unless the admin exempted the user. */
  locationRequired?: boolean;
  preferences?: { locale?: 'fr' | 'en'; theme?: 'light' | 'dark' | 'system'; gps?: { enabled?: boolean } } | null;
}

export type LoginResponse =
  | { requires2fa: true; pendingToken: string; userId: string }
  | { accessToken: string; refreshToken: string; user: AuthUser };

export interface TenantBranding {
  slug: string | null;
  name: string;
  logoUrl: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ClientRef {
  id: string;
  firstName: string;
  lastName: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  clientType?: string;
}

export interface ClientAddressRef {
  id: string;
  streetNumber?: string | null;
  street: string;
  apartment?: string | null;
  city: string;
  postalCode?: string | null;
  province?: string | null;
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  propertyLandUseLabel?: string | null;
  propertyYearBuilt?: number | null;
  propertyDwellings?: number | null;
  propertyStoreys?: number | null;
}

export interface ProcessStepRef {
  id: string;
  code: number;
  name: string;
  nameFr?: string | null;
  nameEn?: string | null;
  color: string;
  isTerminalPositive?: boolean;
  isTerminalNegative?: boolean;
  isCancelled?: boolean;
}

export interface NoteRef {
  id: string;
  content: string;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string } | null;
}

export interface AttachmentRef {
  id: string;
  fileName: string;
  /** B68 — user-given name ; show it instead of fileName when present. */
  title?: string | null;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface WorkOrderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  description?: string | null;
  status: WorkOrderStatus;
  priority: number;
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  updatedAt: string;
  client?: ClientRef | null;
  principalClient?: ClientRef | null;
  clientAddress?: string | null;
  clientAddress_rel?: ClientAddressRef | null;
  currentStepId?: string | null;
  currentStep?: ProcessStepRef | null;
  taskType?: { id: string; name: string; nameFr?: string | null; nameEn?: string | null; icon?: string | null } | null;
  notes?: NoteRef[];
}

export interface AvailableTransition {
  id: string;
  toStatusId: string;
  toStatusCode: number;
  toStatusName: string;
  toStatusColor: string;
  label: string;
  requiredFields: string[];
  sortOrder: number;
}

export interface AvailableTransitionsResponse {
  workOrderId: string;
  currentStepId: string | null;
  adminBypass: boolean;
  transitions: AvailableTransition[];
}

export interface TransitionDto {
  targetStepId: string;
  negativeReason?: string;
  completionNotes?: string;
  /** Optimistic lock (ADR-016): the server answers 409 OPTIMISTIC_LOCK_CONFLICT when stale. */
  expectedUpdatedAt?: string;
}
