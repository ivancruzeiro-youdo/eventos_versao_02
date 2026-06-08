/**
 * CPF utility functions for normalization and formatting
 */

/**
 * Remove all non-digit characters from CPF
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Format CPF as XXX.XXX.XXX-XX
 */
export function formatCpf(cpf: string): string {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return cpf;
  
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Check if CPF has 11 digits
 */
export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf);
  return digits.length === 11;
}
