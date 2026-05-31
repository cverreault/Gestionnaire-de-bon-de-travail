import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import calendarService, {
  GetEventsParams,
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../services/calendar.service';

export const CALENDAR_KEY = 'calendar';

export function useCalendarEvents(params: GetEventsParams) {
  return useQuery({
    queryKey: [CALENDAR_KEY, 'events', params],
    queryFn: () => calendarService.getEvents(params),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAppointmentDto) => calendarService.createAppointment(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CALENDAR_KEY] });
    },
  });
}

export function useUpdateAppointment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateAppointmentDto) => calendarService.updateAppointment(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CALENDAR_KEY] });
    },
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarService.deleteAppointment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CALENDAR_KEY] });
    },
  });
}
