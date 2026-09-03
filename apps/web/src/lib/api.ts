const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new ApiError(error.message || error.error || `HTTP ${response.status}`, response.status);
  }

  return response.json();
}

// Events API
export const eventsApi = {
  list: () => fetchApi('/api/v2/events'),
  get: (id: string) => fetchApi(`/api/v2/events/${id}`),
  create: (data: any) => fetchApi('/api/v2/events', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => fetchApi(`/api/v2/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi(`/api/v2/events/${id}`, { method: 'DELETE' }),
  updateStatus: (id: string, status: string, reason?: string) => 
    fetchApi(`/api/v2/events/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
};

// Guests API
export const guestsApi = {
  list: (eventId: string, params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? new URLSearchParams(params as any).toString() : '';
    return fetchApi(`/api/v2/events/${eventId}/guests?${query}`);
  },
  create: (eventId: string, data: any) => 
    fetchApi(`/api/v2/events/${eventId}/guests`, { method: 'POST', body: JSON.stringify(data) }),
  checkin: (guestId: string) => 
    fetchApi(`/api/v2/guests/${guestId}/checkin`, { method: 'POST' }),
  checkinByCpf: (cpf: string) => 
    fetchApi(`/api/v2/checkin/cpf/${cpf}`, { method: 'POST' }),
};

// Venues API
export const venuesApi = {
  list: () => fetchApi('/api/v2/venues'),
  create: (data: any) => fetchApi('/api/v2/venues', { method: 'POST', body: JSON.stringify(data) }),
};

// Degustação API
export const degustacoesApi = {
  list: (params?: { visibility?: string; from?: string; to?: string }) => {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchApi(`/api/v2/degustacoes${query}`);
  },
  get: (id: string) => fetchApi(`/api/v2/degustacoes/${id}`),
  create: (data: any) => fetchApi('/api/v2/degustacoes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => fetchApi(`/api/v2/degustacoes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createLink: (id: string, userpEntidadeId: number) =>
    fetchApi(`/api/v2/degustacoes/${id}/links`, { method: 'POST', body: JSON.stringify({ userpEntidadeId }) }),
  listLinks: (id: string) => fetchApi(`/api/v2/degustacoes/${id}/links`),
  deleteLink: (id: string, linkId: string) =>
    fetchApi(`/api/v2/degustacoes/${id}/links/${linkId}`, { method: 'DELETE' }),
  updateLinkGuests: (id: string, linkId: string, nomes: string[]) =>
    fetchApi(`/api/v2/degustacoes/${id}/links/${linkId}/guests`, { method: 'PATCH', body: JSON.stringify({ nomes }) }),
  updateLinkNotes: (id: string, linkId: string, notes: string | null) =>
    fetchApi(`/api/v2/degustacoes/${id}/links/${linkId}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  getLeadInfo: (id: string, linkId: string) =>
    fetchApi(`/api/v2/degustacoes/${id}/links/${linkId}/lead-info`),
};

// Link público de degustação (sem sessão — o token na URL é a credencial)
export const degustacaoLinkApi = {
  get: (token: string) => fetchApi(`/api/v2/degustacao-link/${token}`),
  enroll: (token: string, nomes: string[]) =>
    fetchApi(`/api/v2/degustacao-link/${token}/guests`, { method: 'POST', body: JSON.stringify({ nomes }) }),
};

// Auth API
export const authApi = {
  login: (email: string, cpf: string) => 
    fetchApi('/api/v2/auth/login', { method: 'POST', body: JSON.stringify({ email, cpf }) }),
  me: () => fetchApi('/api/v2/auth/me'),
  logout: () => fetchApi('/api/v2/auth/logout', { method: 'DELETE' }),
};

// AI Chat API (assistente de dados no dashboard)
export const aiChatApi = {
  listThreads: () => fetchApi('/api/v2/ai-chat/threads'),
  createThread: () => fetchApi('/api/v2/ai-chat/threads', { method: 'POST' }),
  deleteThread: (id: string) => fetchApi(`/api/v2/ai-chat/threads/${id}`, { method: 'DELETE' }),
  listMessages: (threadId: string) => fetchApi(`/api/v2/ai-chat/threads/${threadId}/messages`),
  sendMessage: (threadId: string, content: string) =>
    fetchApi(`/api/v2/ai-chat/threads/${threadId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
};

// Freelancer API
export const freelancerApi = {
  jobs: () => fetchApi('/api/v2/freelancer/jobs'),
  applications: () => fetchApi('/api/v2/freelancer/applications'),
  apply: (jobId: string) => 
    fetchApi(`/api/v2/freelancer/jobs/${jobId}/apply`, { method: 'POST', body: JSON.stringify({}) }),
  cancelApplication: (id: string) =>
    fetchApi(`/api/v2/freelancer/applications/${id}/cancel`, { method: 'PATCH' }),
  profile: () => fetchApi('/api/v2/freelancer/profile'),
  updatePhoto: (fotoBase64: string) =>
    fetchApi('/api/v2/freelancer/profile/photo', { method: 'PATCH', body: JSON.stringify({ fotoBase64 }) }),
};

// Products/Categories from UERP
export const uerpApi = {
  products: () => fetchApi('/api/v2/products'),
  categories: () => fetchApi('/api/v2/categories'),
};

// Reports API
export const reportsApi = {
  summary: (params?: { from?: string; to?: string }) => {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchApi(`/api/v2/reports/summary${query}`);
  },
  events: (params?: { from?: string; to?: string; status?: string }) => {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchApi(`/api/v2/reports/events${query}`);
  },
  freelancers: () => fetchApi('/api/v2/reports/freelancers'),
  nps: () => fetchApi('/api/v2/reports/nps'),
};

// Admin API
export const adminApi = {
  users: () => fetchApi('/api/v2/admin/users'),
  createUser: (data: any) => fetchApi('/api/v2/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => fetchApi(`/api/v2/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => fetchApi(`/api/v2/admin/users/${id}`, { method: 'DELETE' }),
  employers: () => fetchApi('/api/v2/admin/employers'),
  createEmployer: (data: any) => fetchApi('/api/v2/admin/employers', { method: 'POST', body: JSON.stringify(data) }),
  deleteEmployer: (id: string) => fetchApi(`/api/v2/admin/employers/${id}`, { method: 'DELETE' }),
  auditLog: () => fetchApi('/api/v2/admin/audit-log'),
  penalties: () => fetchApi('/api/v2/admin/penalties'),
  teams: () => fetchApi('/api/v2/admin/teams'),
  createTeam: (data: any) => fetchApi('/api/v2/admin/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: string, data: any) => fetchApi(`/api/v2/admin/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTeam: (id: string) => fetchApi(`/api/v2/admin/teams/${id}`, { method: 'DELETE' }),
  userpUsuarios: () => fetchApi('/api/v2/admin/userp-usuarios'),
  importUserpUsers: (data: { users: any[]; employerId?: string }) => fetchApi('/api/v2/admin/import-userp-users', { method: 'POST', body: JSON.stringify(data) }),
};

// Teams API (for selection in forms)
export const teamsApi = {
  list: () => fetchApi('/api/v2/teams'),
};

// Venues API (extended)
export const venuesApiExtended = {
  list: () => fetchApi('/api/v2/venues'),
  get: (id: string) => fetchApi(`/api/v2/venues/${id}`),
  create: (data: any) => fetchApi('/api/v2/venues', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => fetchApi(`/api/v2/venues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi(`/api/v2/venues/${id}`, { method: 'DELETE' }),
};

// Event Applications API
export const applicationsApi = {
  list: (eventId: string) => fetchApi(`/api/v2/events/${eventId}/applications`),
  updateStatus: (id: string, status: 'approved' | 'rejected') =>
    fetchApi(`/api/v2/applications/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// Closure & NPS Organiz API
export const closureApi = {
  encerrar: (eventId: string, data: any) =>
    fetchApi(`/api/v2/events/${eventId}/encerrar`, { method: 'POST', body: JSON.stringify(data) }),
  getClosure: (eventId: string) => fetchApi(`/api/v2/events/${eventId}/closure`),
  getAttachment: (id: string) => fetchApi(`/api/v2/closure/attachments/${id}`),
  getNps: (eventId: string) => fetchApi(`/api/v2/events/${eventId}/nps-org`),
  getParkingEntries: (eventId: string) => fetchApi(`/api/v2/events/${eventId}/parking-entries`),
  getGiftEntries: (eventId: string) => fetchApi(`/api/v2/events/${eventId}/gift-entries`),
};

// Public NPS API (no auth)
export const npsOrgApi = {
  get: (token: string) => fetchApi(`/api/v2/nps-org/${token}`),
  submit: (token: string, data: any) =>
    fetchApi(`/api/v2/nps-org/${token}`, { method: 'POST', body: JSON.stringify(data) }),
};
