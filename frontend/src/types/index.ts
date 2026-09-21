// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Role {
  /** Platform-level administrator (SA). Inherits every ADMIN privilege. */
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DISPATCHER = 'DISPATCHER',
  TECHNICIAN = 'TECHNICIAN',
  /** B21 — end-customer portal account, linked to a Client record. */
  CLIENT = 'CLIENT',
}

export enum ClientType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
  INSTITUTIONAL = 'INSTITUTIONAL',
  /** B42 — donneur d'ordre : client pour qui nous sous-traitons. */
  PRINCIPAL = 'PRINCIPAL',
}

export enum AddressType {
  OFFICE = 'OFFICE',
  WAREHOUSE = 'WAREHOUSE',
  RESIDENCE = 'RESIDENCE',
  WORKSITE = 'WORKSITE',
}

export enum WorkOrderStatus {
  /** B21 — client-portal work request awaiting admin approval. */
  REQUESTED = 'REQUESTED',
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED_POSITIVE = 'COMPLETED_POSITIVE',
  COMPLETED_NEGATIVE = 'COMPLETED_NEGATIVE',
}

export enum WorkOrderType {
  INSTALLATION = 'INSTALLATION',
  REPAIR = 'REPAIR',
  MAINTENANCE = 'MAINTENANCE',
  INSPECTION = 'INSPECTION',
  OTHER = 'OTHER',
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  phone?: string | null;
  /** B46 — the mobile app requires location for this user (admin-managed, default true). */
  locationRequired?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserWithoutPassword = Omit<User, 'password'>;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthUser extends User {
  accessToken: string;
  refreshToken: string;
}

// ─── Client V3 ────────────────────────────────────────────────────────────────

/** B42 — référence légère au donneur d'ordre (sous-traitance). */
export interface PrincipalClientRef {
  id: string;
  firstName: string;
  lastName: string;
  companyName?: string | null;
  clientType?: ClientType;
}

/** Mobile device of a user as exposed by the device registry (never the push token). */
export interface MobileDevice {
  installationId: string;
  platform: 'IOS' | 'ANDROID';
  appVersion: string;
  osVersion: string | null;
  model: string | null;
  locale: string | null;
  hasPushToken: boolean;
  lastSeenAt: string;
  createdAt: string;
  revokedAt: string | null;
}

/** B44 — a coloured label defined by the admin (settings → tags). */
export interface Tag {
  id: string;
  name: string;
  color: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { workOrders: number; clients: number; addresses: number };
}

export interface ClientAddress {
  id: string;
  clientId: string | null;
  /** B44 */
  tags?: Tag[];
  streetNumber?: string | null;
  street: string;
  apartment?: string | null;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  // Free-form code matching AddressTypeConfig.code (was a strict enum, now configurable).
  addressType: string;
  label?: string | null;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
  /** B40 — provenance du géocodage. */
  geocodedAt?: string | null;
  geocodeSource?: 'adresses-quebec' | 'nominatim' | null;
  /** B40.2 — fiche propriété copiée du rôle d'évaluation au géocodage. */
  propertyMatchedAt?: string | null;
  propertyMatchedBy?: 'number+street' | 'nearest' | null;
  propertyMatricule?: string | null;
  propertyMunicipality?: string | null;
  propertyAddress?: string | null;
  propertyLandUseCode?: string | null;
  propertyLandUseLabel?: string | null;
  propertyDwellings?: number | null;
  propertyStoreys?: number | null;
  propertyYearBuilt?: number | null;
  propertyLandAreaM2?: number | null;
  propertyFloorAreaM2?: number | null;
  propertyLotNumbers?: string | null;
  propertyValueLand?: number | null;
  propertyValueBuilding?: number | null;
  propertyValueTotal?: number | null;
  propertyRollYear?: number | null;
  /** Free-form values for the AddressTypeConfig.fields keyed by fieldId. */
  typeData?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Address enrichie avec les infos du client associé — retournée par GET /clients/addresses/all.
 *  `client` peut être null pour les adresses orphelines (non rattachées). */
export interface ClientAddressWithClient extends ClientAddress {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    clientType: ClientType;
    isActive: boolean;
  } | null;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  /** B44 */
  tags?: Tag[];
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  clientType: ClientType;
  /** B42 — ce client est « client de » ce donneur d'ordre. */
  principalClientId?: string | null;
  principalClient?: PrincipalClientRef | null;
  /** B48 — email the client when their job is completed. */
  notifyOnCompletion?: boolean;
  notes?: string | null;
  isActive: boolean;
  addresses: ClientAddress[];
  /** B21 — portal accounts linked to this client (detail endpoint only). */
  portalUsers?: Array<{
    id: string;
    email: string;
    isActive: boolean;
    emailVerifiedAt: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskType {
  id: string;
  name: string;
  /// B10.2 — bilingual pair; legacy `name` kept for back-compat.
  nameFr?: string;
  nameEn?: string;
  prefix: string;
  description?: string | null;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  templateId?: string | null;
  template?: { id: string; name: string; nameFr?: string; nameEn?: string } | null;
  processDefinitionId?: string | null;
  processDefinition?: { id: string; name: string; isDefault?: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

// ── Work Order Templates (form builder) ────────────────────────────────────

export enum TemplateFieldType {
  // Texte
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  EMAIL = 'EMAIL',
  URL = 'URL',
  // Numérique
  NUMBER = 'NUMBER',          // legacy alias for FLOAT
  INTEGER = 'INTEGER',
  FLOAT = 'FLOAT',
  CURRENCY = 'CURRENCY',
  PERCENTAGE = 'PERCENTAGE',
  // Sélection
  CHECKBOX = 'CHECKBOX',
  SELECT = 'SELECT',
  MULTISELECT = 'MULTISELECT',
  RADIO = 'RADIO',
  // Date / heure
  DATE = 'DATE',
  TIME = 'TIME',
  DATETIME = 'DATETIME',
  // Téléphone / code postal
  PHONE = 'PHONE',
  PHONE_NA = 'PHONE_NA',
  POSTAL_CODE_CA = 'POSTAL_CODE_CA',
  // Géolocalisation
  GPS = 'GPS',
}

export interface TemplateField {
  id: string;
  sectionId: string;
  label: string;
  /// B10.2 — bilingual pair; legacy `label` kept for back-compat.
  labelFr?: string;
  labelEn?: string;
  fieldType: TemplateFieldType;
  placeholder?: string | null;
  helpText?: string | null;
  options?: string[] | null;
  sortOrder: number;
  /** Roles allowed to see this field. Empty means nobody (admin still bypasses). */
  viewRoles: Role[];
  /** Roles allowed to modify this field. */
  editRoles: Role[];
  /** Roles for which this field is required on submission. */
  requiredRoles: Role[];
}

export interface TemplateSection {
  id: string;
  templateId: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  sortOrder: number;
  /** Roles allowed to see this section. If a role can't see the section, all of
   *  its fields are hidden as well (admin still bypasses). */
  viewRoles: Role[];
  /** Roles allowed to edit this section (currently advisory — fields carry their own editRoles). */
  editRoles: Role[];
  fields: TemplateField[];
}

export interface WorkOrderTemplate {
  id: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  description?: string | null;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
  isActive: boolean;
  sections: TemplateSection[];
  _count?: { sections: number; taskTypes: number };
  createdAt: string;
  updatedAt: string;
}

export interface ClientTypeConfig {
  id: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  code: string;
  description?: string | null;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddressTypeConfigField {
  id: string;
  addressTypeConfigId: string;
  label: string;
  labelFr?: string;
  labelEn?: string;
  fieldType: TemplateFieldType;
  required: boolean;
  options?: string[] | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AddressTypeConfig {
  id: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  code: string;
  description?: string | null;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  predominantFieldId?: string | null;
  fields?: AddressTypeConfigField[];
  createdAt: string;
  updatedAt: string;
}

// ─── Client (legacy) ──────────────────────────────────────────────────────────

export interface TemporaryClient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalClient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

// ─── Work Order ───────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  content: string;
  workOrderId: string;
  authorId: string;
  author: Pick<User, 'id' | 'firstName' | 'lastName'>;
  createdAt: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  workOrderId: string;
  uploadedAt: string;
}

export interface WorkOrder {
  id: string;
  referenceNumber: string;
  /** B44 */
  tags?: Tag[];
  status: WorkOrderStatus;
  type: WorkOrderType;
  title: string;
  description?: string | null;
  priority: number;

  // Client
  temporaryClientId?: string | null;
  temporaryClient?: TemporaryClient | null;
  externalClientId?: string | null;
  externalClientName?: string | null;
  clientAddress?: string | null;

  // Assignation
  assignedToId?: string | null;
  assignedTo?: Pick<User, 'id' | 'firstName' | 'lastName' | 'phone'> | null;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'firstName' | 'lastName'>;

  // Scheduling
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;

  // Completion
  completionNotes?: string | null;
  negativeReason?: string | null;
  dispatchedAt?: string | null;

  // SLA (B4)
  slaTargetAt?: string | null;
  slaBreachedAt?: string | null;

  // V3 client / task-type relations
  clientId?: string | null;
  client?: Client | null;
  clientAddressId?: string | null;
  clientAddress_rel?: ClientAddress | null;
  /** B42 — sous-traitance : BT exécuté chez `client`, mandaté par `principalClient`. */
  principalClientId?: string | null;
  principalClient?: PrincipalClientRef | null;
  taskTypeId?: string | null;
  taskType?: TaskType | null;

  // Process engine
  currentStepId?: string | null;
  currentStep?: ProcessStatus | null;
  processDefinitionId?: string | null;
  processDefinition?: { id: string; name: string; version: number } | null;

  createdAt: string;
  updatedAt: string;

  notes?: Note[];
  attachments?: Attachment[];
  _count?: { notes: number; attachments: number };
}

// ─── Appointment ─────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  technicianId?: string | null;
  workOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  type: 'appointment' | 'work_order';
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  technicianId?: string | null;
  technicianName?: string | null;
  workOrderId?: string | null;
  status?: string | null;
  color?: string | null;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface TechnicianStat {
  id: string;
  name: string;
  activeWorkOrders: number;
  completedToday: number;
}

export interface AdminStats {
  workOrdersByStatus: { status: string; count: number }[];
  workOrdersToday: number;
  /** B21 — client-portal requests awaiting approval. */
  pendingRequests?: number;
  workOrdersThisWeek: number;
  overdueWorkOrders: number;
  technicianStats: TechnicianStat[];
  recentWorkOrders: WorkOrder[];
}

export interface TechnicianStats {
  myActiveWorkOrders: number;
  myCompletedToday: number;
  myCompletedThisWeek: number;
  myUpcoming: WorkOrder[];
  myOverdue: number;
}

// ─── Unified Client ───────────────────────────────────────────────────────────

export interface UnifiedClient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  source: 'local' | 'external';
}

// ── Process Engine Types ──────────────────────────────────────────────────────

export interface ProcessDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  statuses?: ProcessStatus[];
  transitions?: ProcessTransitionDef[];
  _count?: { statuses: number; transitions: number };
}

export interface ProcessStatus {
  id: string;
  processDefinitionId: string;
  code: number;
  name: string;
  nameFr?: string;
  nameEn?: string;
  color: string;
  position: number;
  isInitial: boolean;
  isDispatch: boolean;
  isStart: boolean;
  isTerminalPositive: boolean;
  isTerminalNegative: boolean;
  /** B21 — pre-approval step for client-portal work requests. */
  isRequested?: boolean;
}

export interface ProcessTransitionDef {
  id: string;
  processDefinitionId: string;
  fromStatusId: string;
  toStatusId: string;
  fromStatus?: { id: string; code: number; name: string; nameFr?: string; nameEn?: string; color: string };
  toStatus?: { id: string; code: number; name: string; nameFr?: string; nameEn?: string; color: string };
  label: string;
  labelFr?: string;
  labelEn?: string;
  allowedRoles: string[];
  requiredFields: string[];
  sortOrder: number;
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

// ─── API Helpers ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

// FIX 4 — backend returns { data: T[], meta: { page, limit, total, totalPages } }
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WorkOrderFilters {
  /** B44 — any of these tags (sent comma-separated). */
  tagIds?: string[];
  principalClientId?: string;
  status?: WorkOrderStatus;
  type?: WorkOrderType;
  assignedToId?: string;
  clientId?: string;
  taskTypeId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  priorityMin?: number;
  search?: string;
  excludeCompleted?: boolean;
  slaBreached?: boolean;
  page?: number;
  limit?: number;
}
