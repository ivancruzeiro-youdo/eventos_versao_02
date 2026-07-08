'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Plus, Pencil, Trash2, X, Search, Package } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  responsavel: string | null;
  contato: string | null;
  atendimento: string | null;
  entrega: string | null;
  insumos: string | null;
  notes: string | null;
}

const empty = (): Omit<Supplier, 'id'> => ({
  name: '',
  responsavel: '',
  contato: '',
  atendimento: 'Horário Comercial',
  entrega: '',
  insumos: '',
  notes: '',
});

function isUrl(s: string) {
  try { return new URL(s).hostname.length > 0; } catch { return false; }
}

export default function FornecedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/v2/suppliers', { credentials: 'include' });
    const data = await res.json();
    setSuppliers(data.suppliers || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(empty());
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      responsavel: s.responsavel ?? '',
      contato: s.contato ?? '',
      atendimento: s.atendimento ?? '',
      entrega: s.entrega ?? '',
      insumos: s.insumos ?? '',
      notes: s.notes ?? '',
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        responsavel: form.responsavel?.trim() || null,
        contato: form.contato?.trim() || null,
        atendimento: form.atendimento?.trim() || null,
        entrega: form.entrega?.trim() || null,
        insumos: form.insumos?.trim() || null,
        notes: form.notes?.trim() || null,
      };
      const url = editing ? `/api/v2/suppliers/${editing.id}` : '/api/v2/suppliers';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { setShowForm(false); load(); }
    } finally { setSaving(false); }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Excluir fornecedor "${name}"?`)) return;
    await fetch(`/api/v2/suppliers/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  const filtered = suppliers.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.insumos?.toLowerCase().includes(search.toLowerCase()) ||
    s.responsavel?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fornecedores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{suppliers.length} fornecedore{suppliers.length !== 1 ? 's' : ''} cadastrado{suppliers.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium"
          >
            <Plus size={16} /> Novo fornecedor
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, insumo ou responsável..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="mx-auto mb-3 opacity-30" size={40} />
            <p>{search ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado ainda.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Insumo</th>
                  <th className="px-4 py-3 text-left">Fornecedor</th>
                  <th className="px-4 py-3 text-left">Responsável</th>
                  <th className="px-4 py-3 text-left">Contato</th>
                  <th className="px-4 py-3 text-left">Atendimento</th>
                  <th className="px-4 py-3 text-left">Entrega</th>
                  <th className="px-4 py-3 text-left w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-pre-line leading-relaxed max-w-[220px]">
                      {s.insumos || <span className="italic opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {s.responsavel || <span className="text-muted-foreground opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {s.contato ? (
                        isUrl(s.contato) ? (
                          <a href={s.contato} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Ver link
                          </a>
                        ) : s.contato
                      ) : <span className="text-muted-foreground opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {s.atendimento || <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {s.entrega || <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 text-muted-foreground hover:text-primary rounded transition" title="Editar">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => remove(s.id, s.name)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition" title="Excluir">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-lg">{editing ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome do fornecedor *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Hausbeer, MUFS, Baldo..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Insumos fornecidos</label>
                <textarea
                  value={form.insumos ?? ''}
                  onChange={e => setForm(f => ({ ...f, insumos: e.target.value }))}
                  placeholder="Descreva o que este fornecedor fornece&#10;ex: Chopp Pilsen&#10;Refrigerantes"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Responsável</label>
                  <input
                    type="text"
                    value={form.responsavel ?? ''}
                    onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
                    placeholder="Nome do contato"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contato</label>
                  <input
                    type="text"
                    value={form.contato ?? ''}
                    onChange={e => setForm(f => ({ ...f, contato: e.target.value }))}
                    placeholder="Telefone ou link"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Atendimento</label>
                  <input
                    type="text"
                    value={form.atendimento ?? ''}
                    onChange={e => setForm(f => ({ ...f, atendimento: e.target.value }))}
                    placeholder="ex: Horário Comercial"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prazo de entrega</label>
                  <input
                    type="text"
                    value={form.entrega ?? ''}
                    onChange={e => setForm(f => ({ ...f, entrega: e.target.value }))}
                    placeholder="ex: 1 dia, 3 dias"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Informações extras, instruções especiais..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t">
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar fornecedor'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
