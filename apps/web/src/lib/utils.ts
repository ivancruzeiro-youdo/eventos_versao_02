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

export function getStatusColor(status: string) {
  /* YouDO Design System - Semantic tokens */
  const colors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    confirmed: 'bg-success/10 text-success',
    in_progress: 'bg-primary/10 text-primary',
    completed: 'bg-kanban-done text-success',
    encerrado: 'bg-blue-500/10 text-blue-600',
    cancelled: 'bg-destructive/10 text-destructive',
    pending: 'bg-warning/10 text-warning',
    checked_in: 'bg-success/10 text-success',
    confirmed_guest: 'bg-success/10 text-success',
    declined: 'bg-muted text-muted-foreground',
    waitlisted: 'bg-warning/10 text-warning',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
}

export function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    confirmed: 'Confirmado',
    in_progress: 'Em Andamento',
    completed: 'Concluído',
    encerrado: 'Encerrado',
    cancelled: 'Cancelado',
    pending: 'Pendente',
    confirmed_guest: 'Confirmado',
    declined: 'Recusado',
    waitlisted: 'Lista de Espera',
    checked_in: 'Check-in Realizado',
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
