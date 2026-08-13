'use client';

// Superfície única de comandos do plano de serviço, usada tanto pelos BOTÕES do ServicePanel
// quanto pela camada de VOZ. Antes disso as mutações eram arrow functions inline dentro do
// render, inalcançáveis por qualquer coisa que não fosse um clique.
import { useCallback, useMemo, useState } from 'react';
import type { ServiceEntry, ServicePackage } from './ServicePanel';

/** Resultado explícito em vez de alert(): a voz precisa FALAR a falha, e um alert() numa TV
 *  de cozinha desacompanhada é um modal que ninguém fecha — e enquanto ele existe o `busy`
 *  fica preso e o poll da tela congelado. Quem quiser o alert() passa onError={alert}. */
export type Res = { ok: true } | { ok: false; error: string };

const STATION_KINDS = ['montagem', 'reposicao', 'desmontagem'] as const;

export interface ServiceCommands {
  eventId: string;
  entries: ServiceEntry[];
  packages: ServicePackage[];
  working: boolean;

  setServed(entryId: string, served: boolean): Promise<Res>;
  /** Muda o horário de saída de uma entrada já na sequência — clique na hora ou voz. */
  updateServeAt(entryId: string, serveAt: string): Promise<Res>;
  toggleServed(entryId: string): Promise<Res>;
  duplicate(entryId: string): Promise<Res>;
  remove(entryId: string): Promise<Res>;
  moveByIndex(index: number, dir: -1 | 1): Promise<Res>;
  /** Move uma entrada para uma posição absoluta. Base do comando "o próximo é o X". */
  moveToPosition(entryId: string, targetIndex: number, reflow?: boolean): Promise<Res>;
  reorder(ids: string[], reflow?: boolean): Promise<Res>;
  addItem(a: { eventItemId: string; sourceLabel: string | null; itemName: string }): Promise<Res>;
  addStation(pkg: ServicePackage): Promise<Res>;
  generateSuggested(): Promise<Res>;
  /** Itens/estações ainda fora da sequência — fonte da lista de "adicionar". */
  available: { itemName: string; sourceLabel: string | null; pkg: ServicePackage }[];
  availableStations: ServicePackage[];
}

interface Opts {
  eventId: string;
  entries: ServiceEntry[];
  packages: ServicePackage[];
  onMutate: () => void;
  onBusyChange: (busy: boolean) => void;
  onError: (msg: string) => void;
}

