'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { closureApi } from '@/lib/api';
import { Copy, Upload, X, CheckCircle, AlertTriangle, Plus, Trash2 } from 'lucide-react';

interface Attachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
  preview?: string;
}

// Item avulso a cobrar (quebrado/danificado, taxa extra) — rascunho local antes de enviar;
// valores em string pra input controlado aceitar campo vazio/parcial sem virar NaN.
interface ChargeDraft {
  description: string;
  unitValue: string;
  quantity: string;
}

function fmtBrl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // A&B excedente: check-ins vs. quantidade contratada
  const [abContractedQty, setAbContractedQty] = useState<number | null>(null);
  const [abCheckedInCount, setAbCheckedInCount] = useState<number | null>(null);
  const [abExcessQty, setAbExcessQty] = useState<string>('');
  const [abExcessUnitValue, setAbExcessUnitValue] = useState<string>('');

  // Itens avulsos a cobrar (quebrados/danificados, taxas extra) — lista livre, uma linha por
  // item; cada um soma no total enviado à Userp (cobra_valor) junto com o excedente de A&B.
  const [charges, setCharges] = useState<ChargeDraft[]>([]);

  useEffect(() => {
    async function loadAbSummary() {
      try {
        const [evRes, itemsRes] = await Promise.all([
          fetch(`/api/v2/events/${eventId}`, { credentials: 'include' }),
          fetch(`/api/v2/events/${eventId}/items?category=ab`, { credentials: 'include' }),
        ]);
        if (!evRes.ok || !itemsRes.ok) return;
        const evData = await evRes.json();
        const itemsData = await itemsRes.json();
        const guests: { status: string }[] = evData.event?.guests ?? [];
        // /items não filtra por categoria no servidor (o ?category= é só documentação da
        // intenção) — filtra aqui, senão um item de outra categoria com quantidade maior
        // (ex.: equipe) inflava o "contratado" de A&B.
        const allItems: { category: string; quantity: number; product?: { price: number | null } | null }[] = itemsData.items ?? [];
        const items = allItems.filter(i => i.category === 'ab');
        const checkedIn = guests.filter(g => g.status === 'checked_in').length;
        const contracted = items.length > 0 ? Math.max(...items.map(i => i.quantity)) : null;
        setAbCheckedInCount(checkedIn);
        setAbContractedQty(contracted);
        if (contracted !== null && checkedIn > contracted) {
          setAbExcessQty(String(checkedIn - contracted));
        }
        // Sugestão de valor unitário: soma do preço cadastrado dos produtos de A&B (pacote
        // por pessoa) — só um ponto de partida, o operador confere/ajusta antes de enviar.
        const suggestedUnitValue = items.reduce((sum, i) => sum + (i.product?.price ?? 0), 0);
        if (suggestedUnitValue > 0) setAbExcessUnitValue(String(suggestedUnitValue));
      } catch { /* silent — não bloqueia o encerramento */ }
    }
    loadAbSummary();
  }, [eventId]);

  const suggestedExcess = abContractedQty !== null && abCheckedInCount !== null
    ? Math.max(0, abCheckedInCount - abContractedQty)
    : 0;

  const abExcessSubtotal = (Number(abExcessQty) || 0) * (Number(abExcessUnitValue) || 0);
  const chargesTotal = charges.reduce((sum, c) => sum + (Number(c.quantity) || 0) * (Number(c.unitValue) || 0), 0);
  const grandTotal = abExcessSubtotal + chargesTotal;

  function addCharge() {
    setCharges(prev => [...prev, { description: '', unitValue: '', quantity: '1' }]);
  }
  function updateCharge(idx: number, patch: Partial<ChargeDraft>) {
    setCharges(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function removeCharge(idx: number) {
    setCharges(prev => prev.filter((_, i) => i !== idx));
  }

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
      const excessNum = abExcessQty.trim() ? Number(abExcessQty) : undefined;
      const excessUnitNum = abExcessUnitValue.trim() ? Number(abExcessUnitValue) : undefined;
      const validCharges = charges
        .filter(c => c.description.trim() && Number(c.unitValue) > 0 && Number(c.quantity) > 0)
        .map(c => ({ description: c.description.trim(), unitValue: Number(c.unitValue), quantity: Number(c.quantity) }));
      const res = await closureApi.encerrar(eventId, {
        itensQuebrados: form.itensQuebrados || undefined,
        situacoesReportadas: form.situacoesReportadas || undefined,
        abExcessQty: excessNum !== undefined && !isNaN(excessNum) ? excessNum : undefined,
        abExcessUnitValue: excessUnitNum !== undefined && !isNaN(excessUnitNum) ? excessUnitNum : undefined,
        charges: validCharges.length > 0 ? validCharges : undefined,
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
          {/* A&B excedente */}
          {suggestedExcess > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <h2 className="font-semibold text-amber-900 dark:text-amber-300">Check-ins acima do contratado para A&B</h2>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-400 mb-3">
                Contratado: <strong>{abContractedQty}</strong> · Check-ins realizados: <strong>{abCheckedInCount}</strong> ·
                {' '}Sugestão de cobrança adicional: <strong>{suggestedExcess}</strong> pessoa{suggestedExcess === 1 ? '' : 's'}.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-amber-900 dark:text-amber-300 mb-1">
                    Quantidade a cobrar como adicional (ajuste se necessário)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={abExcessQty}
                    onChange={(e) => setAbExcessQty(e.target.value)}
                    className="w-40 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-amber-900 dark:text-amber-300 mb-1">
                    Valor unitário (por pessoa)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    value={abExcessUnitValue}
                    onChange={(e) => setAbExcessUnitValue(e.target.value)}
                    className="w-32 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {abExcessSubtotal > 0 && (
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 pb-2">
                    Subtotal: R$ {fmtBrl(abExcessSubtotal)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Itens a cobrar (quebrados/danificados, taxas extra) */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-semibold">Itens a Cobrar do Cliente</label>
              <button
                type="button"
                onClick={addCharge}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border hover:bg-accent transition"
              >
                <Plus size={13} /> Adicionar item
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Item quebrado/danificado, taxa extra, etc. — descrição, valor unitário e quantidade. Cada linha soma no total enviado no check-out da Userp.
            </p>

            {charges.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum item cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {charges.map((c, i) => {
                  const subtotal = (Number(c.quantity) || 0) * (Number(c.unitValue) || 0);
                  return (
                    <div key={i} className="flex flex-wrap items-end gap-2 bg-muted/30 rounded-lg p-3">
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs text-muted-foreground mb-1">Descrição</label>
                        <input
                          type="text"
                          placeholder="Ex: Taça de cristal quebrada"
                          value={c.description}
                          onChange={(e) => updateCharge(i, { description: e.target.value })}
                          className="w-full border rounded-lg px-2.5 py-1.5 text-sm bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Valor unitário</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0,00"
                          value={c.unitValue}
                          onChange={(e) => updateCharge(i, { unitValue: e.target.value })}
                          className="w-28 border rounded-lg px-2.5 py-1.5 text-sm bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Quantidade</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={c.quantity}
                          onChange={(e) => updateCharge(i, { quantity: e.target.value })}
                          className="w-20 border rounded-lg px-2.5 py-1.5 text-sm bg-background"
                        />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground pb-1.5 min-w-[110px]">
                        R$ {fmtBrl(subtotal)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeCharge(i)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition"
                        title="Remover"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {grandTotal > 0 && (
              <p className="text-right text-sm font-semibold mt-3 pt-3 border-t">
                Total a cobrar: R$ {fmtBrl(grandTotal)}
              </p>
            )}
          </div>

          {/* Itens Quebrados */}
          <div className="bg-card border rounded-xl p-5">
            <label className="block text-sm font-semibold mb-2">Observações sobre Itens Quebrados / Danificados</label>
            <p className="text-xs text-muted-foreground mb-2">
              Contexto geral, sem valor associado — para cobrar um item específico com valor, use "Itens a Cobrar do Cliente" acima.
            </p>
            <textarea
              rows={4}
              placeholder="Descreva o contexto, se necessário..."
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
