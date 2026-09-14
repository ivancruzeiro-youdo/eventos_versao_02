// Junta as janelas de horário de um EventItem (A&B/Entretenimento) num único array ordenado —
// a 1ª janela vive em EventItem.serviceStartAt/serviceEndAt (compat com quem só lê esses dois
// campos), a 2ª e a 3ª em EventItemServiceWindow. Usado por toda leitura que precisa mostrar
// TODAS as janelas (aba A&B, cronograma, portal do cliente).
export interface ServiceWindowInput {
  serviceStartAt: Date | null;
  serviceEndAt: Date | null;
  serviceWindows?: { startAt: Date; endAt: Date }[];
}

export interface ServiceWindow {
  startAt: Date;
  endAt: Date;
}

export function mergeServiceWindows(item: ServiceWindowInput): ServiceWindow[] {
  const windows: ServiceWindow[] = [];
  if (item.serviceStartAt && item.serviceEndAt) {
    windows.push({ startAt: item.serviceStartAt, endAt: item.serviceEndAt });
  }
  for (const w of item.serviceWindows ?? []) {
    windows.push({ startAt: w.startAt, endAt: w.endAt });
  }
  return windows;
}
