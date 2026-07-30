'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Pencil, Check, X, Video, Image as ImageIcon, Music, ArrowUp, ArrowDown, MonitorPlay } from 'lucide-react';

interface MediaAsset {
  id: string;
  name: string;
  mediaType: 'video' | 'image' | 'audio';
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  order: number;
}

interface Props {
  eventId: string;
}

function formatSize(bytes: number) {
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (!bytes) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function mediaIcon(type: string) {
  if (type === 'video') return <Video size={16} className="text-blue-500 shrink-0" />;
  if (type === 'audio') return <Music size={16} className="text-purple-500 shrink-0" />;
  return <ImageIcon size={16} className="text-green-500 shrink-0" />;
}

export default function EventMediaTab({ eventId }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/media`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress('Preparando envio...');
    try {
      const presignRes = await fetch(`/api/v2/events/${eventId}/media/presign`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        alert(err.error || 'Erro ao preparar upload.');
        return;
      }
      const { uploadUrl, s3Key, mediaType } = await presignRes.json();

      setUploadProgress('Enviando arquivo...');
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) {
        alert('Falha ao enviar o arquivo para o armazenamento.');
        return;
      }

      setUploadProgress('Confirmando...');
      const confirmRes = await fetch(`/api/v2/events/${eventId}/media/confirm`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name, mediaType, mimeType: file.type, sizeBytes: file.size, s3Key,
        }),
      });
      if (!confirmRes.ok) {
        const err = await confirmRes.json().catch(() => ({}));
        alert(err.error || 'Erro ao confirmar upload.');
        return;
      }

      await load();
    } catch {
      alert('Erro ao enviar o arquivo.');
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openRename(asset: MediaAsset) {
    setEditingId(asset.id);
    setEditName(asset.name);
  }

  async function saveRename(assetId: string) {
    if (!editName.trim()) return;
    await fetch(`/api/v2/events/${eventId}/media/${assetId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    load();
  }

  async function remove(assetId: string, name: string) {
    if (!confirm(`Remover "${name}"? Isso também some do painel de LED do espaço.`)) return;
    await fetch(`/api/v2/events/${eventId}/media/${assetId}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= assets.length) return;
    const a = assets[index];
    const b = assets[target];
    const reordered = [...assets];
    reordered[index] = b;
    reordered[target] = a;
    setAssets(reordered);
    await Promise.all([
      fetch(`/api/v2/events/${eventId}/media/${a.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: target }),
      }),
      fetch(`/api/v2/events/${eventId}/media/${b.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: index }),
      }),
    ]);
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <MonitorPlay size={16} className="text-primary" />
          <p className="text-sm font-semibold">Mídia do Painel de LED</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Vídeos, imagens e áudios que o dispositivo instalado no espaço baixa e exibe no painel de LED durante o evento.
        </p>
        <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer text-sm transition ${
          uploading ? 'opacity-50 pointer-events-none' : 'hover:border-primary hover:bg-muted/40'
        }`}>
          <Upload size={16} className="text-muted-foreground" />
          <span className="text-muted-foreground">{uploading ? uploadProgress : 'Enviar vídeo, imagem ou áudio'}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*,audio/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {assets.length === 0 ? (
        <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground text-sm">
          Nenhuma mídia enviada para este evento ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset, i) => (
            <div key={asset.id} className="bg-card border rounded-xl px-4 py-3 flex items-center gap-3">
              {mediaIcon(asset.mediaType)}
              <div className="flex-1 min-w-0">
                {editingId === asset.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRename(asset.id); if (e.key === 'Escape') setEditingId(null); }}
                      className="flex-1 text-sm px-2 py-1 border rounded bg-background"
                    />
                    <button onClick={() => saveRename(asset.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X size={14} /></button>
                  </div>
                ) : (
                  <p className="text-sm font-medium truncate">{asset.name}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{formatSize(asset.sizeBytes)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === assets.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"><ArrowDown size={14} /></button>
                <button onClick={() => openRename(asset)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
                <button onClick={() => remove(asset.id, asset.name)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
