import type {
  AiMemoryStatus,
  AuthResponse,
  MeResponse,
  OnboardingInput,
  UpdateAiMemoryInput,
  UpdateProfileInput,
} from '@vently/shared';
import { api } from './client';

export interface LoginPayload {
  email: string;
  password: string;
}

export type RegisterPayload = LoginPayload;

export function register(body: RegisterPayload) {
  return api<AuthResponse>('/auth/register', { method: 'POST', body });
}

export function login(body: LoginPayload) {
  return api<AuthResponse>('/auth/login', { method: 'POST', body });
}

export function logout() {
  return api<void>('/auth/logout', { method: 'POST' });
}

export function getMe() {
  return api<MeResponse>('/me');
}

export function upsertProfile(body: OnboardingInput) {
  return api<MeResponse['profile']>('/me/profile', { method: 'PUT', body });
}

export function updateProfile(body: UpdateProfileInput) {
  return api<MeResponse['profile']>('/me/profile', { method: 'PATCH', body });
}

export function getAiMemoryStatus() {
  return api<AiMemoryStatus>('/me/ai-memory');
}

export function updateAiMemory(body: UpdateAiMemoryInput) {
  return api<AiMemoryStatus>('/me/ai-memory', { method: 'PATCH', body });
}

export function clearAiMemory() {
  return api<void>('/me/ai-memory', { method: 'DELETE' });
}
