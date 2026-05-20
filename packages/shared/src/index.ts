// ============================================
// Shared Types and Schemas
// ============================================

import { z } from 'zod';

// ============================================
// Enums
// ============================================

export const UserRole = {
  ADMIN: 'admin',
  EVENT_OWNER: 'event_owner',
  OPERATOR: 'operator',
  FREELANCER: 'freelancer',
} as const;

export const EventStatus = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const GuestStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DECLINED: 'declined',
  WAITLISTED: 'waitlisted',
  CHECKED_IN: 'checked_in',
} as const;

export const ApplicationStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export const PenaltySeverity = {
  LIGHT: 'light',
  MEDIUM: 'medium',
  GRAVE: 'grave',
} as const;

export const QuestionType = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  CHECKBOX: 'checkbox',
  DATE: 'date',
  NUMBER: 'number',
} as const;

// ============================================
// Zod Schemas
// ============================================

export const CreateEventSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().min(1),
  venueIds: z.array(z.string()).optional(),
  setupAt: z.string().datetime().optional(),
  startAt: z.string().datetime().optional(),
  teardownAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const UpdateEventSchema = CreateEventSchema.partial();

export const CreateGuestSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  email: z.string().email().optional(),
  isMinor: z.boolean().default(false),
  responsibleName: z.string().optional(),
});

export const UpdateGuestSchema = CreateGuestSchema.partial();

export const LoginSchema = z.object({
  email: z.string().email(),
  cpf: z.string(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'event_owner', 'operator']),
  employerId: z.string().optional(),
});

export const CreateVenueSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
});

export const CreatePlanQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date', 'number']),
  required: z.boolean().default(false),
  order: z.number().int(),
  productId: z.string().optional(),
});

export const CreatePenaltySchema = z.object({
  reason: z.string().min(1),
  severity: z.enum(['light', 'medium', 'grave']),
  eventId: z.string().optional(),
});

export const SubmitNPSSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type CreateGuestInput = z.infer<typeof CreateGuestSchema>;
export type UpdateGuestInput = z.infer<typeof UpdateGuestSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;
export type CreatePlanQuestionInput = z.infer<typeof CreatePlanQuestionSchema>;
export type CreatePenaltyInput = z.infer<typeof CreatePenaltySchema>;
export type SubmitNPSInput = z.infer<typeof SubmitNPSSchema>;

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
