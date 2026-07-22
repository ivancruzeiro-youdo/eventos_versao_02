'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

interface PendingContract {
  id: string;
  clientName: string;
  startDate: string;
}

type Status = 'loading' | 'up_to_date' | 'no_contracts' | 'pending' | 'error' | 'importing' | 'imported';

interface Props {
  eventId: string;
}

export default function UserpStatusBanner({ eventId }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [pendingContracts, setPendingContracts] = useState<PendingContract[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [blockingReasons, setBlockingReasons] = useState<string[]>([]);
  const [groupDuplicates, setGroupDuplicates] = useState(false);

  useEffect(() => {
    check();
  }, [eventId]);

  async function check() {
    setStatus('loading');
    try {
      const res = await fetch(`/api/v2/events/${eventId}/userp-status`, { credentials: 'include' });
      if (!res.ok) { setStatus('error'); return; }
      const data = await res.json();
      if (data.status === 'no_contracts') { setStatus('no_contracts'); return; }
      if (data.status === 'up_to_date') { setStatus('up_to_date'); return; }
      if (data.status === 'pending') {
        setPendingContracts(data.pendingContracts || []);
        setPreview(data.preview || null);
        setBlockingReasons(data.preview?.blockingReasons || []);
        setStatus('pending');
        return;
      }
      setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  async function handleImport() {
    if (!preview) return;
    setStatus('importing');
    try {
      const res = await fetch('/api/v2/events/sync-import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previews: [preview], groupDuplicates }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert('Erro ao importar: ' + (d.error || 'Falha desconhecida'));
        setStatus('pending');
        return;
      }
      setStatus('imported');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      alert('Erro ao importar: ' + e.message);
      setStatus('pending');
    }
  }

  if (status === 'no_contracts' || status === 'error') return null;

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-3">
        <Loader2 size={12} className="animate-spin" />
        Verificando USERP...
      </div>
    );
  }

  if (status === 'up_to_date' || status === 'imported') {
    return (
      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <CheckCircle2 size={14} className="shrink-0" />
        {status === 'imported' ? 'Contratos importados! Recarregando...' : '100% migrado — USERP sincronizado'}
      </div>
    );
  }

  if (status === 'pending') {
    const canImport = preview?.canImport;
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-amber-900">
              {pendingContracts.length} contrato{pendingContracts.length !== 1 ? 's' : ''} não importado{pendingContracts.length !== 1 ? 's' : ''} no USERP
            </p>
          </div>
          <button
            onClick={check}
            className="p-1 rounded hover:bg-amber-100 transition text-amber-600"
            title="Verificar novamente"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <ul className="space-y-0.5 pl-1">
          {pendingContracts.map(c => (
            <li key={c.id} className="text-xs text-amber-800">
              • Contrato <span className="font-mono font-semibold">#{c.id}</span>
              {c.clientName ? ` — ${c.clientName}` : ''}
              {c.startDate ? ` (${c.startDate})` : ''}
            </li>
          ))}
        </ul>

        {blockingReasons.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-2 space-y-0.5">
            <p className="text-xs font-semibold text-red-700">Importação bloqueada:</p>
            {blockingReasons.map((r, i) => (
              <p key={i} className="text-xs text-red-600">• {r}</p>
            ))}
          </div>
        )}

        {canImport && preview?.hasDuplicates && (
          <div className="bg-amber-100 border border-amber-300 rounded p-2 space-y-1">
            <p className="text-xs font-semibold text-amber-800">
              Itens duplicados detectados: {preview.duplicateNames?.join(', ')}
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={groupDuplicates}
                onChange={e => setGroupDuplicates(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-amber-900">Agrupar itens duplicados (somar quantidades)</span>
            </label>
            {!groupDuplicates && (
              <p className="text-xs text-amber-700">Sem agrupar: cada ocorrência será importada como item separado.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {canImport ? (
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold transition"
            >
              <RefreshCw size={12} />
              Importar agora
            </button>
          ) : (
            <span className="text-xs text-red-600 font-medium">Resolva os problemas acima antes de importar.</span>
          )}
        </div>
      </div>
    );
  }

  if (status === 'importing') {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <Loader2 size={13} className="animate-spin" />
        Importando contratos do USERP...
      </div>
    );
  }

  return null;
}
