'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText, Users, Calendar, Clock, Download, Eye, EyeOff,
  Upload, Trash2, Plus, Search, CheckCircle, AlertCircle,
  FileImage, FileVideo, User, ChevronDown, ChevronRight, X,
  Utensils, Circle, LayoutGrid, Lock, MonitorPlay, Video, Music,
  Image as ImageIcon, Pencil, Check,
} from 'lucide-react';
import { ELEMENT_ICONS } from '@/components/layout-element-icons';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventSummary {
  id: string;
  name: string;
  clientName: string;
  startAt: string | null;
  setupAt: string | null;
  teardownAt: string | null;
  status: string;
  venues: { id: string; name: string }[];
}

interface ClientFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  comment: string | null;
  createdAt: string;
}

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  status: string;
  checkedInAt: string | null;
}

interface Professional {
  id: string;
  role: string;
  checkedInAt: string | null;
  person: { id: string; name: string; whatsapp: string | null };
}

interface Schedule {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  description: string | null;
  team: { id: string; name: string } | null;
}

interface Approval {
  itemType: string;
  itemId: string;
  approvedAt: string;
}

type ApprovalSet = Set<string>; // key: `${itemType}:${itemId}`

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function statusLabel(s: string) {
  return { pending: 'Pendente', confirmed: 'Confirmado', declined: 'Recusou', checked_in: 'Check-in' }[s] || s;
}

function statusColor(s: string) {
  return {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    checked_in: 'bg-blue-100 text-blue-700',
  }[s] || 'bg-gray-100 text-gray-600';
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <FileImage size={20} className="text-blue-500" />;
  if (mimeType.startsWith('video/')) return <FileVideo size={20} className="text-purple-500" />;
  return <FileText size={20} className="text-gray-500" />;
}

// ── Auth screen ───────────────────────────────────────────────────────────────

