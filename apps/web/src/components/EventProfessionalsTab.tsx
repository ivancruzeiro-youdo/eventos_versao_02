'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, X, Pencil, Trash2, User, Camera, CheckCircle2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  name: string;
  cpf: string | null;
  whatsapp: string | null;
  photoUrl: string | null;
}

interface EventProfessional {
  id: string;
  personId: string;
  eventId: string;
  role: string;
  checkedInAt: string | null;
  person: Person;
}

interface Props {
  eventId: string;
}

// ── CPF / WhatsApp formatters ─────────────────────────────────────────────────

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatWhatsapp(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  if (person.photoUrl) {
    return (
      <img
        src={`/api/v2/people/${person.id}/photo`}
        alt={person.name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0 border border-border"
      />
    );
  }
  const initials = person.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0 border border-primary/20"
    >
      {initials}
    </div>
  );
}

// ── Photo picker ──────────────────────────────────────────────────────────────

function PhotoPicker({ preview, onFile }: { preview: string | null; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    onFile(f);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-20 h-20 rounded-full border-2 border-dashed border-border hover:border-primary/60 transition flex items-center justify-center bg-muted/30 overflow-hidden group"
      >
        {preview ? (
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <Camera size={24} className="text-muted-foreground group-hover:text-primary transition" />
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <Camera size={18} className="text-white" />
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <p className="text-xs text-muted-foreground">
        {preview ? 'Clique para trocar' : 'Foto (opcional)'}
      </p>
    </div>
  );
}

// ── Add professional modal ─────────────────────────────────────────────────────

interface ModalProps {
  eventId: string;
  onClose: () => void;
  onSaved: (professional: EventProfessional) => void;
}

function AddProfessionalModal({ eventId, onClose, onSaved }: ModalProps) {
  const [tab, setTab] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);

  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [role, setRole] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/v2/people?q=${encodeURIComponent(query)}`, { credentials: 'include' });
        const d = await r.json();
        setSearchResults(d.people || []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  function handlePhotoFile(f: File) {
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function uploadPhoto(personId: string): Promise<void> {
    if (!photoFile) return;
    const fd = new FormData();
    fd.append('file', photoFile);
    const r = await fetch(`/api/v2/people/${personId}/photo`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Erro ao enviar foto');
    }
  }

  async function linkPerson(person: Person) {
    if (!role.trim()) { setError('Informe a função/especialidade'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/v2/events/${eventId}/professionals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ personId: person.id, role }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao vincular');
      onSaved(d.professional);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function createAndLink() {
    const cpfClean = cpf.replace(/\D/g, '');
    if (!name.trim()) { setError('Nome é obrigatório'); return; }
    if (!role.trim()) { setError('Informe a função/especialidade'); return; }
    setSaving(true); setError('');
    try {
      const rPerson = await fetch('/api/v2/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          cpf: cpfClean || undefined,
          whatsapp: whatsapp.replace(/\D/g, '') || null,
        }),
      });
      const dPerson = await rPerson.json();
      if (!rPerson.ok) throw new Error(dPerson.error || 'Erro ao cadastrar pessoa');

      const personId = dPerson.person.id;
      await uploadPhoto(personId);

      const r = await fetch(`/api/v2/events/${eventId}/professionals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ personId, role }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao vincular');
      onSaved({ ...d.professional, person: { ...d.professional.person, photoUrl: photoFile ? 'uploaded' : d.professional.person.photoUrl } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">Adicionar profissional</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition"><X size={18} /></button>
        </div>

        <div className="flex border-b">
          {(['search', 'new'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'search' ? 'Buscar cadastrado' : 'Novo cadastro'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === 'search' && (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedPerson(null); }}
                  placeholder="Nome ou CPF…"
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {searching && <p className="text-xs text-muted-foreground text-center">Buscando…</p>}

              {searchResults.length > 0 && !selectedPerson && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPerson(p)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-muted/50 transition text-left"
                    >
                      <Avatar person={p} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.cpf && <p className="text-xs text-muted-foreground">{formatCpf(p.cpf)}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedPerson && (
                <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
                  <Avatar person={selectedPerson} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{selectedPerson.name}</p>
                    {selectedPerson.cpf && <p className="text-xs text-muted-foreground">{formatCpf(selectedPerson.cpf)}</p>}
                  </div>
                  <button onClick={() => setSelectedPerson(null)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'new' && (
            <div className="space-y-3">
              <div className="flex justify-center pt-1 pb-2">
                <PhotoPicker preview={photoPreview} onFile={handlePhotoFile} />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome completo *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Maria da Silva"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF (opcional)</label>
                <input value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp (opcional)</label>
                <input value={whatsapp} onChange={e => setWhatsapp(formatWhatsapp(e.target.value))} placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Função / Especialidade *</label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Ex: Fotógrafo, Músico, DJ…"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 text-sm border rounded-lg hover:bg-muted/50 transition">Cancelar</button>
            <button
              disabled={saving}
              onClick={() => tab === 'new' ? createAndLink() : (selectedPerson ? linkPerson(selectedPerson) : setError('Selecione uma pessoa'))}
              className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function EventProfessionalsTab({ eventId }: Props) {
  const [professionals, setProfessionals] = useState<EventProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [roleValue, setRoleValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/v2/events/${eventId}/professionals`, { credentials: 'include' });
      const d = await r.json();
      setProfessionals(d.professionals || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [eventId]);

  async function removeProfessional(personId: string) {
    if (!confirm('Remover esse profissional do evento?')) return;
    await fetch(`/api/v2/events/${eventId}/professionals/${personId}`, { method: 'DELETE', credentials: 'include' });
    setProfessionals(p => p.filter(x => x.personId !== personId));
  }

  async function saveRole(professional: EventProfessional) {
    if (!roleValue.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v2/events/${eventId}/professionals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ personId: professional.personId, role: roleValue }),
      });
      const d = await r.json();
      if (r.ok) {
        setProfessionals(p => p.map(x => x.personId === professional.personId ? { ...x, role: d.professional.role } : x));
        setEditRoleId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Profissionais do Evento</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Fotógrafo, músico, DJ e outros contratados — com check-in próprio</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
        >
          <UserPlus size={13} /> Adicionar
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-8">Carregando…</div>
      ) : professionals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <User size={22} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Nenhum profissional adicionado</p>
            <p className="text-xs text-muted-foreground mt-0.5">Adicione fotógrafo, músico, DJ e outros contratados</p>
          </div>
          <button onClick={() => setShowModal(true)} className="text-xs text-primary hover:underline">+ Adicionar profissional</button>
        </div>
      ) : (
        <div className="space-y-2">
          {professionals.map(pr => (
            <div key={pr.personId} className="flex items-center gap-3 p-3 border rounded-xl bg-card hover:bg-muted/30 transition group">
              <Avatar person={pr.person} size={44} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{pr.person.name}</p>
                {pr.person.cpf && <p className="text-xs text-muted-foreground">{formatCpf(pr.person.cpf)}</p>}
                {pr.person.whatsapp && (
                  <a
                    href={`https://wa.me/55${pr.person.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-green-600 hover:underline"
                  >
                    {formatWhatsapp(pr.person.whatsapp)}
                  </a>
                )}
                {pr.checkedInAt && (
                  <p className="flex items-center gap-1 text-xs text-green-600 mt-0.5">
                    <CheckCircle2 size={11} /> Check-in às {new Date(pr.checkedInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {editRoleId === pr.personId ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={roleValue}
                      onChange={e => setRoleValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRole(pr); if (e.key === 'Escape') setEditRoleId(null); }}
                      className="text-xs border rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <button
                      onClick={() => saveRole(pr)}
                      disabled={saving}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      OK
                    </button>
                    <button onClick={() => setEditRoleId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditRoleId(pr.personId); setRoleValue(pr.role); }}
                    className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full hover:bg-primary/20 transition"
                  >
                    {pr.role}
                    <Pencil size={10} />
                  </button>
                )}
              </div>

              <button
                onClick={() => removeProfessional(pr.personId)}
                className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive ml-1"
                title="Remover do evento"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddProfessionalModal
          eventId={eventId}
          onClose={() => setShowModal(false)}
          onSaved={professional => {
            setProfessionals(prev => {
              const exists = prev.find(x => x.personId === professional.personId);
              if (exists) return prev.map(x => x.personId === professional.personId ? professional : x);
              return [...prev, professional];
            });
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
