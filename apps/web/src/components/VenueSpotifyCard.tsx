'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Music, Unplug } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Props {
  venueId: string;
}

// Mirrors the "Dispositivos de Mídia" card on the same page (apps/web/src/app/venues/[id]/page.tsx)
// — connect/disconnect a per-venue Spotify account (OAuth), used by the LED-panel desktop
// app to play the playlist chosen per event (see EventSpotifyPlaylist.tsx).
export default function VenueSpotifyCard({ venueId }: Props) {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    load();
    const status = searchParams.get('spotify');
    if (status === 'error') alert('Falha ao conectar com o Spotify. Tente novamente.');
  }, [venueId]);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v2/venues/${venueId}/spotify`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConnected(!!data.connected);
        setDisplayName(data.displayName || '');
      }
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Spotify deste espaço? Eventos com playlist escolhida vão parar de tocar até reconectar.')) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/venues/${venueId}/spotify`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) load();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mt-6 bg-card rounded-lg border shadow-sm">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-medium text-card-foreground flex items-center gap-2">
          <Music className="size-5" /> Spotify
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Conta Spotify deste espaço — cada evento escolhe uma playlist da conta pra tocar no painel de LED.
        </p>
      </div>
      <div className="p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-2">Carregando...</p>
        ) : connected ? (
          <div className="flex items-center gap-3 border rounded-md px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground">Conectado</p>
              <p className="text-xs text-muted-foreground mt-0.5">Conta: {displayName}</p>
            </div>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive transition rounded shrink-0 disabled:opacity-50"
            >
              <Unplug className="size-4" /> Desconectar
            </button>
          </div>
        ) : (
          <a
            href={`${API_URL}/api/v2/venues/${venueId}/spotify/authorize`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DB954] text-white rounded-md text-sm font-medium hover:opacity-90 transition"
          >
            <Music className="size-4" /> Conectar com Spotify
          </a>
        )}
      </div>
    </div>
  );
}
