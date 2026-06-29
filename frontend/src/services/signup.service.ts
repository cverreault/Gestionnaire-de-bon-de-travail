import api from './api';

export interface SignupPayload {
  slug: string;
  organizationName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SignupResponse {
  tenant: { id: string; slug: string; name: string };
  user: { id: string; email: string };
}

export async function signup(payload: SignupPayload): Promise<SignupResponse> {
  const { data } = await api.post<SignupResponse>('/signup', payload);
  return data;
}

export async function verifyEmail(token: string): Promise<{ userId: string }> {
  const { data } = await api.post<{ userId: string }>('/auth/verify-email', {
    token,
  });
  return data;
}