function AuthScreen({ token, onAuth }: { token: string; onAuth: (jwt: string, event: EventSummary) => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/client/${token}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationNumber: code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao autenticar'); return; }
      sessionStorage.setItem(`client_jwt_${token}`, data.sessionToken);
      onAuth(data.sessionToken, data.event);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Calendar size={24} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Portal do Cliente</h1>
          <p className="text-sm text-gray-500 mt-1">Digite o número de reserva para acessar o seu evento</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            autoFocus
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Número de reserva"
            className="w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {loading ? 'Verificando...' : 'Acessar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Files tab ─────────────────────────────────────────────────────────────────

function FilesTab({ token, jwt }: { token: string; jwt: string }) {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/client/${token}/files`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setFiles(d.files || []))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  async function download(file: ClientFile) {
    const res = await fetch(`/api/v2/client/${token}/files/${file.id}/download`, {
      headers: { 'x-client-auth': jwt },
    });
    if (res.ok) {
      const data = await res.json();
      window.open(data.downloadUrl, '_blank');
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando arquivos...</div>;

  if (files.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum arquivo disponível ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map(file => (
        <div key={file.id} className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
            {fileIcon(file.mimeType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate text-sm">{file.name}</p>
            <p className="text-xs text-gray-400">{formatSize(file.sizeBytes)} · {formatDate(file.createdAt)}</p>
            {file.comment && <p className="text-xs text-gray-500 mt-0.5">{file.comment}</p>}
          </div>
          <button
            onClick={() => download(file)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium transition shrink-0"
          >
            <Download size={14} /> VER
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Media tab (painel de LED) ────────────────────────────────────────────────

interface ClientMediaAsset {
  id: string;
  name: string;
  mediaType: 'video' | 'image' | 'audio';
  sizeBytes: number;
  comment: string | null;
}

const MEDIA_MAX_SIZE_BYTES: Record<'video' | 'image' | 'audio', number> = {
  video: 500 * 1024 * 1024,
  image: 50 * 1024 * 1024,
  audio: 500 * 1024 * 1024,
};

function mediaTypeFromMime(mimeType: string): 'video' | 'image' | 'audio' | null {
  if (mimeType === 'image/svg+xml') return null;
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function mediaIcon(type: string) {
  if (type === 'video') return <Video size={16} className="text-blue-500 shrink-0" />;
  if (type === 'audio') return <Music size={16} className="text-purple-500 shrink-0" />;
  return <ImageIcon size={16} className="text-green-500 shrink-0" />;
}

function MediaTab({ token, jwt }: { token: string; jwt: string }) {
  const [assets, setAssets] = useState<ClientMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/client/${token}/media`, { headers: { 'x-client-auth': jwt } });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } finally {
      setLoading(false);
    }
  }, [token, jwt]);

  useEffect(() => { load(); }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const detected = mediaTypeFromMime(file.type);
    if (!detected) {
      alert('Formato não suportado — envie vídeo, imagem ou áudio.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MEDIA_MAX_SIZE_BYTES[detected]) {
      alert(`Arquivo muito grande (limite: ${Math.round(MEDIA_MAX_SIZE_BYTES[detected] / (1024 * 1024))}MB).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress('Preparando envio...');
    try {
      const presignRes = await fetch(`/api/v2/client/${token}/media/presign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        alert(err.error || 'Erro ao preparar upload.');
        return;
      }
      const { uploadUrl, s3Key, mediaType } = await presignRes.json();

      setUploadProgress('Enviando arquivo...');
      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) { alert('Falha ao enviar o arquivo.'); return; }

      setUploadProgress('Confirmando...');
      await fetch(`/api/v2/client/${token}/media/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify({ name: file.name, mediaType, mimeType: file.type, sizeBytes: file.size, s3Key }),
      });
      await load();
    } catch {
      alert('Erro ao enviar o arquivo.');
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openEdit(asset: ClientMediaAsset) {
    setEditingId(asset.id);
    setEditComment(asset.comment || '');
  }

  async function saveComment(assetId: string) {
    await fetch(`/api/v2/client/${token}/media/${assetId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
      body: JSON.stringify({ comment: editComment }),
    });
    setEditingId(null);
    load();
  }

  async function remove(assetId: string, name: string) {
    if (!confirm(`Remover "${name}"?`)) return;
    await fetch(`/api/v2/client/${token}/media/${assetId}`, { method: 'DELETE', headers: { 'x-client-auth': jwt } });
    load();
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando mídia...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-900 mb-3">
          Envie fotos, vídeos ou áudios pra tocar no painel de LED do seu evento. Use o comentário pra avisar quando cada um deve ser usado (ex: "usar às 20h").
        </p>
        <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer text-sm bg-white transition ${
          uploading ? 'opacity-50 pointer-events-none' : 'hover:border-primary'
        }`}>
          <Upload size={16} className="text-gray-400" />
          <span className="text-gray-500">{uploading ? uploadProgress : 'Enviar vídeo, imagem ou áudio'}</span>
          <input ref={fileInputRef} type="file" accept="video/*,image/*,audio/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
      </div>

      {assets.length === 0 ? (
        <div className="py-12 text-center">
          <MonitorPlay size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhuma mídia enviada ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map(asset => (
            <div key={asset.id} className="bg-white border rounded-xl p-4 flex items-center gap-3">
              {mediaIcon(asset.mediaType)}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate text-sm">{asset.name}</p>
                {editingId === asset.id ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      autoFocus
                      value={editComment}
                      onChange={e => setEditComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveComment(asset.id); if (e.key === 'Escape') setEditingId(null); }}
                      placeholder="Ex: usar às 20h"
                      className="flex-1 text-xs px-2 py-1 border rounded"
                    />
                    <button onClick={() => saveComment(asset.id)} className="p-1 text-green-600"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-gray-400"><X size={14} /></button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">{asset.comment || 'Sem comentário'}</p>
                )}
              </div>
              {editingId !== asset.id && (
                <>
                  <button onClick={() => openEdit(asset)} className="p-1.5 text-gray-400 hover:text-primary rounded shrink-0"><Pencil size={14} /></button>
                  <button onClick={() => remove(asset.id, asset.name)} className="p-1.5 text-gray-400 hover:text-red-500 rounded shrink-0"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Spotify tab ───────────────────────────────────────────────────────────────

interface ClientSpotifyPlaylist {
  id: string;
  spotifyPlaylistId: string;
  spotifyPlaylistName: string;
  comment: string | null;
}

interface ClientSpotifyVenue {
  venueId: string;
  venueName: string;
  playlists: ClientSpotifyPlaylist[];
}

function SpotifyTab({ token, jwt }: { token: string; jwt: string }) {
  const [venues, setVenues] = useState<ClientSpotifyVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlByVenue, setUrlByVenue] = useState<Record<string, string>>({});
  const [commentByVenue, setCommentByVenue] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/client/${token}/spotify-playlists`, { headers: { 'x-client-auth': jwt } });
      if (res.ok) {
        const data = await res.json();
        setVenues(data.venues || []);
      }
    } finally {
      setLoading(false);
    }
  }, [token, jwt]);

  useEffect(() => { load(); }, [load]);

  async function add(venueId: string) {
    const url = urlByVenue[venueId]?.trim();
    if (!url) return;
    setAdding(venueId);
    setAddError('');
    try {
      const res = await fetch(`/api/v2/client/${token}/spotify-playlists`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify({ venueId, url, comment: commentByVenue[venueId] || '' }),
      });
      if (res.ok) {
        setUrlByVenue(v => ({ ...v, [venueId]: '' }));
        setCommentByVenue(v => ({ ...v, [venueId]: '' }));
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error || 'Erro ao adicionar playlist.');
      }
    } finally {
      setAdding(null);
    }
  }

  async function remove(playlistId: string) {
    if (!confirm('Remover esta playlist?')) return;
    await fetch(`/api/v2/client/${token}/spotify-playlists/${playlistId}`, { method: 'DELETE', headers: { 'x-client-auth': jwt } });
    load();
  }

  async function saveComment(playlistId: string) {
    await fetch(`/api/v2/client/${token}/spotify-playlists/${playlistId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
      body: JSON.stringify({ comment: editComment }),
    });
    setEditingId(null);
    load();
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando Spotify...</div>;

  if (venues.length === 0) {
    return (
      <div className="py-12 text-center">
        <Music size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum espaço vinculado a este evento ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {venues.map(v => (
        <div key={v.venueId} className="bg-white border rounded-xl p-4 space-y-3">
          <p className="font-medium text-gray-900 text-sm flex items-center gap-2"><Music size={16} className="text-green-600" /> {v.venueName}</p>

          {v.playlists.length > 0 && (
            <div className="space-y-2">
              {v.playlists.map(p => (
                <div key={p.id} className="border rounded-lg px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.spotifyPlaylistName}</p>
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          autoFocus
                          value={editComment}
                          onChange={e => setEditComment(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveComment(p.id); if (e.key === 'Escape') setEditingId(null); }}
                          placeholder="Ex: tocar no jantar"
                          className="flex-1 text-xs px-2 py-1 border rounded"
                        />
                        <button onClick={() => saveComment(p.id)} className="p-1 text-green-600"><Check size={14} /></button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">{p.comment || 'Sem comentário'}</p>
                    )}
                  </div>
                  {editingId !== p.id && (
                    <>
                      <button onClick={() => { setEditingId(p.id); setEditComment(p.comment || ''); }} className="p-1.5 text-gray-400 hover:text-primary rounded shrink-0"><Pencil size={14} /></button>
                      <button onClick={() => remove(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded shrink-0"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <input
              value={commentByVenue[v.venueId] || ''}
              onChange={e => setCommentByVenue(s => ({ ...s, [v.venueId]: e.target.value }))}
              placeholder="Comentário (opcional) — ex: tocar no jantar"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <div className="flex gap-2">
              <input
                value={urlByVenue[v.venueId] || ''}
                onChange={e => setUrlByVenue(s => ({ ...s, [v.venueId]: e.target.value }))}
                placeholder="Cole o link da playlist (open.spotify.com/playlist/...)"
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              />
              <button
                onClick={() => add(v.venueId)}
                disabled={adding === v.venueId || !urlByVenue[v.venueId]?.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            {addError && <p className="text-xs text-red-500">{addError}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Guests tab ────────────────────────────────────────────────────────────────

function GuestsTab({ token, jwt }: { token: string; jwt: string }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', cpf: '' });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importAsConfirmed, setImportAsConfirmed] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (q) params.set('search', q);
    const res = await fetch(`/api/v2/client/${token}/guests?${params}`, { headers: { 'x-client-auth': jwt } });
    const data = await res.json();
    setGuests(data.guests || []);
    setTotal(data.pagination?.total || 0);
    setLoading(false);
  }, [token, jwt]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingGuest(null);
    setForm({ name: '', email: '', phone: '', cpf: '' });
    setShowForm(true);
  }

  function openEdit(g: Guest) {
    setEditingGuest(g);
    setForm({ name: g.name, email: g.email || '', phone: g.phone || '', cpf: g.cpf || '' });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editingGuest
        ? `/api/v2/client/${token}/guests/${editingGuest.id}`
        : `/api/v2/client/${token}/guests`;
      const res = await fetch(url, {
        method: editingGuest ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify(form),
      });
      if (res.ok) { setShowForm(false); load(search); }
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remover este convidado?')) return;
    await fetch(`/api/v2/client/${token}/guests/${id}`, {
      method: 'DELETE', headers: { 'x-client-auth': jwt },
    });
    load(search);
  }

  function parseGuestText(text: string) {
    const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
    const isHeader = headers.some(h => ['nome', 'name', 'email', 'cpf'].includes(h));
    const dataLines = isHeader ? lines.slice(1) : lines;
    return dataLines.map(line => {
      const cols = line.split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (isHeader) {
        const row: any = {};
        headers.forEach((h, i) => { row[h] = cols[i] || ''; });
        return { name: row.nome || row.name || cols[0], email: row.email || '', phone: row.telefone || row.phone || '', cpf: row.cpf || '' };
      }
      return { name: cols[0], email: cols[1] || '', phone: cols[2] || '', cpf: cols[3] || '' };
    }).filter(g => g.name?.trim());
  }

  async function doImport(text: string) {
    const guestList = parseGuestText(text);
    if (guestList.length === 0) { alert('Nenhum convidado válido encontrado.'); return; }
    setImporting(true);
    try {
      const res = await fetch(`/api/v2/client/${token}/guests/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify({ guests: guestList, forceStatus: importAsConfirmed ? 'confirmed' : undefined }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Importação concluída: ${data.results.created} criados, ${data.results.updated} atualizados, ${data.results.skipped} ignorados.`);
        setCsvText('');
        setShowCsvModal(false);
        load(search);
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  const confirmed = guests.filter(g => g.status === 'confirmed' || g.status === 'checked_in').length;
  const pending = guests.filter(g => g.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: total, color: 'bg-gray-100 text-gray-800' },
          { label: 'Confirmados', value: confirmed, color: 'bg-green-100 text-green-800' },
          { label: 'Pendentes', value: pending, color: 'bg-yellow-100 text-yellow-800' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar convidado..."
            value={search}
            onChange={e => { setSearch(e.target.value); load(e.target.value); }}
            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
        >
          <Plus size={14} /> Adicionar
        </button>
        <button
          onClick={() => { setCsvText(''); setShowCsvModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
        >
          <Upload size={14} /> CSV / Colar
        </button>
      </div>

      {/* CSV / Paste modal */}
      {showCsvModal && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm text-blue-900">Importar lista de convidados</p>
            <button onClick={() => setShowCsvModal(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <p className="text-xs text-gray-500">
            Colunas: <strong>nome, email, telefone, cpf</strong> — separadas por vírgula ou ponto-e-vírgula. Uma linha por convidado. Pode colar diretamente ou selecionar um arquivo .csv.
          </p>
          <label className="flex items-center gap-2 px-3 py-2 border border-blue-300 rounded-lg cursor-pointer hover:bg-blue-100 w-fit text-sm text-blue-700 bg-white">
            <Upload size={14} /> Selecionar arquivo .csv
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
          </label>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={"João Silva, joao@email.com, 11999999999\nMaria Souza, maria@email.com, 11888888888\nPedro Costa"}
            rows={6}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-blue-300 outline-none resize-none"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={importAsConfirmed}
              onChange={e => setImportAsConfirmed(e.target.checked)}
              className="w-4 h-4"
            />
            Importar todos como <strong>confirmados</strong>
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => doImport(csvText)}
              disabled={importing || !csvText.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {importing ? 'Importando...' : 'Importar'}
            </button>
            <button onClick={() => setShowCsvModal(false)} className="px-4 py-2 border rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm text-blue-900">{editingGuest ? 'Editar convidado' : 'Novo convidado'}</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus placeholder="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="col-span-2 px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="Telefone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="CPF" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm bg-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Salvando...' : editingGuest ? 'Salvar' : 'Adicionar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Guest list */}
      {loading ? (
        <p className="text-center text-gray-400 py-6">Carregando...</p>
      ) : guests.length === 0 ? (
        <div className="py-10 text-center">
          <Users size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-400 text-sm">Nenhum convidado cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {guests.map(g => (
            <div key={g.id} className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <User size={14} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{g.name}</p>
                {(g.email || g.phone) && (
                  <p className="text-xs text-gray-400 truncate">{[g.email, g.phone].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(g.status)}`}>
                {statusLabel(g.status)}
              </span>
              <button onClick={() => openEdit(g)} className="p-1 text-gray-400 hover:text-primary">
                <Plus size={14} className="rotate-45" />
              </button>
              <button onClick={() => remove(g.id)} className="p-1 text-gray-300 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Fornecedores (EventProfessional) tab ──────────────────────────────────────

function FornecedoresTab({ token, jwt }: { token: string; jwt: string }) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', whatsapp: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v2/client/${token}/professionals`, { headers: { 'x-client-auth': jwt } });
    const data = await res.json();
    setProfessionals(data.professionals || []);
    setLoading(false);
  }, [token, jwt]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setError('');
    if (!form.name.trim()) { setError('Informe o nome'); return; }
    if (!form.role.trim()) { setError('Informe a função'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/client/${token}/professionals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: '', whatsapp: '', role: '' });
        setShowForm(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Erro ao adicionar fornecedor.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Fotógrafos, músicos, DJs e outros prestadores do seu evento.</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shrink-0"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm text-blue-900">Novo fornecedor</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus placeholder="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="col-span-2 px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="Função * (ex: Fotógrafo, DJ)" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="col-span-2 px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="WhatsApp" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
              className="col-span-2 px-3 py-2 border rounded-lg text-sm bg-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-400 py-6">Carregando...</p>
      ) : professionals.length === 0 ? (
        <div className="py-10 text-center">
          <User size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-400 text-sm">Nenhum fornecedor cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {professionals.map(p => (
            <div key={p.id} className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <User size={14} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{p.person.name}</p>
                <p className="text-xs text-gray-400 truncate">{p.role}{p.person.whatsapp ? ` · ${p.person.whatsapp}` : ''}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.checkedInAt ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.checkedInAt ? 'Check-in feito' : 'Aguardando'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Check-in report tab (guests + fornecedores) ───────────────────────────────

function CheckinReportTab({ token, jwt }: { token: string; jwt: string }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v2/client/${token}/guests?limit=1000`, { headers: { 'x-client-auth': jwt } }).then(r => r.json()),
      fetch(`/api/v2/client/${token}/professionals`, { headers: { 'x-client-auth': jwt } }).then(r => r.json()),
    ]).then(([gRes, pRes]) => {
      setGuests(gRes.guests || []);
      setProfessionals(pRes.professionals || []);
    }).finally(() => setLoading(false));
  }, [token, jwt]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando relatório...</div>;

  const checkedInGuests = guests.filter(g => g.status === 'checked_in');
  const checkedInPros = professionals.filter(p => !!p.checkedInAt);

  if (checkedInGuests.length === 0 && checkedInPros.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum check-in registrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-100 text-blue-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">{checkedInGuests.length}</p>
          <p className="text-xs mt-0.5">Convidados com check-in</p>
        </div>
        <div className="bg-purple-100 text-purple-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">{checkedInPros.length}</p>
          <p className="text-xs mt-0.5">Fornecedores com check-in</p>
        </div>
      </div>

      {checkedInGuests.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Convidados</p>
          <div className="space-y-2">
            {checkedInGuests.map(g => (
              <div key={g.id} className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                  <User size={14} className="text-gray-400" />
                </div>
                <p className="flex-1 min-w-0 font-medium text-sm text-gray-900 truncate">{g.name}</p>
                {g.checkedInAt && <p className="text-xs text-gray-400">{formatDate(g.checkedInAt)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {checkedInPros.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fornecedores</p>
          <div className="space-y-2">
            {checkedInPros.map(p => (
              <div key={p.id} className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                  <User size={14} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{p.person.name}</p>
                  <p className="text-xs text-gray-400 truncate">{p.role}</p>
                </div>
                {p.checkedInAt && <p className="text-xs text-gray-400">{formatDate(p.checkedInAt)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared approval button ────────────────────────────────────────────────────

function ApproveButton({
  approved, approvedAt, onToggle, toggling, locked,
}: {
  approved: boolean;
  approvedAt?: string;
  onToggle: () => void;
  toggling: boolean;
  locked?: boolean;
}) {
  return (
    <button
      onClick={locked ? undefined : onToggle}
      disabled={toggling || locked}
      title={locked ? 'Evento encerrado — não é possível alterar confirmações' : approved ? 'Clique para remover confirmação' : 'Confirmar que está correto'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition shrink-0 ${
        approved
          ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
          : 'bg-white border-gray-200 text-gray-500 hover:border-primary hover:text-primary'
      } disabled:opacity-50 ${locked ? 'cursor-not-allowed' : ''}`}
    >
      {locked
        ? <Lock size={13} className={approved ? 'text-green-600' : 'text-gray-400'} />
        : approved
          ? <CheckCircle size={13} className="text-green-600" />
          : <Circle size={13} />}
      {approved ? 'Confirmado' : 'Confirmar'}
    </button>
  );
}

