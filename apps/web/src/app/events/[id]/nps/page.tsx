'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Smile, Meh, Frown, TrendingUp, Users } from 'lucide-react';

interface NPSResponse {
  id: string;
  guestName: string;
  score: number;
  comment: string | null;
  submittedAt: string;
}

interface NPSSummary {
  total: number;
  promoters: number;
  neutrals: number;
  detractors: number;
  npsScore: number;
  responses: NPSResponse[];
}

export default function EventNPSPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [summary, setSummary] = useState<NPSSummary | null>(null);
  const [event, setEvent] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    try {
      setLoading(true);
      // TODO: Add API endpoint for event NPS
      setEvent({ id: eventId, name: 'Evento Exemplo' });
      setSummary({
        total: 45,
        promoters: 32,
        neutrals: 10,
        detractors: 3,
        npsScore: 64,
        responses: [
          { id: '1', guestName: 'João Silva', score: 10, comment: 'Evento excelente! Tudo perfeito.', submittedAt: '2024-01-20T10:00:00Z' },
          { id: '2', guestName: 'Maria Souza', score: 9, comment: 'Muito bom, recomendo!', submittedAt: '2024-01-20T09:30:00Z' },
          { id: '3', guestName: 'Pedro Santos', score: 7, comment: null, submittedAt: '2024-01-20T09:00:00Z' },
        ],
      });
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar NPS');
    } finally {
      setLoading(false);
    }
  }

  function getScoreIcon(score: number) {
    if (score >= 9) return <Smile className="size-5 text-success" />;
    if (score >= 7) return <Meh className="size-5 text-warning" />;
    return <Frown className="size-5 text-destructive" />;
  }

  function getScoreColor(score: number) {
    if (score >= 9) return 'bg-success/10 text-success';
    if (score >= 7) return 'bg-warning/10 text-warning';
    return 'bg-destructive/10 text-destructive';
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para evento
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
          Pesquisa NPS
        </h1>
        <p className="text-muted-foreground">
          {event?.name} • Feedback dos convidados
        </p>
      </div>

      {summary && (
        <>
          {/* NPS Score Card */}
          <div className="bg-card rounded-lg border shadow-sm p-8 mb-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">NPS Score</p>
                <p className={`text-6xl font-bold ${
                  summary.npsScore >= 50 ? 'text-success' : 
                  summary.npsScore >= 0 ? 'text-warning' : 'text-destructive'
                }`}>
                  {summary.npsScore}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {summary.npsScore >= 50 ? 'Excelente!' : 
                   summary.npsScore >= 0 ? 'Bom' : 'Precisa melhorar'}
                </p>
              </div>
              <div className="flex-1 w-full max-w-md">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smile className="size-4 text-success" />
                      <span className="text-sm text-muted-foreground">Promotores (9-10)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-success rounded-full"
                          style={{ width: `${(summary.promoters / summary.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8">{summary.promoters}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Meh className="size-4 text-warning" />
                      <span className="text-sm text-muted-foreground">Neutros (7-8)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-warning rounded-full"
                          style={{ width: `${(summary.neutrals / summary.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8">{summary.neutrals}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Frown className="size-4 text-destructive" />
                      <span className="text-sm text-muted-foreground">Detratores (0-6)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-destructive rounded-full"
                          style={{ width: `${(summary.detractors / summary.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8">{summary.detractors}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Responses */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">
                Respostas ({summary.total})
              </h2>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-destructive">{error}</p>
                </div>
              ) : summary.responses.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="size-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">Nenhuma resposta ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.responses.map((response) => (
                    <div
                      key={response.id}
                      className="flex items-start gap-4 p-4 border rounded-lg"
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${getScoreColor(response.score)}`}>
                        {response.score}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-card-foreground">
                            {response.guestName}
                          </span>
                          {getScoreIcon(response.score)}
                        </div>
                        {response.comment && (
                          <p className="text-sm text-muted-foreground italic">
                            "{response.comment}"
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDate(response.submittedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
