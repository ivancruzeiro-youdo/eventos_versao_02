'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { closureApi } from '@/lib/api';
import { Copy, Upload, X, CheckCircle } from 'lucide-react';

interface Attachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
  preview?: string;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB por arquivo

export default function EncerrarEventoPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ itensQuebrados: '', situacoesReportadas: '' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [npsUrl, setNpsUrl] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`Tipo não suportado: ${file.name}. Use imagens (JPG, PNG, WebP, GIF) ou PDF.`);
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`Arquivo muito grande: ${file.name}. Máximo 10MB por arquivo.`);
        continue;
      }
      const dataBase64 = await toBase64(file);
      const preview = file.type.startsWith('image/') ? dataBase64 : undefined;
      setAttachments((prev) => [
        ...prev,
        { filename: file.name, mimeType: file.type, sizeBytes: file.size, dataBase64, preview },
      ]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await closureApi.encerrar(eventId, {
        itensQuebrados: form.itensQuebrados || undefined,
        situacoesReportadas: form.situacoesReportadas || undefined,
        attachments: attachments.map(({ filename, mimeType, sizeBytes, dataBase64 }) => ({
          filename,
          mimeType,
          sizeBytes,
          dataBase64,
        })),
      });
      setNpsUrl(res.npsUrl);
    } catch (err: any) {
      setError(err.message || 'Erro ao encerrar evento');
    } finally {
      setSubmitting(false);
    }
  }

  function copyNpsUrl() {
    navigator.clipboard.writeText(npsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (npsUrl) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto py-12 text-center">
          <div className="bg-card border rounded-2xl p-8">
            <div className="flex justify-center mb-4">
              <CheckCircle className="text-green-500" size={48} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Evento encerrado!</h1>
            <p className="text-muted-foreground mb-6">
              O formulário de encerramento foi registrado. Compartilhe o link abaixo para coletar o NPS do evento.
            </p>
            <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-3 text-left mb-4">
              <span className="text-sm break-all flex-1 font-mono">{npsUrl}</span>
              <button
                onClick={copyNpsUrl}
                className="shrink-0 p-1.5 rounded hover:bg-accent"
                title="Copiar link"
              >
                {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex gap-3 justify-center">
              <Link
                href={`/events/${eventId}`}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-accent"
              >
                Voltar ao Evento
              </Link>
              <Link
                href={`/events/${eventId}/closure`}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
              >
                Ver Encerramento
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/events" className="hover:text-foreground">Eventos</Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="hover:text-foreground">Detalhes</Link>
          <span>/</span>
          <span className="text-foreground">Encerrar Evento</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Encerrar Evento</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Registre o relatório final do evento. Após o envio, será gerado um link para pesquisa de NPS.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Itens Quebrados */}
          <div className="bg-card border rounded-xl p-5">
            <label className="block text-sm font-semibold mb-2">Itens Quebrados / Danificados</label>
            <textarea
              rows={4}
              placeholder="Liste aqui os itens que foram danificados ou quebrados durante o evento..."
              value={form.itensQuebrados}
              onChange={(e) => setForm((f) => ({ ...f, itensQuebrados: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Situações Reportadas */}
          <div className="bg-card border rounded-xl p-5">
            <label className="block text-sm font-semibold mb-2">Situações Reportadas</label>
            <textarea
              rows={4}
              placeholder="Descreva ocorrências, incidentes ou situações que precisam ser registradas..."
              value={form.situacoesReportadas}
              onChange={(e) => setForm((f) => ({ ...f, situacoesReportadas: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Anexos */}
          <div className="bg-card border rounded-xl p-5">
            <label className="block text-sm font-semibold mb-1">Anexos</label>
            <p className="text-xs text-muted-foreground mb-3">
              Imagens (JPG, PNG, WebP, GIF) e PDFs. Máximo 10MB por arquivo.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center"
            >
              <Upload size={16} />
              Selecionar arquivos
            </button>

            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2">
                    {a.preview ? (
                      <img src={a.preview} alt={a.filename} className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-muted-foreground/10 rounded flex items-center justify-center text-xs font-mono uppercase text-muted-foreground">
                        PDF
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.filename}</p>
                      <p className="text-xs text-muted-foreground">{(a.sizeBytes / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href={`/events/${eventId}`}
              className="flex-1 text-center px-4 py-2.5 rounded-lg border text-sm hover:bg-accent"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? 'Encerrando...' : 'Encerrar Evento e Gerar Link NPS'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
