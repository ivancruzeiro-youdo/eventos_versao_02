'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Search, Pencil, Camera, X, UserRound, Phone, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';

// ── CPF utils ─────────────────────────────────────────────────────────────────

function cpfDigitsValid(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // all same
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(digits[9]) && calc(10) === parseInt(digits[10]);
}

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatWa(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  name: string;
  cpf: string | null;
  whatsapp: string | null;
  photoUrl: string | null;
  createdAt: string;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  if (person.photoUrl) {
    return (
      <img
        src={`/api/v2/people/${person.id}/photo`}
        alt={person.name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover border border-border shrink-0"
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

// ── CPF field with live validation ────────────────────────────────────────────

function CpfField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const digits = value.replace(/\D/g, '');
  const isComplete = digits.length === 11;
  const isValid = isComplete && cpfDigitsValid(digits);
  const isInvalid = isComplete && !isValid;

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground block">CPF (opcional)</label>
      <div className="relative">
        <input
          value={value}
          onChange={e => onChange(formatCpf(e.target.value))}
          placeholder="000.000.000-00"
          maxLength={14}
          className={`w-full px-3 py-2 border rounded-lg text-sm pr-8 focus:outline-none focus:ring-2 ${
            isInvalid ? 'border-destructive focus:ring-destructive/30' : isValid ? 'border-green-500 focus:ring-green-500/30' : 'focus:ring-primary/30'
          }`}
        />
        {isComplete && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {isValid
              ? <CheckCircle2 size={14} className="text-green-500" />
              : <AlertCircle size={14} className="text-destructive" />}
          </span>
        )}
      </div>
      {isInvalid && <p className="text-xs text-destructive">CPF inválido — verifique os dígitos</p>}
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditModal({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: (p: Person) => void }) {
  const isNew = !person;
  const [name, setName] = useState(person?.name ?? '');
  const [cpf, setCpf] = useState(person?.cpf ? formatCpf(person.cpf) : '');
  const [whatsapp, setWhatsapp] = useState(person?.whatsapp ? formatWa(person.whatsapp) : '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function uploadPhoto(personId: string) {
    if (!photoFile) return;
    const fd = new FormData();
    fd.append('file', photoFile);
    const rp = await fetch(`/api/v2/people/${personId}/photo`, {
      method: 'POST', credentials: 'include', body: fd,
    });
    if (!rp.ok) {
      const dp = await rp.json().catch(() => ({}));
      throw new Error(dp.error || 'Erro ao enviar foto');
    }
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return; }
    if (cpfDigits && !cpfDigitsValid(cpfDigits)) { setError('CPF inválido'); return; }

    setSaving(true); setError('');
    try {
      const body = {
        name: name.trim(),
        cpf: cpfDigits || undefined,
        whatsapp: whatsapp.replace(/\D/g, '') || null,
      };
      const r = isNew
        ? await fetch('/api/v2/people', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/v2/people/${person!.id}`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar');

      await uploadPhoto(d.person.id);

      onSaved({ ...d.person, photoUrl: photoFile ? 'uploaded' : (person?.photoUrl ?? d.person.photoUrl) });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const cpfDigits = cpf.replace(/\D/g, '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">{isNew ? 'Nova pessoa' : 'Editar pessoa'}</h2>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Photo */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative group"
              title="Trocar foto"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="preview" className="w-20 h-20 rounded-full object-cover border-2 border-border" />
              ) : person?.photoUrl ? (
                <img src={`/api/v2/people/${person.id}/photo`} alt={person.name} className="w-20 h-20 rounded-full object-cover border-2 border-border" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center">
                  <Camera size={22} className="text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Camera size={18} className="text-white" />
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome completo *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <CpfField value={cpf} onChange={setCpf} />

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp</label>
            <input value={whatsapp} onChange={e => setWhatsapp(formatWa(e.target.value))} placeholder="(11) 99999-9999"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 text-sm border rounded-lg hover:bg-muted/50 transition">Cancelar</button>
            <button
              onClick={save}
              disabled={saving || !name.trim() || (cpfDigits.length > 0 && cpfDigits.length !== 11)}
              className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const url = q.trim() ? `/api/v2/people?q=${encodeURIComponent(q.trim())}` : '/api/v2/people';
      const r = await fetch(url, { credentials: 'include' });
      const d = await r.json();
      setPeople(d.people || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSearch(v: string) {
    setQuery(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(v), 300);
  }

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pessoas</h1>
          <p className="text-muted-foreground text-sm mt-1">Cadastro central de pessoas vinculadas a eventos</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="shrink-0 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
        >
          + Nova Pessoa
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar por nome ou CPF…"
          className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-16">Carregando…</div>
      ) : people.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <UserRound size={26} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nenhuma pessoa encontrada</p>
          {query && <p className="text-xs text-muted-foreground">Tente outro nome ou CPF</p>}
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-[2.5rem_1fr_10rem_10rem_2.5rem] gap-3 px-4 py-2 bg-muted/40 border-b text-xs font-medium text-muted-foreground">
            <span />
            <span>Nome</span>
            <span>CPF</span>
            <span>WhatsApp</span>
            <span />
          </div>

          <div className="divide-y">
            {people.map(p => (
              <div key={p.id} className="grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_10rem_10rem_2.5rem] items-center gap-3 px-4 py-3 hover:bg-muted/30 transition">
                <Avatar person={p} size={36} />

                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {/* CPF + WhatsApp on mobile */}
                  <div className="flex items-center gap-3 mt-0.5 sm:hidden">
                    {p.cpf && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CreditCard size={10} /> {formatCpf(p.cpf)}
                      </span>
                    )}
                    {p.whatsapp && (
                      <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-green-600 hover:underline">
                        <Phone size={10} /> {formatWa(p.whatsapp)}
                      </a>
                    )}
                  </div>
                </div>

                {/* Desktop columns */}
                <span className="hidden sm:block text-sm text-muted-foreground font-mono tracking-wide">
                  {p.cpf ? formatCpf(p.cpf) : <span className="italic text-xs">—</span>}
                </span>
                <span className="hidden sm:block">
                  {p.whatsapp ? (
                    <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer"
                      className="text-sm text-green-600 hover:underline">
                      {formatWa(p.whatsapp)}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">—</span>
                  )}
                </span>

                <button
                  onClick={() => setEditing(p)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/20">
            {people.length} pessoa{people.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {creating && (
        <EditModal
          person={null}
          onClose={() => setCreating(false)}
          onSaved={created => {
            setPeople(prev => [created, ...prev]);
            setCreating(false);
          }}
        />
      )}

      {editing && (
        <EditModal
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => {
            setPeople(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
            setEditing(null);
          }}
        />
      )}
    </Layout>
  );
}
