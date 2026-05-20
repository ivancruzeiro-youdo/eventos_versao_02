'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { venuesApi } from '@/lib/api';
import { MapPin, Plus, Download, RefreshCw, X, Search } from 'lucide-react';

interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  capacity: number | null;
}

type ImportStep = 'credentials' | 'preview' | 'done';

interface PreviewVenue {
  externalId: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  capacity?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  alreadyImported: boolean;
}

export default function VenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Import modal
  const [showModal, setShowModal] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>('preview');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewVenue[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewSearch, setPreviewSearch] = useState('');
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null);

  useEffect(() => { loadVenues(); }, []);

  async function loadVenues() {
    try {
      setLoading(true);
      const response = await venuesApi.list();
      setVenues(response.venues || []);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar locais');
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setShowModal(true);
    setImportStep('preview');
    setPreviewItems([]);
    setSelectedIds(new Set());
    setPreviewSearch('');
    setImportError('');
    setImportResult(null);
    handlePreview();
  }

  function closeModal() {
    setShowModal(false);
  }

  async function handlePreview() {
    setImportError('');
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/v2/venues/preview-userp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || 'Erro ao buscar espaços'); return; }
      setPreviewItems(data.items || []);
      // Pre-select not-yet-imported
      setSelectedIds(new Set((data.items || []).filter((i: PreviewVenue) => !i.alreadyImported).map((i: PreviewVenue) => i.externalId)));
      setImportStep('preview');
    } catch {
      setImportError('Erro de conexão ao buscar espaços');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleImport() {
    setImportError('');
    setImporting(true);
    try {
      const items = previewItems.filter(i => selectedIds.has(i.externalId));
      const res = await fetch('/api/v2/venues/import-userp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || 'Erro ao importar'); return; }
      setImportResult({ created: data.created, updated: data.updated });
      setImportStep('done');
      await loadVenues();
    } catch {
      setImportError('Erro de conexão ao importar');
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const filtered = filteredPreview;
    const allSelected = filtered.every(i => selectedIds.has(i.externalId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      filtered.forEach(i => allSelected ? next.delete(i.externalId) : next.add(i.externalId));
      return next;
    });
  }

  const filteredPreview = previewItems.filter(i =>
    !previewSearch || i.name.toLowerCase().includes(previewSearch.toLowerCase()) ||
    i.city?.toLowerCase().includes(previewSearch.toLowerCase())
  );

  return (
    <Layout>
      {/* Import Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-lg font-semibold">
                {importStep === 'preview' && `Importar Espaços do Userp (${previewItems.length} encontrados)`}
                {importStep === 'done' && 'Importação Concluída'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-muted rounded transition"><X size={18} /></button>
            </div>

            {/* Step: Preview */}
            {importStep === 'preview' && (
              <>
                <div className="px-4 pt-3 pb-2 border-b shrink-0 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={previewSearch} onChange={e => setPreviewSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-input rounded-md text-sm bg-background"
                      placeholder="Buscar por nome ou cidade..." />
                  </div>
                  <button onClick={toggleSelectAll}
                    className="px-3 py-1.5 border border-input rounded-md text-sm hover:bg-muted transition whitespace-nowrap">
                    {filteredPreview.every(i => selectedIds.has(i.externalId)) ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y">
                  {filteredPreview.map(item => (
                    <label key={item.externalId} className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition ${item.alreadyImported ? 'opacity-60' : ''}`}>
                      <input type="checkbox" checked={selectedIds.has(item.externalId)} onChange={() => toggleSelect(item.externalId)} className="mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.city || item.address || '—'}
                          {item.capacity ? ` · ${item.capacity} pessoas` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-muted-foreground">#{item.externalId}</span>
                        {item.alreadyImported && <p className="text-xs text-muted-foreground">já importado</p>}
                      </div>
                    </label>
                  ))}
                  {filteredPreview.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">Nenhum espaço encontrado</p>
                  )}
                </div>
                {importError && (
                  <div className="mx-4 mb-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">{importError}</div>
                )}
                <div className="flex justify-between items-center gap-2 p-4 border-t shrink-0">
                  <button onClick={() => setImportStep('credentials')} className="px-4 py-2 border border-input rounded-md text-sm hover:bg-muted transition">← Voltar</button>
                  <button onClick={handleImport} disabled={importing || selectedIds.size === 0}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2">
                    {importing ? <><RefreshCw size={14} className="animate-spin" /> Importando...</> : <><Download size={14} /> Importar {selectedIds.size} espaço{selectedIds.size !== 1 ? 's' : ''}</>}
                  </button>
                </div>
              </>
            )}

            {/* Step: Done */}
            {importStep === 'done' && (
              <div className="p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Download size={24} className="text-green-600" />
                </div>
                <h3 className="text-lg font-semibold">Importação concluída!</h3>
                {importResult && (
                  <div className="flex justify-center gap-8">
                    <div><p className="text-3xl font-bold text-foreground">{importResult.created}</p><p className="text-sm text-muted-foreground">criados</p></div>
                    <div><p className="text-3xl font-bold text-foreground">{importResult.updated}</p><p className="text-sm text-muted-foreground">atualizados</p></div>
                  </div>
                )}
                <button onClick={closeModal} className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Locais</h1>
          <p className="text-muted-foreground">Gerencie os locais dos seus eventos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openModal}
            className="px-4 py-2 border border-input rounded-lg hover:bg-muted transition text-sm font-medium flex items-center gap-2">
            <Download className="size-4" />
            Importar do Userp
          </button>
          <Link href="/venues/new"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2">
            <Plus className="size-4" />
            Novo Local
          </Link>
        </div>
      </div>

      {/* Venues List */}
      <div className="bg-card rounded-lg border shadow-sm">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-4">Carregando locais...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-destructive">{error}</p>
              <button
                onClick={loadVenues}
                className="mt-2 text-primary hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          ) : venues.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <MapPin className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum local cadastrado.</p>
              <Link
                href="/venues/new"
                className="mt-2 inline-block text-primary hover:underline"
              >
                Cadastrar primeiro local →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {venues.map((venue) => (
                <Link
                  key={venue.id}
                  href={`/venues/${venue.id}`}
                  className="block"
                >
                  <div className="bg-card rounded-lg border hover:border-primary/50 transition p-6 cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <MapPin className="size-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-card-foreground truncate">
                          {venue.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {venue.city && venue.state
                            ? `${venue.city}, ${venue.state}`
                            : venue.address || 'Endereço não definido'}
                        </p>
                        {venue.capacity && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Capacidade: {venue.capacity} pessoas
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