// ── Category label ────────────────────────────────────────────────────────────

function categoryLabel(cat: string) {
  return { ab: 'A&B', infra: 'Infra', staff: 'Equipe', venue: 'Local' }[cat] || cat;
}
function categoryColor(cat: string) {
  return {
    ab: 'bg-orange-100 text-orange-700',
    infra: 'bg-blue-100 text-blue-700',
    staff: 'bg-purple-100 text-purple-700',
    venue: 'bg-gray-100 text-gray-600',
  }[cat] || 'bg-gray-100 text-gray-600';
}

// ── Question row with per-question approval ───────────────────────────────────

function QuestionRow({ q, ans, approvalKey, approvals, onToggle, locked }: {
  q: any;
  ans: any;
  approvalKey: string;
  approvals: ApprovalSet;
  onToggle: (itemType: string, itemId: string) => Promise<void>;
  locked?: boolean;
}) {
  const [toggling, setToggling] = useState(false);
  const [type, id] = approvalKey.split(':');
  const approved = approvals.has(approvalKey);
  const answered = !!ans?.answer;

  async function handleToggle() {
    setToggling(true);
    await onToggle(type, id);
    setToggling(false);
  }

  return (
    <div className={`px-4 py-3 flex items-start gap-3 ${approved ? 'bg-green-50/60' : ''}`}>
      <div className="mt-0.5 shrink-0">
        {answered
          ? <CheckCircle size={14} className="text-green-500" />
          : q.required
            ? <AlertCircle size={14} className="text-amber-500" />
            : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-600">{q.text}</p>
        {answered
          ? <p className="text-sm font-medium text-gray-900 mt-0.5">{Array.isArray(ans.answer) ? ans.answer.join(', ') : String(ans.answer)}</p>
          : <p className="text-xs text-amber-600 mt-0.5 italic">{q.required ? 'A definir (obrigatório)' : 'A definir'}</p>}
      </div>
      {answered && (
        <ApproveButton approved={approved} onToggle={handleToggle} toggling={toggling} locked={locked} />
      )}
    </div>
  );
}

// ── Plan tab ──────────────────────────────────────────────────────────────────

function PlanTab({ token, jwt, approvals, onToggle, locked }: {
  token: string;
  jwt: string;
  approvals: ApprovalSet;
  onToggle: (itemType: string, itemId: string) => Promise<void>;
  locked?: boolean;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/client/${token}/plan`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setData(d.event))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando plano...</div>;
  if (!data) return <div className="py-8 text-center text-gray-400">Plano não disponível.</div>;

  const allItems: any[] = (data.items || []).filter((i: any) => (i.product?.questions?.length ?? 0) > 0);
  const venues: any[] = data.venues || [];
  const hasVenueQuestions = venues.some((v: any) => (v.venue?.questions?.length ?? 0) > 0);

  if (allItems.length === 0 && !hasVenueQuestions) {
    return (
      <div className="py-12 text-center">
        <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum item com configuração disponível.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Venue questions */}
      {venues.map((v: any, idx: number) => {
        const qs: any[] = v.venue?.questions || [];
        if (qs.length === 0) return null;
        const confirmedCount = qs.filter((q: any) => approvals.has(`venue_q:${v.venueId}_${q.id}`)).length;
        const answeredCount = qs.filter((q: any) => !!data.venueAnswers?.find((a: any) => a.questionId === q.id)?.answer).length;
        return (
          <div key={idx} className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
              <span className="font-semibold text-sm flex-1 text-gray-800">Local: {v.venue.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confirmedCount === answeredCount && answeredCount > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {confirmedCount}/{qs.length} confirmados
              </span>
            </div>
            <div className="divide-y">
              {qs.map((q: any, qi: number) => {
                const ans = data.venueAnswers?.find((a: any) => a.questionId === q.id);
                return (
                  <QuestionRow
                    key={qi}
                    q={q}
                    ans={ans}
                    approvalKey={`venue_q:${v.venueId}_${q.id}`}
                    approvals={approvals}
                    onToggle={onToggle}
                    locked={locked}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Plan items — per-question approval */}
      {allItems.map((item: any) => {
        const qs: any[] = item.product?.questions || [];
        const confirmedCount = qs.filter((q: any) => approvals.has(`plan_q:${item.id}_${q.id}`)).length;
        const answeredCount = qs.filter((q: any) => !!item.answers?.find((a: any) => a.questionId === q.id)?.answer).length;
        return (
          <div key={item.id} className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${categoryColor(item.category)}`}>
                    {categoryLabel(item.category)}
                  </span>
                  <span className="font-semibold text-sm text-gray-800">{item.name}</span>
                </div>
                {(item.quantity > 1 || item.unit) && (
                  <p className="text-xs text-gray-400 mt-0.5">{item.quantity} {item.unit || 'un'}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confirmedCount === answeredCount && answeredCount > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {confirmedCount}/{qs.length} confirmados
              </span>
            </div>
            <div className="divide-y">
              {qs.map((q: any, qi: number) => {
                const ans = item.answers?.find((a: any) => a.questionId === q.id);
                return (
                  <QuestionRow
                    key={qi}
                    q={q}
                    ans={ans}
                    approvalKey={`plan_q:${item.id}_${q.id}`}
                    approvals={approvals}
                    onToggle={onToggle}
                    locked={locked}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── A&B (food & beverage) tab ─────────────────────────────────────────────────

function FoodTab({ token, jwt, approvals, onToggle, locked }: {
  token: string;
  jwt: string;
  approvals: ApprovalSet;
  onToggle: (itemType: string, itemId: string) => Promise<void>;
  locked?: boolean;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/client/${token}/plan`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setData(d.event))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando itens de A&B...</div>;

  const abItems: any[] = (data?.items || []).filter((i: any) => i.category === 'ab');

  if (abItems.length === 0) {
    return (
      <div className="py-12 text-center">
        <Utensils size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum item de A&B contratado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {abItems.map((item: any) => {
        const qs: any[] = item.product?.questions || [];
        const confirmedCount = qs.filter((q: any) => approvals.has(`plan_q:${item.id}_${q.id}`)).length;
        const answeredCount = qs.filter((q: any) => !!item.answers?.find((a: any) => a.questionId === q.id)?.answer).length;
        return (
          <div key={item.id} className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800">{item.name}</p>
                {(item.quantity > 1 || item.unit) && (
                  <p className="text-xs text-gray-400 mt-0.5">{item.quantity} {item.unit || 'un'}</p>
                )}
              </div>
              {qs.length > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confirmedCount === answeredCount && answeredCount > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {confirmedCount}/{qs.length} confirmados
                </span>
              )}
            </div>
            {qs.length > 0 ? (
              <div className="divide-y">
                {qs.map((q: any, qi: number) => {
                  const ans = item.answers?.find((a: any) => a.questionId === q.id);
                  return (
                    <QuestionRow
                      key={qi}
                      q={q}
                      ans={ans}
                      approvalKey={`plan_q:${item.id}_${q.id}`}
                      approvals={approvals}
                      onToggle={onToggle}
                      locked={locked}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-3">
                {item.notes && <p className="text-sm text-gray-500">{item.notes}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Schedule tab ──────────────────────────────────────────────────────────────

function ScheduleTab({ token, jwt, approvals, onToggle, locked }: {
  token: string;
  jwt: string;
  approvals: ApprovalSet;
  onToggle: (itemType: string, itemId: string) => Promise<void>;
  locked?: boolean;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/v2/client/${token}/schedules`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setSchedules(d.schedules || []))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando cronograma...</div>;

  if (schedules.length === 0) {
    return (
      <div className="py-12 text-center">
        <Clock size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Cronograma ainda não definido.</p>
      </div>
    );
  }

  async function handleToggle(scheduleId: string) {
    setToggling(t => ({ ...t, [scheduleId]: true }));
    await onToggle('schedule', scheduleId);
    setToggling(t => ({ ...t, [scheduleId]: false }));
  }

  return (
    <div className="space-y-3">
      {schedules.map(s => {
        const approved = approvals.has(`schedule:${s.id}`);
        return (
          <div key={s.id} className={`bg-white border rounded-xl p-4 flex gap-4 items-start ${approved ? 'border-green-300' : ''}`}>
            <div className="shrink-0 text-center min-w-[56px]">
              <p className="text-xs text-gray-400">Início</p>
              <p className="text-sm font-bold text-gray-900 leading-tight">
                {new Date(s.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </p>
              <p className="text-xs text-gray-400 mt-1">Fim</p>
              <p className="text-sm font-medium text-gray-600 leading-tight">
                {new Date(s.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </p>
            </div>
            <div className="border-l pl-4 flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900">{s.name}</p>
              {s.team && <p className="text-xs text-primary mt-0.5">Equipe: {s.team.name}</p>}
              {s.description && <p className="text-sm text-gray-500 mt-1">{s.description}</p>}
            </div>
            <ApproveButton
              approved={approved}
              onToggle={() => handleToggle(s.id)}
              toggling={!!toggling[s.id]}
              locked={locked}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Status banner ─────────────────────────────────────────────────────────────

function StatusBanner({ token, jwt, approvals }: { token: string; jwt: string; approvals: ApprovalSet }) {
  const [planData, setPlanData] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v2/client/${token}/plan`, { headers: { 'x-client-auth': jwt } }).then(r => r.json()),
      fetch(`/api/v2/client/${token}/schedules`, { headers: { 'x-client-auth': jwt } }).then(r => r.json()),
    ]).then(([planRes, schedRes]) => {
      setPlanData(planRes.event ?? null);
      setSchedules(schedRes.schedules ?? []);
    }).catch(() => {});
  }, [token, jwt]);

  useEffect(() => {
    // Re-evaluate whenever approvals change but data is already loaded
  }, [approvals]);

  if (!planData) return null;

  type QStat = { key: string; answered: boolean; required: boolean };
  const allQs: QStat[] = [];

  (planData.venues || []).forEach((v: any) => {
    (v.venue?.questions || []).forEach((q: any) => {
      const ans = planData.venueAnswers?.find((a: any) => a.questionId === q.id);
      allQs.push({ key: `venue_q:${v.venueId}_${q.id}`, answered: !!ans?.answer, required: !!q.required });
    });
  });

  (planData.items || []).filter((i: any) => (i.product?.questions?.length ?? 0) > 0).forEach((item: any) => {
    (item.product?.questions || []).forEach((q: any) => {
      const ans = item.answers?.find((a: any) => a.questionId === q.id);
      allQs.push({ key: `plan_q:${item.id}_${q.id}`, answered: !!ans?.answer, required: !!q.required });
    });
  });

  const unanswered = allQs.filter(q => !q.answered && q.required).length;
  const answeredUnconfirmed = allQs.filter(q => q.answered && !approvals.has(q.key)).length;
  const scheduleUnconfirmed = schedules.filter(s => !approvals.has(`schedule:${s.id}`)).length;
  const allDone = unanswered === 0 && answeredUnconfirmed === 0 && scheduleUnconfirmed === 0;

  if (allQs.length === 0 && schedules.length === 0) return null;

  return (
    <div className={`rounded-xl border px-4 py-3.5 mb-5 ${allDone ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <p className="text-sm font-semibold text-gray-800 mb-1.5">
        {allDone ? 'Tudo confirmado!' : 'O que ainda precisa da sua atenção'}
      </p>
      {allDone ? (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle size={14} className="shrink-0" />
          <span>Todas as confirmações estão completas. Obrigado!</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {unanswered > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              <span>
                <strong>{unanswered}</strong> pergunta{unanswered > 1 ? 's obrigatórias' : ' obrigatória'} sem resposta — veja a aba <strong>Plano</strong>
              </span>
            </div>
          )}
          {answeredUnconfirmed > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <Circle size={14} className="shrink-0" />
              <span>
                <strong>{answeredUnconfirmed}</strong> resposta{answeredUnconfirmed > 1 ? 's' : ''} aguardando sua confirmação — veja a aba <strong>Plano</strong>
              </span>
            </div>
          )}
          {scheduleUnconfirmed > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <Circle size={14} className="shrink-0" />
              <span>
                <strong>{scheduleUnconfirmed}</strong> atividade{scheduleUnconfirmed > 1 ? 's' : ''} do cronograma para confirmar — veja a aba <strong>Cronograma</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Layout tab ────────────────────────────────────────────────────────────────

interface LayoutElement { id: string; type: string; x: number; y: number; rotation: number; }
interface ClientLayout { id: string; venueId: string | null; name: string; elements: LayoutElement[]; isLocked: boolean; createdByClient: boolean; }
interface ElementCfg { type: string; label: string; widthMeters: number; heightMeters: number; iconUrl?: string; }
interface ClientVenueInfo {
  venueId: string; venueName: string;
  floorPlanUrl: string | null; floorPlanWidthMeters: number | null; floorPlanHeightMeters: number | null;
  layoutStock: Record<string, number> | null;
}

function layoutUid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function LayoutTab({ token, jwt }: { token: string; jwt: string }) {
  const [venues,       setVenues]         = useState<ClientVenueInfo[]>([]);
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [imgAspect,    setImgAspect]      = useState<number | null>(null);
  const [allLayouts,   setAllLayouts]     = useState<ClientLayout[]>([]);
  const [activeId,     setActiveId]       = useState<string | null>(null);
  const [configs,      setConfigs]        = useState<ElementCfg[]>([]);
  const [loading,      setLoading]        = useState(true);

  // Editing — only ever a layout the client made themselves (createdByClient: true).
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [draftElements,  setDraftElements]  = useState<LayoutElement[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState<{ ok: boolean; text: string } | null>(null);
  const [showNewPicker,  setShowNewPicker]  = useState(false);
  const [creating,       setCreating]       = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const trashRef  = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ ox: 0, oy: 0 });
  const [overTrash,  setOverTrash]  = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const apiClient = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`/api/v2/client/${token}${path}`, {
      ...opts,
      headers: { ...(opts.headers || {}), 'x-client-auth': jwt },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [token, jwt]);

  useEffect(() => {
    async function load() {
      try {
        const [venuesRes, layoutsRes, cfgRes] = await Promise.all([
          apiClient('/layout-venues'),
          apiClient('/layouts'),
          apiClient('/layout-config'),
        ]);
        const venueList: ClientVenueInfo[] = venuesRes.venues ?? [];
        setVenues(venueList);
        if (venueList.length > 0) setActiveVenueId(venueList[0].venueId);
        // Staff layouts only show once explicitly finalized ("Bloquear para cliente" on the
        // internal editor); a layout the client made themselves is always visible to them.
        setAllLayouts((layoutsRes.layouts ?? []).filter((l: ClientLayout) => l.isLocked || l.createdByClient));
        setConfigs(cfgRes.elements ?? []);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    load();
  }, [apiClient]);

  const activeVenue = venues.find(v => v.venueId === activeVenueId) ?? null;
  const floorPlanUrl = activeVenue?.floorPlanUrl ?? null;
  const floorPlanW   = activeVenue?.floorPlanWidthMeters ?? null;
  const floorPlanH   = activeVenue?.floorPlanHeightMeters ?? null;
  const maxCounts    = activeVenue?.layoutStock ?? {};

  const layouts = allLayouts.filter(l =>
    l.venueId ? l.venueId === activeVenueId : activeVenueId === venues[0]?.venueId
  );

  useEffect(() => {
    setActiveId(layouts[0]?.id ?? null);
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVenueId]);

  const active = layouts.find(l => l.id === activeId);
  const isEditing = editingId !== null && editingId === active?.id;
  const displayElements = isEditing ? draftElements : (active?.elements ?? []);

  // Legend: every element type used in the layout being shown, with its icon/label and how
  // many are placed — so the client can tell what each icon represents, and how many of each
  // (e.g. how many chairs) are actually in the plan.
  const legendCounts: Record<string, number> = {};
  for (const el of displayElements) legendCounts[el.type] = (legendCounts[el.type] ?? 0) + 1;
  const legendItems = Object.entries(legendCounts)
    .map(([type, count]) => ({ type, count, cfg: configs.find(c => c.type === type) }))
    .sort((a, b) => (a.cfg?.label ?? a.type).localeCompare(b.cfg?.label ?? b.type));

  function elementStyle(el: LayoutElement, interactive: boolean): React.CSSProperties {
    const cfg = configs.find(c => c.type === el.type);
    const base: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x * 100}%`,
      top: `${el.y * 100}%`,
      transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
      pointerEvents: interactive ? 'auto' : 'none',
      cursor: interactive ? (draggingId === el.id ? 'grabbing' : 'grab') : 'default',
      zIndex: interactive && selectedId === el.id ? 20 : 10,
    };
    if (floorPlanW && floorPlanH && cfg?.widthMeters && cfg?.heightMeters) {
      return { ...base, width: `${(cfg.widthMeters / floorPlanW) * 100}%`, height: `${(cfg.heightMeters / floorPlanH) * 100}%` };
    }
    return { ...base, width: '6%', aspectRatio: '1' };
  }

  // ── Own-layout actions ─────────────────────────────────────────────────────

  async function createLayout(fromElements: LayoutElement[], name: string) {
    if (!activeVenueId) return;
    setCreating(true);
    try {
      const data = await apiClient('/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, elements: fromElements, venueId: activeVenueId }),
      });
      const l: ClientLayout = data.layout;
      setAllLayouts(prev => [...prev, l]);
      setActiveId(l.id);
      setEditingId(l.id);
      setDraftElements(fromElements);
      setSelectedId(null);
      setShowNewPicker(false);
    } catch {
      alert('Erro ao criar layout.');
    } finally {
      setCreating(false);
    }
  }

  function enterEdit() {
    if (!active || !active.createdByClient) return;
    setEditingId(active.id);
    setDraftElements(active.elements ?? []);
    setSelectedId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setSelectedId(null);
  }

  async function saveDraft() {
    if (!editingId) return;
    setSaving(true); setSaveMsg(null);
    try {
      await apiClient(`/layouts/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements: draftElements }),
      });
      setAllLayouts(prev => prev.map(l => l.id === editingId ? { ...l, elements: draftElements } : l));
      setSaveMsg({ ok: true, text: 'Salvo!' });
    } catch {
      setSaveMsg({ ok: false, text: 'Erro ao salvar.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  async function deleteOwnLayout(id: string) {
    if (!confirm('Excluir este layout?')) return;
    try {
      await apiClient(`/layouts/${id}`, { method: 'DELETE' });
      setAllLayouts(prev => prev.filter(l => l.id !== id));
      if (activeId === id) { setActiveId(null); setEditingId(null); }
    } catch {
      alert('Erro ao excluir layout.');
    }
  }

  // ── Drag & drop (own layout, editing only) ─────────────────────────────────

  function handleSidebarDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('elementType', type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!isEditing || !canvasRef.current) return;
    const type = e.dataTransfer.getData('elementType');
    if (!type) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const count = draftElements.filter(el => el.type === type).length;
    const max = maxCounts[type];
    if (max !== undefined && count >= max) return;
    setDraftElements(prev => [...prev, { id: layoutUid(), type, x, y, rotation: 0 }]);
    setSelectedId(null);
  }

  function handleElementMouseDown(e: React.MouseEvent, id: string) {
    if (!isEditing || !canvasRef.current) return;
    e.stopPropagation();
    setSelectedId(id);
    const rect = canvasRef.current.getBoundingClientRect();
    const el = draftElements.find(x => x.id === id)!;
    setDragOffset({
      ox: (e.clientX - rect.left) / rect.width - el.x,
      oy: (e.clientY - rect.top) / rect.height - el.y,
    });
    setDraggingId(id);
  }

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width - dragOffset.ox));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height - dragOffset.oy));
      setDraftElements(prev => prev.map(el => el.id === draggingId ? { ...el, x, y } : el));
      if (trashRef.current) {
        const tr = trashRef.current.getBoundingClientRect();
        setOverTrash(e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (trashRef.current) {
        const tr = trashRef.current.getBoundingClientRect();
        if (e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
          setDraftElements(prev => prev.filter(el => el.id !== draggingId));
          if (selectedId === draggingId) setSelectedId(null);
        }
      }
      setDraggingId(null);
      setOverTrash(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingId, dragOffset, selectedId]);

  function rotateSelected() {
    if (!selectedId) return;
    setDraftElements(prev => prev.map(el => el.id === selectedId ? { ...el, rotation: (el.rotation + 45) % 360 } : el));
  }

  function removeSelected() {
    if (!selectedId) return;
    setDraftElements(prev => prev.filter(el => el.id !== selectedId));
    setSelectedId(null);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  }

  if (venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <LayoutGrid className="size-10 opacity-30" />
        <p className="text-sm">Nenhum espaço vinculado a este evento.</p>
      </div>
    );
  }

  const venueSwitcher = venues.length > 1 && (
    <div className="flex gap-2 flex-wrap">
      {venues.map(v => (
        <button
          key={v.venueId}
          onClick={() => setActiveVenueId(v.venueId)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            v.venueId === activeVenueId
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-input hover:bg-muted/50'
          }`}
        >
          {v.venueName}
        </button>
      ))}
    </div>
  );

  if (!floorPlanUrl) {
    return (
      <div className="flex flex-col gap-3">
        {venueSwitcher}
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <LayoutGrid className="size-10 opacity-30" />
          <p className="text-sm">Planta baixa ainda não configurada para {activeVenue?.venueName ?? 'este espaço'}.</p>
        </div>
      </div>
    );
  }

  const newLayoutPicker = showNewPicker && (
    <div className="border rounded-xl bg-card p-3 space-y-2">
      <p className="text-sm font-medium">Novo layout — começar de:</p>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => createLayout([], `Meu layout ${allLayouts.filter(l => l.createdByClient).length + 1}`)}
          disabled={creating}
          className="text-left px-3 py-2 rounded-lg border hover:bg-muted/50 transition text-sm disabled:opacity-50"
        >
          Em branco
        </button>
        {layouts.map(l => (
          <button
            key={l.id}
            onClick={() => createLayout(l.elements.map(el => ({ ...el, id: layoutUid() })), `Cópia de ${l.name}`)}
            disabled={creating}
            className="text-left px-3 py-2 rounded-lg border hover:bg-muted/50 transition text-sm disabled:opacity-50 flex items-center justify-between gap-2"
          >
            <span className="truncate">Copiar "{l.name}"</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">{l.createdByClient ? 'meu' : 'equipe'}</span>
          </button>
        ))}
      </div>
      <button onClick={() => setShowNewPicker(false)} className="text-xs text-muted-foreground hover:text-foreground transition">
        Cancelar
      </button>
    </div>
  );

  if (layouts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {venueSwitcher}
        {newLayoutPicker}
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground text-center px-4">
          <Lock className="size-10 opacity-30" />
          <p className="text-sm font-medium uppercase tracking-widest max-w-xs leading-relaxed">
            Layout da equipe em preparação.
          </p>
          {!showNewPicker && (
            <button
              onClick={() => setShowNewPicker(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition"
            >
              <Plus className="size-4" /> Criar meu layout
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {venueSwitcher}

      {/* Layout tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap flex-1">
          {layouts.map(l => (
            <button
              key={l.id}
              onClick={() => { setActiveId(l.id); setEditingId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition ${
                l.id === activeId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-input hover:bg-muted/50'
              }`}
            >
              {l.name}
              {l.createdByClient && <span className="text-[10px] opacity-75">(meu)</span>}
            </button>
          ))}
        </div>
        {!showNewPicker && (
          <button
            onClick={() => setShowNewPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs hover:bg-muted transition flex-shrink-0"
          >
            <Plus className="size-3.5" /> Novo
          </button>
        )}
      </div>

      {newLayoutPicker}

      {/* Own-layout controls */}
      {active && (
        <div className="flex items-center gap-2 flex-wrap">
          {active.createdByClient ? (
            isEditing ? (
              <>
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={cancelEdit} className="px-3 py-1.5 border rounded-lg text-xs hover:bg-muted transition">
                  Fechar edição
                </button>
                {saveMsg && <span className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-destructive'}`}>{saveMsg.text}</span>}
              </>
            ) : (
              <>
                <button
                  onClick={enterEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition"
                >
                  <Pencil className="size-3.5" /> Editar meu layout
                </button>
                <button
                  onClick={() => deleteOwnLayout(active.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-destructive hover:bg-destructive/10 transition"
                >
                  <Trash2 className="size-3.5" /> Excluir
                </button>
              </>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Layout da equipe — somente leitura. Use "Novo" para copiar e editar sua própria versão.
            </p>
          )}
        </div>
      )}

      {/* Floor plan */}
      <div className="border rounded-xl overflow-hidden bg-muted/20">
        <div className="flex flex-col md:flex-row gap-2 p-2">
          {isEditing && (
            <div className="md:w-40 flex-shrink-0 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto md:max-h-[60vh]">
              {configs.filter(c => c.widthMeters && c.heightMeters).map(cfg => {
                const count = draftElements.filter(el => el.type === cfg.type).length;
                const max = maxCounts[cfg.type];
                const blocked = max !== undefined && count >= max;
                return (
                  <div
                    key={cfg.type}
                    draggable={!blocked}
                    onDragStart={e => handleSidebarDragStart(e, cfg.type)}
                    className={`flex items-center gap-2 p-1.5 border rounded-lg bg-card select-none transition flex-shrink-0 min-w-[9rem] md:min-w-0 ${
                      blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-grab hover:bg-muted/50 active:cursor-grabbing'
                    }`}
                  >
                    <div className="w-7 h-7 flex-shrink-0">
                      {cfg.iconUrl
                        ? <img src={cfg.iconUrl} alt={cfg.type} className="w-full h-full object-contain" />
                        : (ELEMENT_ICONS[cfg.type] ?? <div className="w-full h-full bg-muted rounded" />)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-tight truncate">{cfg.label}</p>
                      {max !== undefined && <p className="text-[10px] text-muted-foreground">{count}/{max}</p>}
                    </div>
                  </div>
                );
              })}
              <div
                ref={trashRef}
                className={`flex items-center justify-center gap-1 py-2 rounded-lg border-2 border-dashed flex-shrink-0 transition-all ${
                  overTrash ? 'border-destructive bg-destructive/10 text-destructive' : 'border-muted-foreground/20 text-muted-foreground/30'
                }`}
              >
                <Trash2 className="size-4" />
                <span className="text-[10px]">Arraste aqui</span>
              </div>
              {selectedId && (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={rotateSelected} className="flex-1 p-1.5 border rounded-lg text-xs hover:bg-muted transition">Girar</button>
                  <button onClick={removeSelected} className="flex-1 p-1.5 border rounded-lg text-xs text-destructive hover:bg-destructive/10 transition">Remover</button>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 flex items-center justify-center">
            <div
              ref={canvasRef}
              className="relative select-none"
              onDragOver={e => isEditing && e.preventDefault()}
              onDrop={handleCanvasDrop}
              onClick={() => isEditing && setSelectedId(null)}
              style={{
                width: '100%',
                aspectRatio: imgAspect
                  ? `${imgAspect}`
                  : (floorPlanW && floorPlanH ? `${floorPlanW}/${floorPlanH}` : undefined),
                maxHeight: '70vh',
              }}
            >
              <img
                src={floorPlanUrl}
                alt="Planta baixa"
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'fill', pointerEvents: 'none' }}
                draggable={false}
                onLoad={e => {
                  const img = e.target as HTMLImageElement;
                  setImgAspect(img.naturalWidth / img.naturalHeight);
                }}
              />

              {/* Scale lines */}
              {floorPlanW && floorPlanH && (
                <svg
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30 }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <line x1="2" y1="96" x2="98" y2="96" stroke="#ef4444" strokeWidth="0.4" strokeDasharray="1.5,0.8" />
                  <line x1="2" y1="93.5" x2="2" y2="98.5" stroke="#ef4444" strokeWidth="0.4" />
                  <line x1="98" y1="93.5" x2="98" y2="98.5" stroke="#ef4444" strokeWidth="0.4" />
                  <text x="50" y="100" textAnchor="middle" fontSize="2.8" fill="#ef4444" fontFamily="sans-serif" fontWeight="600">{floorPlanW}m</text>
                  <line x1="97" y1="2" x2="97" y2="95" stroke="#3b82f6" strokeWidth="0.4" strokeDasharray="1.5,0.8" />
                  <line x1="94.5" y1="2" x2="99.5" y2="2" stroke="#3b82f6" strokeWidth="0.4" />
                  <line x1="94.5" y1="95" x2="99.5" y2="95" stroke="#3b82f6" strokeWidth="0.4" />
                  <text x="100" y="50" textAnchor="middle" fontSize="2.8" fill="#3b82f6" fontFamily="sans-serif" fontWeight="600" transform="rotate(90, 100, 50)">{floorPlanH}m</text>
                </svg>
              )}

              {/* Placed elements */}
              {displayElements.map(el => (
                <div
                  key={el.id}
                  style={elementStyle(el, isEditing)}
                  onMouseDown={e => handleElementMouseDown(e, el.id)}
                  onClick={e => isEditing && e.stopPropagation()}
                  className={isEditing && selectedId === el.id ? 'ring-2 ring-primary ring-offset-1 rounded' : ''}
                >
                  {(() => {
                    const cfg = configs.find(c => c.type === el.type);
                    return cfg?.iconUrl
                      ? <img src={cfg.iconUrl} alt={el.type} className="w-full h-full object-contain drop-shadow" draggable={false} />
                      : <div className="w-full h-full drop-shadow">{ELEMENT_ICONS[el.type]}</div>;
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend — what each icon represents and how many are placed */}
      {legendItems.length > 0 && (
        <div className="border rounded-xl bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Legenda</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {legendItems.map(({ type, count, cfg }) => (
              <div key={type} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                <div className="w-7 h-7 flex-shrink-0">
                  {cfg?.iconUrl
                    ? <img src={cfg.iconUrl} alt={type} className="w-full h-full object-contain" />
                    : (ELEMENT_ICONS[type] ?? <div className="w-full h-full bg-muted rounded" />)}
                </div>
                <span className="text-xs truncate flex-1">{cfg?.label ?? type}</span>
                <span className="text-xs font-semibold text-primary flex-shrink-0">×{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {active && !isEditing && (
        <p className="text-xs text-muted-foreground text-center">
          Layout: <span className="font-medium">{active.name}</span> · Visualização apenas
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'plan', label: 'Plano', icon: CheckCircle },
  { id: 'schedule', label: 'Cronograma', icon: Clock },
  { id: 'ab', label: 'A&B', icon: Utensils },
  { id: 'guests', label: 'Convidados', icon: Users },
  { id: 'fornecedores', label: 'Fornecedores', icon: User },
  { id: 'checkin', label: 'Check-in', icon: CheckCircle },
  { id: 'files', label: 'Arquivos', icon: FileText },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
  { id: 'media', label: 'Mídia', icon: MonitorPlay },
  { id: 'spotify', label: 'Spotify', icon: Music },
];

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [jwt, setJwt] = useState<string | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [approvals, setApprovals] = useState<ApprovalSet>(new Set());

  useEffect(() => {
    const stored = sessionStorage.getItem(`client_jwt_${token}`);
    if (stored) {
      fetch(`/api/v2/client/${token}/event`, { headers: { 'x-client-auth': stored } })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setJwt(stored); setEvent(d.event); })
        .catch(() => sessionStorage.removeItem(`client_jwt_${token}`));
    }
  }, [token]);

  useEffect(() => {
    if (!jwt) return;
    fetch(`/api/v2/client/${token}/approvals`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => {
        const s = new Set<string>((d.approvals || []).map((a: Approval) => `${a.itemType}:${a.itemId}`));
        setApprovals(s);
      });
  }, [jwt, token]);

  async function toggleApproval(itemType: string, itemId: string) {
    if (!jwt) return;
    const res = await fetch(`/api/v2/client/${token}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
      body: JSON.stringify({ itemType, itemId }),
    });
    if (res.ok) {
      const data = await res.json();
      const key = `${itemType}:${itemId}`;
      setApprovals(prev => {
        const next = new Set(prev);
        if (data.approved) next.add(key); else next.delete(key);
        return next;
      });
    }
  }

  function onAuth(newJwt: string, ev: EventSummary) {
    setJwt(newJwt);
    setEvent(ev);
  }

  if (!jwt || !event) {
    return <AuthScreen token={token} onAuth={onAuth} />;
  }

  const locked = event.status === 'encerrado';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs text-gray-400">Portal do Cliente</p>
            {locked && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-800 text-white font-medium">
                <Lock size={10} /> Encerrado
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{event.name}</h1>
          <p className="text-sm text-gray-500">{event.clientName}</p>
          {event.startAt && (
            <p className="text-xs text-primary mt-1 flex items-center gap-1">
              <Calendar size={11} /> {formatDate(event.startAt)}
            </p>
          )}
          {locked && (
            <p className="text-xs text-gray-500 mt-2 bg-gray-100 rounded-lg px-3 py-2">
              Este evento já foi encerrado. As confirmações não podem mais ser alteradas — veja a aba <strong>Check-in</strong> para o relatório de presença.
            </p>
          )}
        </div>
        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex flex-wrap gap-1 pb-px">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <StatusBanner token={token} jwt={jwt} approvals={approvals} />
        {activeTab === 'files' && <FilesTab token={token} jwt={jwt} />}
        {activeTab === 'guests' && <GuestsTab token={token} jwt={jwt} />}
        {activeTab === 'fornecedores' && <FornecedoresTab token={token} jwt={jwt} />}
        {activeTab === 'checkin' && <CheckinReportTab token={token} jwt={jwt} />}
        {activeTab === 'ab' && <FoodTab token={token} jwt={jwt} approvals={approvals} onToggle={toggleApproval} locked={locked} />}
        {activeTab === 'plan' && <PlanTab token={token} jwt={jwt} approvals={approvals} onToggle={toggleApproval} locked={locked} />}
        {activeTab === 'schedule' && <ScheduleTab token={token} jwt={jwt} approvals={approvals} onToggle={toggleApproval} locked={locked} />}
        {activeTab === 'layout' && <LayoutTab token={token} jwt={jwt} />}
        {activeTab === 'media' && <MediaTab token={token} jwt={jwt} />}
        {activeTab === 'spotify' && <SpotifyTab token={token} jwt={jwt} />}
      </div>
    </div>
  );
}
