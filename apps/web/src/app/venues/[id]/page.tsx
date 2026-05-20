'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { venuesApiExtended } from '@/lib/api';
import { MapPin, Users, Phone, User, ArrowLeft, Edit2, Trash2, Plus, HelpCircle, X, Check, GripVertical } from 'lucide-react';

interface VenueQuestion {
  id: string;
  text: string;
  type: string;
  required: boolean;
  options: string[] | null;
  order: number;
}

interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  capacity: number | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string;
  questions: VenueQuestion[];
  _count?: { events: number };
}

const QUESTION_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Múltipla escolha' },
];

export default function VenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Question form state
  const [addingQ, setAddingQ] = useState(false);
  const [newQ, setNewQ] = useState({ text: '', type: 'text', required: false, options: '' });
  const [savingQ, setSavingQ] = useState(false);
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState({ text: '', type: 'text', required: false, options: '' });

  useEffect(() => {
    loadVenue();
  }, [venueId]);

  async function loadVenue() {
    try {
      setLoading(true);
      const response = await venuesApiExtended.get(venueId);
      setVenue(response.venue);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar local');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja excluir este local?')) return;
    try {
      await venuesApiExtended.delete(venueId);
      router.push('/venues');
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir local');
    }
  }

  function parseOptions(raw: string): string[] | null {
    const opts = raw.split('\n').map(s => s.trim()).filter(Boolean);
    return opts.length > 0 ? opts : null;
  }

  async function createQuestion() {
    if (!newQ.text.trim()) return;
    setSavingQ(true);
    try {
      await fetch(`/api/v2/venues/${venueId}/questions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newQ.text,
          type: newQ.type,
          required: newQ.required,
          options: ['select', 'multiselect'].includes(newQ.type) ? parseOptions(newQ.options) : null,
        }),
      });
      setNewQ({ text: '', type: 'text', required: false, options: '' });
      setAddingQ(false);
      await loadVenue();
    } finally { setSavingQ(false); }
  }

  async function updateQuestion(qId: string) {
    await fetch(`/api/v2/venues/${venueId}/questions/${qId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: editQ.text,
        type: editQ.type,
        required: editQ.required,
        options: ['select', 'multiselect'].includes(editQ.type) ? parseOptions(editQ.options) : null,
      }),
    });
    setEditingQId(null);
    await loadVenue();
  }

  async function deleteQuestion(qId: string) {
    if (!confirm('Excluir esta pergunta?')) return;
    await fetch(`/api/v2/venues/${venueId}/questions/${qId}`, { method: 'DELETE', credentials: 'include' });
    await loadVenue();
  }

  function startEdit(q: VenueQuestion) {
    setEditingQId(q.id);
    setEditQ({
      text: q.text, type: q.type, required: q.required,
      options: Array.isArray(q.options) ? q.options.join('\n') : '',
    });
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      </Layout>
    );
  }

  if (!venue) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Local não encontrado.</p>
          <Link href="/venues" className="mt-2 inline-block text-primary hover:underline">
            Voltar para locais
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href="/venues"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para locais
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
              {venue.name}
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <MapPin className="size-4" />
              {venue.city && venue.state
                ? `${venue.city}, ${venue.state}`
                : venue.address || 'Endereço não definido'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-3 py-2 border border-input rounded-md text-sm font-medium hover:bg-muted transition flex items-center gap-2"
            >
              <Edit2 className="size-4" />
              Editar
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-2 border border-destructive text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition flex items-center gap-2"
            >
              <Trash2 className="size-4" />
              Excluir
            </button>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Informações do Local</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <MapPin className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Endereço</p>
                    <p className="text-sm text-muted-foreground">{venue.address || 'Não definido'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Users className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Capacidade</p>
                    <p className="text-sm text-muted-foreground">{venue.capacity ? `${venue.capacity} pessoas` : 'Não definida'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Informações de Contato</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Nome do Contato</p>
                    <p className="text-sm text-muted-foreground">{venue.contactName || 'Não definido'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Phone className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Telefone</p>
                    <p className="text-sm text-muted-foreground">{venue.contactPhone || 'Não definido'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Perguntas Padrão ─────────────────────────────────────────── */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-medium text-card-foreground">Perguntas Padrão</h2>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {venue.questions?.length ?? 0} pergunta{(venue.questions?.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setAddingQ(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition"
              >
                <Plus className="size-3.5" /> Adicionar
              </button>
            </div>

            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Estas perguntas serão carregadas automaticamente no <strong>Plano do Evento</strong> sempre que este local for usado.
              </p>

              {/* Question list */}
              {(venue.questions ?? []).length === 0 && !addingQ && (
                <p className="text-sm text-muted-foreground text-center py-4 italic">
                  Nenhuma pergunta padrão cadastrada.
                </p>
              )}

              {(venue.questions ?? []).map(q => (
                <div key={q.id} className="border rounded-lg overflow-hidden">
                  {editingQId === q.id ? (
                    /* Edit form */
                    <div className="p-3 space-y-2 bg-muted/20">
                      <input
                        autoFocus
                        value={editQ.text}
                        onChange={e => setEditQ(p => ({ ...p, text: e.target.value }))}
                        className="w-full text-sm px-2 py-1.5 border rounded bg-background"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <select value={editQ.type} onChange={e => setEditQ(p => ({ ...p, type: e.target.value }))}
                          className="text-sm px-2 py-1.5 border rounded bg-background">
                          {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={editQ.required} onChange={e => setEditQ(p => ({ ...p, required: e.target.checked }))} />
                          Obrigatória
                        </label>
                      </div>
                      {['select', 'multiselect'].includes(editQ.type) && (
                        <textarea
                          value={editQ.options}
                          onChange={e => setEditQ(p => ({ ...p, options: e.target.value }))}
                          rows={3} placeholder="Uma opção por linha..."
                          className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none"
                        />
                      )}
                      <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setEditingQId(null)} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                        <button onClick={() => updateQuestion(q.id)} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1"><Check size={11} /> Salvar</button>
                      </div>
                    </div>
                  ) : (
                    /* View row */
                    <div className="flex items-start justify-between px-3 py-2.5 hover:bg-muted/30 transition">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <GripVertical size={14} className="text-muted-foreground/40 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">
                            {q.required && <span className="text-destructive mr-1">*</span>}
                            {q.text}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {QUESTION_TYPES.find(t => t.value === q.type)?.label ?? q.type}
                            {Array.isArray(q.options) && q.options.length > 0 && (
                              <span className="ml-1.5">· {q.options.join(', ')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button onClick={() => startEdit(q)} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => deleteQuestion(q.id)} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-destructive">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add question form */}
              {addingQ && (
                <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                  <input
                    autoFocus
                    placeholder="Texto da pergunta..."
                    value={newQ.text}
                    onChange={e => setNewQ(p => ({ ...p, text: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && createQuestion()}
                    className="w-full text-sm px-2 py-1.5 border rounded bg-background"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={newQ.type} onChange={e => setNewQ(p => ({ ...p, type: e.target.value }))}
                      className="text-sm px-2 py-1.5 border rounded bg-background">
                      {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={newQ.required} onChange={e => setNewQ(p => ({ ...p, required: e.target.checked }))} />
                      Obrigatória
                    </label>
                  </div>
                  {['select', 'multiselect'].includes(newQ.type) && (
                    <textarea
                      value={newQ.options}
                      onChange={e => setNewQ(p => ({ ...p, options: e.target.value }))}
                      rows={3} placeholder="Uma opção por linha..."
                      className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none"
                    />
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setAddingQ(false)} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                    <button onClick={createQuestion} disabled={savingQ} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50">
                      <Check size={11} /> {savingQ ? 'Salvando...' : 'Criar pergunta'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Estatísticas</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-card-foreground">{venue._count?.events ?? 0}</p>
                <p className="text-sm text-muted-foreground">Eventos realizados</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground text-center">
                  Cadastrado em {new Date(venue.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
