'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Music, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface Props {
  eventId: string;
  venue: { id: string; name: string };
}

// One instance per venue this event is linked to (usually just one) — playlist choice
// is scoped to the event+venue pair (EventVenue.spotifyPlaylistId), not the event alone,
// since a venue's Spotify connection is what actually has the playlists to choose from.
export default function EventSpotifyPlaylist({ eventId, venue }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null); // null = still checking
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [eventId, venue.id]);

  async function load() {
    setLoading(true);
    try {
      const statusRes = await fetch(`${API_URL}/api/v2/venues/${venue.id}/spotify`, { credentials: 'include' });
      const status = statusRes.ok ? await statusRes.json() : { connected: false };
      setConnected(!!status.connected);
      if (!status.connected) return;

      const [playlistsRes, eventRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/venues/${venue.id}/spotify/playlists`, { credentials: 'include' }),
        fetch(`${API_URL}/api/v2/events/${eventId}`, { credentials: 'include' }),
      ]);
      if (playlistsRes.ok) {
        const data = await playlistsRes.json();
        setPlaylists(data.playlists || []);
      }
      if (eventRes.ok) {
        const data = await eventRes.json();
        const ev = (data.event?.venues || []).find((v: any) => v.venue?.id === venue.id || v.venueId === venue.id);
        setSelectedId(ev?.spotifyPlaylistId || '');
      }
    } finally {
      setLoading(false);
    }
  }

  async function choose(playlistId: string) {
    const playlist = playlists.find(p => p.id === playlistId);
    setSelectedId(playlistId);
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/v2/events/${eventId}/venues/${venue.id}/spotify-playlist`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotifyPlaylistId: playlistId || null,
          spotifyPlaylistName: playlist?.name || null,
        }),
      });
    } finally {
      setSaving(false);
    }
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
          Playlist que toca no painel de LED durante este evento.
        </p>
      </div>
      <div className="p-6">
        {!connected ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            Este espaço ainda não conectou o Spotify.{' '}
            <Link href={`/venues/${venue.id}`} className="text-primary underline">
              Conectar agora
            </Link>
          </p>
        ) : (
          <select
            value={selectedId}
            onChange={e => choose(e.target.value)}
            disabled={saving}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background disabled:opacity-50"
          >
            <option value="">Nenhuma (painel sem música)</option>
            {playlists.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
