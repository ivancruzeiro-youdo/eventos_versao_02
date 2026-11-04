'use client';

import { useEffect, useState } from 'react';
import { Plus, Check, X, Edit2, Trash2, MapPin } from 'lucide-react';

interface LibraryQuestion {
  id: string;
  text: string;
  type: string;
  required: boolean;
  options: string[] | null;
  venues: { id: string; name: string }[];
}

const TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Múltipla escolha' },
];

interface Form { text: string; type: string; required: boolean; options: string }
const EMPTY: Form = { text: '', type: 'text', required: false, options: '' };
const toOptions = (f: Form) => (['select', 'multiselect'].includes(f.type) ? f.options.split('\n').map(o => o.trim()).filter(Boolean) : null);

// Biblioteca central das perguntas padrão dos espaços: a pergunta é cadastrada uma vez aqui e os
// locais só se vinculam (página do local). Num evento com 2+ locais com a mesma pergunta, ela é
// respondida uma única vez.
export default function QuestionsLibrary() {
  const [questions, setQuestions] = useState<LibraryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/v2/questions', { credentials: 'include' });
      if (!res.ok) throw new Error();
      setQuestions((await res.json()).questions ?? []);
      setError('');
    } catch {
      setError('Não foi possível carregar as perguntas.');
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

  const payload = (f: Form) => ({ text: f.text, type: f.type, required: f.required, options: toOptions(f) });

  async function create() {
    if (!form.text.trim()) return;
    if (await call('/api/v2/questions', 'POST', payload(form))) { setForm(EMPTY); setAdding(false); }
  }

  async function save(q: LibraryQuestion) {
    if (q.venues.length > 1 && !confirm(`Esta pergunta está vinculada a ${q.venues.length} espaços (${q.venues.map(v => v.name).join(', ')}). A alteração vale para todos; as respostas já dadas continuam. Continuar?`)) return;
    if (await call(`/api/v2/questions/${q.id}`, 'PATCH', payload(form))) setEditingId(null);
  }

  async function remove(q: LibraryQuestion) {
    if (!confirm('Excluir esta pergunta da biblioteca? (só é possível se nenhum evento tiver resposta para ela)')) return;
    await call(`/api/v2/questions/${q.id}`, 'DELETE');
  }

  const formUi = (onCancel: () => void, onSubmit: () => void, submitLabel: string) => (
    <div className="p-3 space-y-2 bg-muted/20">
      <input autoFocus placeholder="Texto da pergunta..." value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))} className="w-full text-sm px-2 py-1.5 border rounded bg-background" />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="text-sm px-2 py-1.5 border rounded bg-background">
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.required} onChange={e => setForm(p => ({ ...p, required: e.target.checked }))} /> Obrigatória</label>
      </div>
      {['select', 'multiselect'].includes(form.type) && (
        <textarea value={form.options} onChange={e => setForm(p => ({ ...p, options: e.target.value }))} rows={3} placeholder="Uma opção por linha..." className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none" />
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
        <button onClick={onSubmit} disabled={busy || !form.text.trim()} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50"><Check size={11} /> {busy ? 'Salvando...' : submitLabel}</button>
      </div>
    </div>
  );

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-card-foreground">Biblioteca de perguntas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cadastre cada pergunta uma vez e vincule aos locais pela página de cada local. Quando um evento tem 2 locais com a mesma pergunta, ela é respondida só uma vez.
          </p>
        </div>
        <button onClick={() => { setForm(EMPTY); setAdding(true); setEditingId(null); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition shrink-0">
          <Plus className="size-3.5" /> Nova pergunta
        </button>
      </div>

      <div className="p-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando perguntas...</p>}
        {error && <p className="text-sm text-destructive text-center py-4">{error} <button onClick={load} className="underline">Tentar novamente</button></p>}
        {!loading && !error && questions.length === 0 && !adding && <p className="text-sm text-muted-foreground text-center py-6 italic">Nenhuma pergunta cadastrada.</p>}

        {questions.map(q => (
          <div key={q.id} className="border rounded-lg overflow-hidden">
            {editingId === q.id ? formUi(() => setEditingId(null), () => save(q), 'Salvar') : (
              <div className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{q.required && <span className="text-destructive mr-1">*</span>}{q.text}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {TYPES.find(t => t.value === q.type)?.label ?? q.type}
                    {Array.isArray(q.options) && q.options.length > 0 && <span className="ml-1.5">· {q.options.join(', ')}</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {q.venues.length === 0
                      ? <span className="text-[11px] text-muted-foreground italic">Sem local vinculado</span>
                      : q.venues.map(v => <span key={v.id} className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-0.5 rounded"><MapPin size={10} />{v.name}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setEditingId(q.id); setAdding(false); setForm({ text: q.text, type: q.type, required: q.required, options: Array.isArray(q.options) ? q.options.join('\n') : '' }); }} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground"><Edit2 size={13} /></button>
                  <button onClick={() => remove(q)} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          </div>
        ))}

        {adding && <div className="border rounded-lg overflow-hidden">{formUi(() => { setAdding(false); setForm(EMPTY); }, create, 'Criar pergunta')}</div>}
      </div>
    </div>
  );
}
