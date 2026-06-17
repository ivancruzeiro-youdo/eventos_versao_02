import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TZ = 'America/Sao_Paulo';

export function formatDate(date: string | Date, formatStr: string = 'dd/MM/yyyy') {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  if (formatStr === 'dd/MM/yyyy') {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
  // Fallback for custom format strings (used rarely)
  return format(d, formatStr, { locale: ptBR });
}

export function formatDateTime(date: string | Date) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const datePart = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const timePart = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  return `${datePart} às ${timePart}`;
}

// Calcula o status visual de um evento levando em conta se o NPS foi respondido
export function getEventDisplayStatus(event: { status: string; npsOrganizador?: { submittedAt: string | null } | null }): string {
  if (event.status === 'encerrado') {
    return event.npsOrganizador?.submittedAt ? 'nps_done' : 'awaiting_nps';
  }
  return event.status;
}

export function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    // Verde — antes de iniciar
    draft:        'bg-green-100 text-green-700',
    confirmed:    'bg-green-100 text-green-700',
    // Amarelo — evento rodando
    in_progress:  'bg-amber-100 text-amber-700',
    completed:    'bg-amber-100 text-amber-700',
    // Roxo — encerrado aguardando NPS
    awaiting_nps: 'bg-purple-100 text-purple-700',
    encerrado:    'bg-purple-100 text-purple-700',
    // Cinza — NPS respondido
    nps_done:     'bg-gray-100 text-gray-600',
    // Outros
    cancelled:    'bg-red-100 text-red-600',
    pending:      'bg-amber-100 text-amber-700',
    checked_in:   'bg-green-100 text-green-700',
    confirmed_guest: 'bg-green-100 text-green-700',
    declined:     'bg-gray-100 text-gray-600',
    waitlisted:   'bg-amber-100 text-amber-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-600';
}

export function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft:        'A Iniciar',
    confirmed:    'A Iniciar',
    in_progress:  'Em Andamento',
    completed:    'Em Andamento',
    awaiting_nps: 'Aguardando NPS',
    encerrado:    'Aguardando NPS',
    nps_done:     'NPS Respondido',
    cancelled:    'Cancelado',
    pending:      'Pendente',
    confirmed_guest: 'Confirmado',
    declined:     'Recusado',
    waitlisted:   'Lista de Espera',
    checked_in:   'Check-in Realizado',
  };
  return labels[status] || status;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatPhone(phone: string) {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}

export function formatCpf(cpf: string) {
  if (!cpf) return '-';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

export function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
