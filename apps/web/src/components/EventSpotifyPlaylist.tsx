'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Music, AlertCircle, Plus, Trash2, Pencil, Check, X } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
}

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

// One instance per venue this event is linked to (usually just one). Unlike a single
// "the" playlist, an event can list N playlists here — each with an operator-facing
// comment (e.g. "abertura", "jantar", "pista") — shown on the Windows app's
// ControlWindow (tela 1) so whoever's running the show picks the right one with context.
export default function EventSpotifyPlaylist({ eventId, venue }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null); // null = still checking
  const [accountPlaylists, setAccountPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [eventPlaylists, setEventPlaylists] = useState<EventPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickedId, setPickedId] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [newComment, setNewComment] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');

  useEffect(() => {
    load();
  }, [eventId, venue.id]);

  async function load() {
    setLoading(true);
    try {
      const statusRes = await fetch(`${API_URL}/api/v2/venues/${venue.id}/spotify`, { credentials: 'include' });
      const status = statusRes.ok ? await statusRes.json() : { connected: false };
      setConnected(!!status.connected);

      const listRes = await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlists`, { credentials: 'include' });
      if (listRes.ok) {
        const data = await listRes.json();
        setEventPlaylists(data.playlists || []);
      }

      if (status.connected) {
        const playlistsRes = await fetch(`${API_URL}/api/v2/venues/${venue.id}/spotify/playlists`, { credentials: 'include' });
        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setAccountPlaylists(data.playlists || []);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function addFromDropdown() {
    if (!pickedId) return;
    const playlist = accountPlaylists.find(p => p.id === pickedId);
    if (!playlist) return;
    await add({ spotifyPlaylistId: playlist.id, spotifyPlaylistName: playlist.name, comment: newComment });
    setPickedId('');
  }

  async function addFromUrl() {
    if (!urlInput.trim()) return;
    await add({ url: urlInput.trim(), comment: newComment });
    setUrlInput('');
  }

  async function add(body: Record<string, string | undefined>) {
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlists`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
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
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-medium text-card-foreground flex items-center gap-2">
          <Music className="size-5" /> Spotify — {venue.name}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Playlists disponíveis pro painel de LED durante este evento — o operador escolhe qual tocar na hora.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {!connected ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            Este espaço ainda não conectou o Spotify.{' '}
            <Link href={`/venues/${venue.id}`} className="text-primary underline">
              Conectar agora
            </Link>
          </p>
        ) : (
          <>
            {eventPlaylists.length > 0 && (
              <div className="space-y-2">
                {eventPlaylists.map(p => (
                  <div key={p.id} className="flex items-center gap-3 border rounded-md px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground">{p.spotifyPlaylistName}</p>
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
                    {editingId !== p.id && (
                      <button onClick={() => startEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground rounded shrink-0" title="Editar comentário">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button onClick={() => remove(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded shrink-0" title="Remover">
                      <Trash2 size={14} />
                    </button>
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
                <select
                  value={pickedId}
                  onChange={e => setPickedId(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm bg-background"
                >
                  <option value="">Escolher da conta conectada...</option>
                  {accountPlaylists.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={addFromDropdown}
                  disabled={adding || !pickedId}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
                >
                  <Plus className="size-4" /> Adicionar
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="...ou cole o link de uma playlist (open.spotify.com/playlist/...)"
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
          </>
        )}
      </div>
    </div>
  );
}
