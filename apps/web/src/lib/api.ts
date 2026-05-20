const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
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

// Auth API
export const authApi = {
  login: (email: string, cpf: string) => 
    fetchApi('/api/v2/auth/login', { method: 'POST', body: JSON.stringify({ email, cpf }) }),
  me: () => fetchApi('/api/v2/auth/me'),
  logout: () => fetchApi('/api/v2/auth/logout', { method: 'DELETE' }),
};

// Freelancer API
export const freelancerApi = {
  jobs: () => fetchApi('/api/v2/freelancer/jobs'),
  applications: () => fetchApi('/api/v2/freelancer/applications'),
  apply: (jobId: string, role: string) => 
    fetchApi(`/api/v2/freelancer/jobs/${jobId}/apply`, { method: 'POST', body: JSON.stringify({ role }) }),
  profile: () => fetchApi('/api/v2/freelancer/profile'),
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
};

// Admin API
export const adminApi = {
  users: () => fetchApi('/api/v2/admin/users'),
  createUser: (data: any) => fetchApi('/api/v2/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id: string) => fetchApi(`/api/v2/admin/users/${id}`, { method: 'DELETE' }),
  employers: () => fetchApi('/api/v2/admin/employers'),
  createEmployer: (data: any) => fetchApi('/api/v2/admin/employers', { method: 'POST', body: JSON.stringify(data) }),
  deleteEmployer: (id: string) => fetchApi(`/api/v2/admin/employers/${id}`, { method: 'DELETE' }),
  auditLog: () => fetchApi('/api/v2/admin/audit-log'),
  penalties: () => fetchApi('/api/v2/admin/penalties'),
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
