'use client';

import { useEffect, useState } from 'react';
import { Plus, Check, X, Edit2, Trash2, MapPin } from 'lucide-react';

interface LibraryRule {
  id: string;
  text: string;
  venues: { id: string; name: string }[];
}

// Biblioteca central de regras dos espaços: cada regra é cadastrada uma vez aqui e os locais só se
// vinculam a ela (na página do local). No portal, uma regra vinculada a 2+ espaços do mesmo evento
// aparece uma única vez para o cliente aceitar.
export default function RulesLibrary() {
  const [rules, setRules] = useState<LibraryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/v2/rules', { credentials: 'include' });
      if (!res.ok) throw new Error();
      setRules((await res.json()).rules ?? []);
      setError('');
    } catch {
      setError('Não foi possível carregar as regras.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Não foi possível concluir a operação.');
        return false;
      }
      await load();
      return true;
    } catch {
      alert('Sem conexão. Tente novamente.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!newText.trim()) return;
    if (await call('/api/v2/rules', 'POST', { text: newText })) { setNewText(''); setAdding(false); }
  }

  async function save(r: LibraryRule) {
    if (r.venues.length > 1 && !confirm(`Esta regra está vinculada a ${r.venues.length} espaços (${r.venues.map(v => v.name).join(', ')}). A alteração vale para todos. Continuar?`)) return;
    if (await call(`/api/v2/rules/${r.id}`, 'PATCH', { text: editText })) setEditingId(null);
  }

  async function remove(r: LibraryRule) {
    const where = r.venues.length ? `Ela será removida de ${r.venues.length} espaço(s): ${r.venues.map(v => v.name).join(', ')}.` : 'Ela não está vinculada a nenhum espaço.';
    if (!confirm(`Excluir esta regra da biblioteca? ${where}`)) return;
    await call(`/api/v2/rules/${r.id}`, 'DELETE');
  }

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-card-foreground">Biblioteca de regras</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cadastre cada regra uma vez e vincule aos locais pela página de cada local. Quando um evento tem 2 locais com a mesma regra, o cliente aceita só uma vez.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition shrink-0">
          <Plus className="size-3.5" /> Nova regra
        </button>
      </div>

      <div className="p-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando regras...</p>}
        {error && <p className="text-sm text-destructive text-center py-4">{error} <button onClick={load} className="underline">Tentar novamente</button></p>}
        {!loading && !error && rules.length === 0 && !adding && <p className="text-sm text-muted-foreground text-center py-6 italic">Nenhuma regra cadastrada.</p>}

        {rules.map(r => (
          <div key={r.id} className="border rounded-lg overflow-hidden">
            {editingId === r.id ? (
              <div className="p-3 space-y-2 bg-muted/20">
                <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)} rows={2} className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                  <button onClick={() => save(r)} disabled={busy || !editText.trim()} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Salvar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{r.text}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {r.venues.length === 0
                      ? <span className="text-[11px] text-muted-foreground italic">Sem local vinculado</span>
                      : r.venues.map(v => (
                        <span key={v.id} className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-0.5 rounded"><MapPin size={10} />{v.name}</span>
                      ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setEditingId(r.id); setEditText(r.text); }} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground"><Edit2 size={13} /></button>
                  <button onClick={() => remove(r)} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <textarea autoFocus placeholder="Texto da regra..." value={newText} onChange={e => setNewText(e.target.value)} rows={2} className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setAdding(false); setNewText(''); }} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
              <button onClick={create} disabled={busy || !newText.trim()} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50"><Check size={11} /> {busy ? 'Salvando...' : 'Criar regra'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
