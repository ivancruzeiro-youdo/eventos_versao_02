'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { npsOrgApi } from '@/lib/api';
import { CheckCircle, Upload, X } from 'lucide-react';

const SCORE_LABELS: Record<number, string> = {
  0: 'Péssimo', 1: 'Muito ruim', 2: 'Ruim', 3: 'Abaixo do esperado', 4: 'Insatisfatório',
  5: 'Regular', 6: 'Razoável', 7: 'Bom', 8: 'Muito bom', 9: 'Excelente', 10: 'Incrível!',
};

function scoreColor(score: number): string {
  if (score >= 9) return 'bg-green-500 text-white border-green-500';
  if (score === 8) return 'bg-blue-500 text-white border-blue-500';
  if (score === 7) return 'bg-yellow-400 text-white border-yellow-400';
  return 'bg-red-500 text-white border-red-500';
}

function scoreIdleColor(score: number): string {
  if (score >= 9) return 'border-green-300 text-green-700 hover:bg-green-50';
  if (score === 8) return 'border-blue-300 text-blue-700 hover:bg-blue-50';
  if (score === 7) return 'border-yellow-300 text-yellow-700 hover:bg-yellow-50';
  return 'border-red-300 text-red-700 hover:bg-red-50';
}

export default function NpsOrgPage() {
  const params = useParams();
  const token = params.token as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [event, setEvent] = useState<{ name: string; clientName?: string } | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingScore, setExistingScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [respondenteName, setRespondenteName] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [token]);

  async function load() {
    try {
      const res = await npsOrgApi.get(token);
      setEvent(res.event);
      setAlreadySubmitted(res.alreadySubmitted);
      if (res.score !== null && res.score !== undefined) setExistingScore(res.score);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Apenas imagens são aceitas.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Imagem muito grande. Máximo 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setImageBase64(b64);
      setImagePreview(b64);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedScore === null) {
      setError('Selecione uma nota antes de enviar.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await npsOrgApi.submit(token, {
        score: selectedScore,
        comentario: comentario || undefined,
        respondenteName: respondenteName || undefined,
        imagemBase64: imageBase64 || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar pesquisa');
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

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-muted-foreground text-lg">Pesquisa não encontrada.</p>
          <p className="text-sm text-muted-foreground mt-2">Verifique o link ou entre em contato com o organizador.</p>
        </div>
      </div>
    );
  }

  if (alreadySubmitted || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-sm">
          <CheckCircle className="text-green-500 mx-auto mb-4" size={56} />
          <h1 className="text-2xl font-bold mb-2">Obrigado!</h1>
          <p className="text-muted-foreground">
            {submitted
              ? 'Sua avaliação foi registrada com sucesso.'
              : 'Esta pesquisa já foi respondida.'}
          </p>
          {submitted && existingScore !== null && (
            <div className="mt-4 text-4xl font-bold">
              {existingScore >= 9 ? '🌟' : existingScore >= 7 ? '👍' : '🙏'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Pesquisa de Satisfação</p>
          <h1 className="text-2xl font-bold">{event?.name}</h1>
          {event?.clientName && (
            <p className="text-sm text-muted-foreground mt-1">{event.clientName}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* NPS Score */}
          <div className="bg-card border rounded-2xl p-6">
            <p className="text-center font-semibold mb-1">
              De 0 a 10, como você avalia o evento?
            </p>
            <p className="text-center text-xs text-muted-foreground mb-5">
              0 = Péssimo &nbsp;·&nbsp; 10 = Excelente
            </p>

            <div className="grid grid-cols-11 gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedScore(i)}
                  className={`aspect-square rounded-lg border-2 text-sm font-bold transition-all ${
                    selectedScore === i
                      ? scoreColor(i)
                      : `bg-background ${scoreIdleColor(i)}`
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>

            {selectedScore !== null && (
              <p className="text-center mt-3 text-sm font-medium text-muted-foreground">
                {SCORE_LABELS[selectedScore]}
              </p>
            )}
          </div>

          {/* Name */}
          <div className="bg-card border rounded-2xl p-5">
            <label className="block text-sm font-semibold mb-2">Seu nome (opcional)</label>
            <input
              type="text"
              placeholder="Como quer ser identificado"
              value={respondenteName}
              onChange={(e) => setRespondenteName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Comment */}
          <div className="bg-card border rounded-2xl p-5">
            <label className="block text-sm font-semibold mb-2">Comentário (opcional)</label>
            <textarea
              rows={4}
              placeholder="O que você achou do evento? O que poderia ser melhorado?"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Image */}
          <div className="bg-card border rounded-2xl p-5">
            <label className="block text-sm font-semibold mb-2">Foto (opcional)</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="preview" className="max-h-40 rounded-lg border object-contain" />
                <button
                  type="button"
                  onClick={() => { setImageBase64(''); setImagePreview(''); }}
                  className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Upload size={16} />
                Adicionar foto
              </button>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || selectedScore === null}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? 'Enviando...' : 'Enviar Avaliação'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by YouDO Experience
        </p>
      </div>
    </div>
  );
}
