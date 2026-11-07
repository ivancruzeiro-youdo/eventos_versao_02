'use client';

import { useEffect, useState } from 'react';
import { Music, Plus, Trash2, Pencil, Check, X, Copy, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface EventPlaylist {
  id: string;
  spotifyPlaylistId: string;
  spotifyPlaylistName: string;
  comment: string | null;
}

interface Props {
  eventId: string;
  venue: { id: string; name: string };
}

const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${id}`;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Navegador sem permissão de clipboard (ou página sem contexto seguro): cai no método antigo.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// One instance per venue this event is linked to (usually just one). Mostra as playlists
// ANEXADAS ao evento (pelo cliente no portal ou pela equipe, sempre por link) pra equipe copiar
// o link ou abrir no Spotify e tocar — sem depender da integração com a API do Spotify (que tem
// limitações): nada aqui precisa do Spotify conectado ao espaço.
export default function EventSpotifyPlaylist({ eventId, venue }: Props) {
  const [eventPlaylists, setEventPlaylists] = useState<EventPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  const [urlInput, setUrlInput] = useState('');
  const [newComment, setNewComment] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [playerOpenId, setPlayerOpenId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [eventId, venue.id]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlists`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEventPlaylists(data.playlists || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy(key: string, text: string) {
    const ok = await copyToClipboard(text);
    setCopyFailed(!ok);
    setCopiedKey(ok ? key : null);
    setTimeout(() => { setCopiedKey(null); setCopyFailed(false); }, 2500);
  }

  async function addFromUrl() {
    if (!urlInput.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlists`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim(), comment: newComment }),
      });
      if (res.ok) {
        setUrlInput('');
        setNewComment('');
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error || 'Erro ao adicionar playlist.');
      }
    } finally {
      setAdding(false);
    }
  }

  async function remove(playlistId: string) {
    if (!confirm('Remover esta playlist da lista do evento?')) return;
    await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlists/${playlistId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    load();
  }

  function startEdit(p: EventPlaylist) {
    setEditingId(p.id);
    setEditComment(p.comment || '');
  }

  async function saveEdit(playlistId: string) {
    await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlists/${playlistId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: editComment }),
    });
    setEditingId(null);
    load();
  }

  if (loading) {
    return (
      <div className="bg-card rounded-lg border shadow-sm p-6">
        <p className="text-sm text-muted-foreground">Carregando Spotify...</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <div className="px-6 py-4 border-b flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-card-foreground flex items-center gap-2">
            <Music className="size-5" /> Spotify — {venue.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Playlists anexadas a este evento. Copie o link ou abra no Spotify para tocar.
          </p>
        </div>
        {eventPlaylists.length > 1 && (
          <button
            onClick={() => copy('all', eventPlaylists.map(p => `${p.spotifyPlaylistName}${p.comment ? ` (${p.comment})` : ''}: ${playlistUrl(p.spotifyPlaylistId)}`).join('\n'))}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-medium hover:bg-muted shrink-0"
          >
            {copiedKey === 'all' ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
            {copiedKey === 'all' ? 'Copiado!' : 'Copiar todos os links'}
          </button>
        )}
      </div>
      <div className="p-6 space-y-4">
        {copyFailed && (
          <p className="text-sm text-destructive">Não consegui copiar automaticamente — use "Abrir no Spotify" e copie o link de lá.</p>
        )}

        {eventPlaylists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma playlist anexada ainda. O cliente pode anexar pelo portal, ou adicione um link abaixo.
          </p>
        ) : (
          <div className="space-y-2">
            {eventPlaylists.map(p => (
              <div key={p.id} className="border rounded-md">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{p.spotifyPlaylistName}</p>
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          value={editComment}
                          onChange={e => setEditComment(e.target.value)}
                          placeholder="Comentário (ex: tocar no jantar)"
                          className="flex-1 px-2 py-1 border rounded text-xs bg-background"
                          autoFocus
                        />
                        <button onClick={() => saveEdit(p.id)} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        {p.comment || 'Sem comentário'}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => copy(p.id, playlistUrl(p.spotifyPlaylistId))}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium shrink-0"
                    title="Copiar o link da playlist"
                  >
                    {copiedKey === p.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiedKey === p.id ? 'Copiado!' : 'Copiar link'}
                  </button>
                  <a
                    href={playlistUrl(p.spotifyPlaylistId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-medium hover:bg-muted shrink-0"
                    title="Abrir a playlist no Spotify"
                  >
                    <ExternalLink className="size-3.5" /> Abrir no Spotify
                  </a>
                  <button
                    onClick={() => setPlayerOpenId(playerOpenId === p.id ? null : p.id)}
                    className="flex items-center gap-1 px-2 py-1.5 text-muted-foreground hover:text-foreground rounded shrink-0 text-xs"
                    title={playerOpenId === p.id ? 'Ocultar o player' : 'Mostrar o player'}
                  >
                    {playerOpenId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Player
                  </button>
                  {editingId !== p.id && (
                    <button onClick={() => startEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground rounded shrink-0" title="Editar comentário">
                      <Pencil size={14} />
                    </button>
                  )}
                  <button onClick={() => remove(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded shrink-0" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>

                {playerOpenId === p.id && (
                  <div className="px-4 pb-4">
                    <iframe
                      title={p.spotifyPlaylistName}
                      src={`https://open.spotify.com/embed/playlist/${p.spotifyPlaylistId}`}
                      width="100%"
                      height="352"
                      loading="lazy"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      className="rounded-xl border-0"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adicionar playlist</p>

          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Comentário (opcional) — ex: tocar no jantar, reserva pro final"
            className="w-full px-3 py-2 border rounded-md text-sm bg-background"
          />

          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addFromUrl(); }}
              placeholder="Cole o link da playlist (open.spotify.com/playlist/...)"
              className="flex-1 px-3 py-2 border rounded-md text-sm bg-background"
            />
            <button
              onClick={addFromUrl}
              disabled={adding || !urlInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
            >
              <Plus className="size-4" /> Adicionar
            </button>
          </div>

          {addError && <p className="text-sm text-destructive">{addError}</p>}
        </div>
      </div>
    </div>
  );
}