export function useServiceCommands(opts: Opts): ServiceCommands {
  const { eventId, entries, packages, onMutate, onBusyChange, onError } = opts;
  const [working, setWorking] = useState(false);

  const call = useCallback(async (url: string, init?: RequestInit): Promise<Res> => {
    setWorking(true);
    onBusyChange(true);
    try {
      const res = await fetch(url, { credentials: 'include', ...init });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const error = d.error || 'Falha na operação.';
        onError(error);
        return { ok: false, error };
      }
      onMutate();
      return { ok: true };
    } catch (err: any) {
      const error = err?.message || 'Falha de rede.';
      onError(error);
      return { ok: false, error };
    } finally {
      setWorking(false);
      onBusyChange(false);
    }
  }, [onBusyChange, onMutate, onError]);

  const postJson = (body: any): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const patchJson = (body: any): RequestInit => ({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reorder = useCallback((ids: string[], reflow = false) =>
    call(`/api/v2/kitchen/display/events/${eventId}/plan/reorder`, patchJson({ entryIds: ids, reflow })),
    [call, eventId]);

  const moveByIndex = useCallback((index: number, dir: -1 | 1) => {
    const next = [...entries];
    const target = index + dir;
    if (target < 0 || target >= next.length) return Promise.resolve<Res>({ ok: true });
    [next[index], next[target]] = [next[target], next[index]];
    return reorder(next.map(e => e.id));
  }, [entries, reorder]);

  const moveToPosition = useCallback((entryId: string, targetIndex: number, reflow = false) => {
    const ids = entries.map(e => e.id);
    const from = ids.indexOf(entryId);
    if (from < 0) return Promise.resolve<Res>({ ok: false, error: 'Item não está na sequência.' });
    const clamped = Math.max(0, Math.min(targetIndex, ids.length - 1));
    ids.splice(clamped, 0, ids.splice(from, 1)[0]);
    return reorder(ids, reflow);
  }, [entries, reorder]);

  const setServed = useCallback((entryId: string, served: boolean) =>
    call(`/api/v2/kitchen/display/plan/entries/${entryId}`, patchJson({ status: served ? 'served' : 'pending' })),
    [call]);

  const updateServeAt = useCallback((entryId: string, serveAt: string) =>
    call(`/api/v2/kitchen/display/plan/entries/${entryId}`, patchJson({ serveAt })),
    [call]);

  const toggleServed = useCallback((entryId: string) => {
    const e = entries.find(x => x.id === entryId);
    if (!e) return Promise.resolve<Res>({ ok: false, error: 'Item não encontrado.' });
    return setServed(entryId, e.status !== 'served');
  }, [entries, setServed]);

  const duplicate = useCallback((entryId: string) =>
    call(`/api/v2/kitchen/display/plan/entries/${entryId}/duplicate`, postJson({})), [call]);

  const remove = useCallback((entryId: string) =>
    call(`/api/v2/kitchen/display/plan/entries/${entryId}`, { method: 'DELETE' }), [call]);

  const addItem = useCallback((a: { eventItemId: string; sourceLabel: string | null; itemName: string }) =>
    call(`/api/v2/kitchen/display/events/${eventId}/plan/entries`, postJson(a)), [call, eventId]);

  const addStation = useCallback((pkg: ServicePackage) =>
    call(`/api/v2/kitchen/display/events/${eventId}/plan/entries/bulk`, postJson({
      stations: [{ eventItemId: pkg.eventItemId, itemName: pkg.name, startAt: pkg.serviceStartAt, endAt: pkg.serviceEndAt }],
    })), [call, eventId]);

  // Chave com o tipo: "Buffet 01 / montagem" não colide com "Buffet 01 / desmontagem".
  const inSequence = useMemo(
    () => new Set(entries.map(e => `${e.itemName.toLowerCase()}|${e.entryKind}`)),
    [entries]);

  const available = useMemo(() =>
    packages
      .filter(p => p.kind !== 'estacao')
      .flatMap(pkg =>
        pkg.chosenItems
          .map(c => ({ ...c, pkg }))
          .filter(c => !inSequence.has(`${c.itemName.toLowerCase()}|item`))
      ),
    [packages, inSequence]);

  const availableStations = useMemo(() =>
    packages
      .filter(p => p.kind === 'estacao')
      .filter(p => !STATION_KINDS.every(k => inSequence.has(`${p.name.toLowerCase()}|${k}`))),
    [packages, inSequence]);

  const generateSuggested = useCallback(() => {
    // Comida: uma saída por item escolhido, espaçadas pelo intervalo.
    // Estação (carrinho, buffet, coffee break): 3 linhas do PACOTE — montagem, reposição e
    // desmontagem — em vez de uma linha por item a cada 15 min.
    const items = available.map(c => ({
      eventItemId: c.pkg.eventItemId, sourceLabel: c.sourceLabel, itemName: c.itemName,
    }));
    const stations = availableStations.map(p => ({
      eventItemId: p.eventItemId, itemName: p.name, startAt: p.serviceStartAt, endAt: p.serviceEndAt,
    }));

    if (items.length === 0 && stations.length === 0) {
      const error = 'Tudo que havia para gerar já está na sequência.';
      onError(error);
      return Promise.resolve<Res>({ ok: false, error });
    }
    return call(`/api/v2/kitchen/display/events/${eventId}/plan/entries/bulk`, postJson({ items, stations }));
  }, [available, availableStations, call, eventId, onError]);

  return {
    eventId, entries, packages, working,
    setServed, toggleServed, duplicate, remove,
    moveByIndex, moveToPosition, reorder,
    addItem, addStation, generateSuggested, updateServeAt,
    available, availableStations,
  };
}
