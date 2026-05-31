import api from './api';
import type { Appointment, ApiResponse } from '../types';

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

export interface GetEventsParams {
  startDate?: string;
  endDate?: string;
  technicianId?: string;
  view?: string;
}

export interface CreateAppointmentDto {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  technicianId?: string;
  workOrderId?: string;
}

export interface UpdateAppointmentDto extends Partial<CreateAppointmentDto> {}

const calendarService = {
  async getEvents(params: GetEventsParams): Promise<CalendarEvent[]> {
    const { data } = await api.get<ApiResponse<{ events: CalendarEvent[]; warnings: string[] }>>('/calendar/events', { params });
    return data.data.events;
  },

  async createAppointment(dto: CreateAppointmentDto): Promise<Appointment> {
    const { data } = await api.post<ApiResponse<Appointment>>('/calendar/appointments', dto);
    return data.data;
  },

  async updateAppointment(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const { data } = await api.patch<ApiResponse<Appointment>>(
      `/calendar/appointments/${id}`,
      dto,
    );
    return data.data;
  },

  async deleteAppointment(id: string): Promise<void> {
    await api.delete(`/calendar/appointments/${id}`);
  },
};

export default calendarService;
