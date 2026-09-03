'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { closureApi } from '@/lib/api';
import { Copy, CheckCircle, FileText, AlertTriangle, Star, Car, Download, X, Loader2, Users, Clock } from 'lucide-react';

function NpsScore({ score }: { score: number }) {
  let colorClass = 'text-red-600 bg-red-50 border-red-200';
  if (score >= 9) colorClass = 'text-green-600 bg-green-50 border-green-200';
  else if (score === 8) colorClass = 'text-blue-600 bg-blue-50 border-blue-200';
  else if (score === 7) colorClass = 'text-yellow-600 bg-yellow-50 border-yellow-200';

  return (
    <span className={`inline-flex items-center justify-center w-14 h-14 rounded-full border-2 text-2xl font-bold ${colorClass}`}>
      {score}
    </span>
  );
}

export default function ClosurePage() {
  const params = useParams();
  const eventId = params.id as string;
  const [closure, setClosure] = useState<any>(null);
  const [npsUrl, setNpsUrl] = useState('');
  const [checkedInGuests, setCheckedInGuests] = useState<{ id: string; name: string; checkedInAt: string }[]>([]);
  const [parkingEntries, setParkingEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{ filename: string; mimeType: string; dataBase64: string } | null>(null);
  const [attachmentError, setAttachmentError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [res, parkingRes] = await Promise.all([
        closureApi.getClosure(eventId),
        closureApi.getParkingEntries(eventId).catch(() => ({ entries: [] })),
      ]);
      setClosure(res.closure);
      setNpsUrl(res.npsUrl || '');
      setCheckedInGuests(res.checkedInGuests || []);
      setParkingEntries(parkingRes.entries || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar encerramento');
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(npsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function openAttachment(a: { id: string; filename: string; mimeType: string }) {
    setAttachmentError('');
    setLoadingAttachmentId(a.id);
    try {
      const res = await closureApi.getAttachment(a.id);
      const full = res.attachment;
      if (full.mimeType.startsWith('image/')) {
        setViewingAttachment(full);
      } else {
        downloadAttachment(full);
      }
    } catch (err: any) {
      setAttachmentError(err.message || 'Erro ao carregar anexo');
    } finally {
      setLoadingAttachmentId(null);
    }
  }

  function downloadAttachment(a: { filename: string; mimeType: string; dataBase64: string }) {
    const link = document.createElement('a');
    link.href = `data:${a.mimeType};base64,${a.dataBase64}`;
    link.download = a.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
        </div>
      </Layout>
    );
  }

  if (error || !closure) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-destructive mb-4">{error || 'Encerramento não encontrado'}</p>
          <Link href={`/events/${eventId}`} className="text-primary hover:underline text-sm">
            Voltar ao Evento
          </Link>
        </div>
      </Layout>
    );
  }

  const nps = closure.npsOrganizador;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/events" className="hover:text-foreground">Eventos</Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="hover:text-foreground">Detalhes</Link>
          <span>/</span>
          <span className="text-foreground">Encerramento</span>
        </div>

        <h1 className="text-2xl font-bold">Relatório de Encerramento</h1>

        {/* NPS Card */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star size={16} className="text-yellow-500" />
            <h2 className="font-semibold">NPS do Evento</h2>
          </div>

          {nps?.submittedAt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <NpsScore score={nps.score} />
                <div>
                  <p className="text-sm text-muted-foreground">Nota</p>
                  <p className="font-bold text-lg">{nps.score}/10</p>
                  {nps.respondenteName && (
                    <p className="text-sm text-muted-foreground">por {nps.respondenteName}</p>
                  )}
                </div>
              </div>
              {nps.comentario && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm italic">"{nps.comentario}"</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Respondido em {new Date(nps.submittedAt).toLocaleString('pt-BR')}
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-yellow-600 mb-3">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">Aguardando resposta</span>
              </div>
              {npsUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Compartilhe este link para coletar o NPS:
                  </p>
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <span className="text-xs font-mono break-all flex-1">{npsUrl}</span>
                    <button
                      onClick={copyUrl}
                      className="shrink-0 p-1.5 rounded hover:bg-accent"
                      title="Copiar"
                    >
                      {copied ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* A&B excedente */}
        {!!closure.abExcessQty && (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-amber-500" />
              <h2 className="font-semibold">Excedente de A&B confirmado</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Contratado: <strong className="text-foreground">{closure.abContractedQty}</strong> · Check-ins: <strong className="text-foreground">{closure.abCheckedInCount}</strong> · Cobrança adicional confirmada: <strong className="text-foreground">{closure.abExcessQty}</strong> pessoa{closure.abExcessQty === 1 ? '' : 's'}.
            </p>
          </div>
        )}

        {/* Itens Quebrados */}
        {closure.itensQuebrados && (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-orange-500" />
              <h2 className="font-semibold">Itens Quebrados / Danificados</h2>
            </div>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{closure.itensQuebrados}</p>
          </div>
        )}

        {/* Situações Reportadas */}
        {closure.situacoesReportadas && (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-blue-500" />
              <h2 className="font-semibold">Situações Reportadas</h2>
            </div>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{closure.situacoesReportadas}</p>
          </div>
        )}

        {/* Convidados Presentes */}
        {checkedInGuests.length > 0 && (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-emerald-600" />
              <h2 className="font-semibold">Convidados Presentes ({checkedInGuests.length})</h2>
            </div>
            <div className="divide-y">
              {checkedInGuests.map(g => (
                <div key={g.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate pr-2">{g.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Clock size={12} />
                    {new Date(g.checkedInAt).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Veículos Estacionados */}
        {parkingEntries.length > 0 && (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Car size={16} className="text-slate-500" />
              <h2 className="font-semibold">Veículos Estacionados ({parkingEntries.length})</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {parkingEntries.map((p: any) => (
                <div key={p.id} className="border rounded-lg overflow-hidden bg-muted/50">
                  <img src={p.photoUrl} alt={p.guestName} className="w-full h-32 object-cover" />
                  <p className="text-xs font-medium truncate px-2 py-1.5" title={p.guestName}>{p.guestName}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anexos */}
        {closure.attachments?.length > 0 && (
          <div className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-3">Anexos ({closure.attachments.length})</h2>
            {attachmentError && <p className="text-xs text-destructive mb-2">{attachmentError}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {closure.attachments.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => openAttachment(a)}
                  disabled={loadingAttachmentId === a.id}
                  className="border rounded-lg p-3 text-center bg-muted/50 hover:bg-muted transition disabled:opacity-60"
                >
                  <div className="text-2xl mb-1">
                    {loadingAttachmentId === a.id ? (
                      <Loader2 size={22} className="mx-auto animate-spin text-muted-foreground" />
                    ) : a.mimeType.startsWith('image/') ? '🖼️' : '📄'}
                  </div>
                  <p className="text-xs font-medium truncate" title={a.filename}>{a.filename}</p>
                  <p className="text-xs text-muted-foreground">{(a.sizeBytes / 1024).toFixed(0)} KB</p>
                  <p className="text-xs text-primary mt-1">
                    {a.mimeType.startsWith('image/') ? 'Ver' : 'Baixar'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal de visualização de imagem */}
        {viewingAttachment && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={(e) => e.target === e.currentTarget && setViewingAttachment(null)}
          >
            <div className="bg-background w-full max-w-2xl overflow-hidden rounded-2xl shadow-xl">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <p className="text-sm font-medium truncate pr-2">{viewingAttachment.filename}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => downloadAttachment(viewingAttachment)}
                    className="p-1.5 rounded hover:bg-accent"
                    title="Baixar"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => setViewingAttachment(null)}
                    className="p-1.5 rounded hover:bg-accent"
                    title="Fechar"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="max-h-[75vh] overflow-auto bg-black/5 flex items-center justify-center p-2">
                <img
                  src={`data:${viewingAttachment.mimeType};base64,${viewingAttachment.dataBase64}`}
                  alt={viewingAttachment.filename}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
            </div>
          </div>
        )}

        <div className="pb-8">
          <Link
            href={`/events/${eventId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao Evento
          </Link>
        </div>
      </div>
    </Layout>
  );
}
