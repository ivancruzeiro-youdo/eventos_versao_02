'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { uerpApi } from '@/lib/api';
import Link from 'next/link';
import { Download, RefreshCw, X, Package, Trash2, MessageSquare, Link2 } from 'lucide-react';

interface ProductSubitem { group: string; items: string[] }
interface FreelancerService { id: string; name: string; hourlyRate: number; description?: string | null }
interface Product {
  id: string;
  name: string;
  category: string;
  subitems?: ProductSubitem[];
  price?: number;
  unitName?: string;
  unitAbbr?: string;
  externalId?: string;
  services?: FreelancerService[];
}

const TEAM_CATEGORY = 'Fornecimento de Equipe de Apoio';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('products');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Services modal
  const [svcModal, setSvcModal] = useState<Product | null>(null);
  const [allServices, setAllServices] = useState<FreelancerService[]>([]);
  const [linkedSvcIds, setLinkedSvcIds] = useState<Set<string>>(new Set());
  const [savingSvcs, setSavingSvcs] = useState(false);

  // Import modal state
  type ImportStep = 'credentials' | 'preview' | 'done';
  type Subitem = { group: string; items: string[] };
  type PreviewItem = {
    externalId: string; name: string; descriptionLong?: string | null;
    subitems?: Subitem[] | null;
    price?: number | null; categoryId?: string | null; categoryName?: string | null;
    unitId?: string | null; unitName?: string | null; unitAbbr?: string | null;
    alreadyImported: boolean;
  };

  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>('preview');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewCategory, setPreviewCategory] = useState('');
  const [importResult, setImportResult] = useState<{ total: number; created: number; updated: number } | null>(null);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [productsRes, categoriesRes] = await Promise.all([
        uerpApi.products(),
        uerpApi.categories(),
      ]);
      setProducts(productsRes.products || []);
      setCategories(categoriesRes.categories || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openImportModal() {
    setShowImportModal(true);
    setImportStep('preview');
    setPreviewItems([]);
    setSelectedIds(new Set());
    setPreviewSearch('');
    setPreviewCategory('');
    setImportResult(null);
    setImportError('');
    handlePreview();
  }

  async function handlePreview() {
    setLoadingPreview(true);
    setImportError('');
    try {
      const res = await fetch('/api/v2/products/preview-userp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || 'Erro ao buscar produtos'); return; }
      setPreviewItems(data.items || []);
      // Pre-select all not yet imported
      setSelectedIds(new Set(data.items.filter((i: any) => !i.alreadyImported).map((i: any) => i.externalId)));
      setImportStep('preview');
    } catch (err: any) {
      setImportError(err.message || 'Erro inesperado');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const itemsToImport = previewItems.filter(i => selectedIds.has(i.externalId));
      const res = await fetch('/api/v2/products/import-userp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: itemsToImport }),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || 'Erro ao importar produtos'); return; }
      setImportResult(data);
      setImportStep('done');
      await loadData();
    } catch (err: any) {
      setImportError(err.message || 'Erro inesperado');
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

  function toggleSelectAll(items: typeof previewItems) {
    const allSelected = items.every(i => selectedIds.has(i.externalId));
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); items.forEach(i => next.delete(i.externalId)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); items.forEach(i => next.add(i.externalId)); return next; });
    }
  }

  async function openSvcModal(product: Product) {
    const res = await fetch('/api/v2/services', { credentials: 'include' });
    const data = await res.json();
    setAllServices(data.services || []);
    setLinkedSvcIds(new Set((product.services || []).map(s => s.id)));
    setSvcModal(product);
  }

  async function saveSvcs() {
    if (!svcModal) return;
    setSavingSvcs(true);
    try {
      const res = await fetch(`/api/v2/products/${svcModal.id}/services`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceIds: Array.from(linkedSvcIds) }),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(prev => prev.map(p => p.id === svcModal.id ? { ...p, services: data.services } : p));
        setSvcModal(null);
      }
    } finally { setSavingSvcs(false); }
  }

  async function deleteProduct(id: string, name: string) {
    if (!confirm(`Excluir o produto "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/v2/products/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Erro ao excluir produto'); return; }
      await loadData();
    } catch {
      alert('Erro inesperado ao excluir produto');
    }
  }

  const previewCategories = Array.from(new Set(previewItems.map(i => i.categoryName).filter(Boolean)));
  const filteredPreview = previewItems.filter(i => {
    const matchSearch = !previewSearch || i.name.toLowerCase().includes(previewSearch.toLowerCase());
    const matchCat = !previewCategory || i.categoryName === previewCategory;
    return matchSearch && matchCat;
  });

  const filteredProducts = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">Produtos importados do Userp-Satélite</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="px-3 py-2 border border-input rounded-md text-sm hover:bg-muted transition flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
          <button
            onClick={openImportModal}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition flex items-center gap-2"
          >
            <Download size={14} />
            Importar do Userp
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('products')}
            className={`pb-3 border-b-2 transition text-sm font-medium ${
              activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            Produtos ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 border-b-2 transition text-sm font-medium ${
              activeTab === 'categories' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            Categorias ({categories.length})
          </button>
        </nav>
      </div>

      {activeTab === 'products' && (
        <div className="bg-card rounded-lg border">
          <div className="px-4 py-3 border-b flex gap-2">
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-input rounded-md text-sm bg-background"
            />
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background"
            >
              <option value="">Todas as categorias</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="divide-y">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="size-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Nenhum produto encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Clique em "Importar do Userp" para buscar os produtos.
                </p>
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div key={product.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground mb-1">{product.category || '—'}</p>
                    {product.subitems && product.subitems.length > 0 && (
                      <div className="space-y-1">
                        {(product.subitems as ProductSubitem[]).map((sub, si) => (
                          <div key={si}>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">{sub.group}:</span>
                            <span className="text-xs text-muted-foreground">{sub.items.join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    {product.price != null && (
                      <span className="text-sm font-medium">
                        R$ {Number(product.price).toFixed(2)} {product.unitAbbr ? `/ ${product.unitAbbr}` : ''}
                      </span>
                    )}
                    {product.externalId && (
                      <span className="text-xs text-muted-foreground">#{product.externalId}</span>
                    )}
                    {product.category === TEAM_CATEGORY && (product.services || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(product.services || []).map(s => (
                          <span key={s.id} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{s.name}</span>
                        ))}
                      </div>
                    )}
                    {product.category === TEAM_CATEGORY && (
                      <button
                        onClick={() => openSvcModal(product)}
                        className="p-1.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition"
                        title="Vincular serviços"
                      >
                        <Link2 size={14} />
                      </button>
                    )}
                    <Link
                      href={`/admin/products/${product.id}/questions`}
                      className="p-1.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition"
                      title="Gerenciar perguntas"
                    >
                      <MessageSquare size={14} />
                    </Link>
                    <button
                      onClick={() => deleteProduct(product.id, product.name)}
                      className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                      title="Excluir produto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-card rounded-lg border p-6">
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma categoria. Importe produtos primeiro.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <div key={cat.id} className="p-4 bg-muted/40 rounded-lg">
                  <p className="font-medium text-sm">{cat.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">ID: {cat.id}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Services Link Modal */}
      {svcModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold">Vincular Serviços</h2>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svcModal.name}</p>
              </div>
              <button onClick={() => setSvcModal(null)} className="p-1.5 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="p-5">
              {allServices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum serviço cadastrado. Crie serviços em{' '}
                  <a href="/freelancers" className="text-primary underline">Freelancers → Serviços</a>.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {allServices.map(s => (
                    <label key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={linkedSvcIds.has(s.id)}
                        onChange={() => {
                          setLinkedSvcIds(prev => {
                            const next = new Set(prev);
                            next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{s.name}</p>
                        {s.description && <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>}
                      </div>
                      {s.hourlyRate > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">R$ {s.hourlyRate.toFixed(2)}/h</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setSvcModal(null)} className="px-4 py-2 border border-input rounded-md text-sm hover:bg-muted transition">Cancelar</button>
              <button onClick={saveSvcs} disabled={savingSvcs || allServices.length === 0}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50">
                {savingSvcs ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`bg-background rounded-lg border shadow-lg w-full ${importStep === 'preview' ? 'max-w-3xl' : 'max-w-md'}`}>

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold">Importar Produtos do Userp</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {importStep === 'preview' && `Selecionar produtos (${selectedIds.size} selecionados)`}
                  {importStep === 'done' && 'Concluído'}
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {/* Step: preview */}
            {importStep === 'preview' && (
              <>
                <div className="p-3 border-b flex gap-2">
                  <input type="text" placeholder="Buscar..." value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-input rounded-md text-sm bg-background" />
                  <select value={previewCategory} onChange={e => setPreviewCategory(e.target.value)}
                    className="px-3 py-1.5 border border-input rounded-md text-sm bg-background">
                    <option value="">Todas categorias</option>
                    {previewCategories.map(c => <option key={c} value={c!}>{c}</option>)}
                  </select>
                  <button onClick={() => toggleSelectAll(filteredPreview)}
                    className="px-3 py-1.5 border border-input rounded-md text-sm hover:bg-muted transition whitespace-nowrap">
                    {filteredPreview.every(i => selectedIds.has(i.externalId)) ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="overflow-y-auto max-h-[55vh] divide-y">
                  {filteredPreview.map(item => (
                    <div key={item.externalId} className={`${item.alreadyImported ? 'opacity-60' : ''}`}>
                      <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/40 transition">
                        <input type="checkbox" checked={selectedIds.has(item.externalId)} onChange={() => toggleSelect(item.externalId)} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.categoryName || '—'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {item.price != null && (
                            <p className="text-sm font-medium">R$ {item.price.toFixed(2)}{item.unitAbbr ? ` / ${item.unitAbbr}` : ''}</p>
                          )}
                          {item.alreadyImported && <span className="text-xs text-muted-foreground">já importado</span>}
                        </div>
                      </label>
                      {item.subitems && item.subitems.length > 0 && (
                        <div className="px-10 pb-2.5 space-y-2">
                          {item.subitems.map((sub, si) => (
                            <div key={si}>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{sub.group}</p>
                              <div className="flex flex-wrap gap-1">
                                {sub.items.map((it, ii) => (
                                  <span key={ii} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{it}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {importError && (
                  <div className="mx-4 mb-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">{importError}</div>
                )}
                <div className="flex justify-between items-center gap-2 p-4 border-t">
                  <button onClick={() => setImportStep('credentials')} className="px-4 py-2 border border-input rounded-md text-sm hover:bg-muted transition">← Voltar</button>
                  <button onClick={handleImport} disabled={importing || selectedIds.size === 0}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2">
                    {importing ? <><RefreshCw size={14} className="animate-spin" /> Importando...</> : <><Download size={14} /> Importar {selectedIds.size} produto{selectedIds.size !== 1 ? 's' : ''}</>}
                  </button>
                </div>
              </>
            )}

            {/* Step: done */}
            {importStep === 'done' && importResult && (
              <>
                <div className="p-6 text-center">
                  <div className="size-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                    <Download size={24} className="text-green-600" />
                  </div>
                  <p className="font-semibold text-lg mb-1">Importação concluída!</p>
                  <p className="text-muted-foreground text-sm">
                    {importResult.total} produtos processados — <span className="text-green-600 font-medium">{importResult.created} criados</span>, <span className="font-medium">{importResult.updated} atualizados</span>.
                  </p>
                </div>
                <div className="flex justify-end p-4 border-t">
                  <button onClick={() => setShowImportModal(false)} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition">Fechar</button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </Layout>
  );
}
