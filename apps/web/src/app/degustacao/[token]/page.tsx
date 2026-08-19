'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { degustacaoLinkApi } from '@/lib/api';
import { CheckCircle, Calendar, MapPin, Wine, Plus, X } from 'lucide-react';

interface LinkData {
  confirmed: boolean;
  contato: { nome: string; telefone: string | null; email: string | null };
  degustacao: { maxGuests: number; menu: string | null };
  menuChoices: { label: string; chosen: string[] }[];
  event: { id: string; startAt: string | null; venues: { name: string }[] };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Data a definir';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
}

export default function DegustacaoLinkPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [nomes, setNomes] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [token]);

  async function load() {
    try {
      const res = await degustacaoLinkApi.get(token);
      setData(res);
      if (res.contato?.nome) setNomes([res.contato.nome]);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  function updateNome(i: number, value: string) {
    setNomes(prev => prev.map((n, idx) => idx === i ? value : n));
  }

  function addNome() {
    if (!data || nomes.length >= data.degustacao.maxGuests) return;
    setNomes(prev => [...prev, '']);
  }

  function removeNome(i: number) {
    setNomes(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const clean = nomes.map(n => n.trim()).filter(Boolean);
    if (clean.length === 0) {
      setError('Informe ao menos um nome.');
      return;
    }
    setSubmitting(true);
    try {
      await degustacaoLinkApi.enroll(token, clean);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao confirmar inscrição');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-muted-foreground text-lg">Link inválido.</p>
          <p className="text-sm text-muted-foreground mt-2">Verifique o link ou entre em contato com quem enviou o convite.</p>
        </div>
      </div>
    );
  }

  const isPast = data.event.startAt ? new Date(data.event.startAt) < new Date() : false;
  const confirmed = data.confirmed || submitted;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <Wine className="mx-auto mb-2 text-primary" size={32} />
          <p className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Degustação</p>
          {data.degustacao.menu && <h1 className="text-2xl font-bold">{data.degustacao.menu}</h1>}
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-3 mb-6">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Calendar className="size-4 shrink-0" /> {formatDateTime(data.event.startAt)}
          </p>
          {data.event.venues[0] && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="size-4 shrink-0" /> {data.event.venues[0].name}
            </p>
          )}
          {data.menuChoices.length > 0 && (
            <div className="pt-2 border-t space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">O que vai ser servido</p>
              {data.menuChoices.map((c, i) => (
                <p key={i} className="text-sm">
                  <span className="text-muted-foreground">{c.label}:</span> {c.chosen.join(', ')}
                </p>
              ))}
            </div>
          )}
        </div>

        {confirmed ? (
          <div className="text-center">
            <CheckCircle className="text-green-500 mx-auto mb-4" size={56} />
            <h2 className="text-xl font-bold mb-2">Inscrição confirmada!</h2>
            <p className="text-muted-foreground">Te esperamos na data acima.</p>
          </div>
        ) : isPast ? (
          <div className="text-center">
            <p className="text-muted-foreground">Essa data já passou e não há mais ocorrências futuras agendadas.</p>
            <p className="text-sm text-muted-foreground mt-2">Entre em contato com quem enviou o convite pra saber da próxima.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
            <p className="text-sm font-medium">Quem vai comparecer? (até {data.degustacao.maxGuests})</p>
            {nomes.map((nome, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => updateNome(i, e.target.value)}
                  placeholder={i === 0 ? 'Seu nome' : `Convidado ${i}`}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
                {nomes.length > 1 && (
                  <button type="button" onClick={() => removeNome(i)} className="p-2 text-muted-foreground hover:text-destructive">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {nomes.length < data.degustacao.maxGuests && (
              <button type="button" onClick={addNome} className="text-sm text-primary flex items-center gap-1 hover:underline">
                <Plus className="size-3.5" /> Adicionar convidado
              </button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={submitting}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
              {submitting ? 'Confirmando...' : 'Confirmar Inscrição'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
