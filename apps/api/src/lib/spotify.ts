// Thin wrapper around Spotify's Accounts + Web API (authorization-code OAuth flow),
// mirroring lib/s3.ts's style: a couple of env-var guards, one small exported async
// function per operation, no client class. This is the first OAuth integration in this
// codebase — the existing UERP integration (routes/uerp.ts) uses a static email+password
// pair instead, so there's no OAuth precedent here to follow beyond this file.
//
// Client ID/Secret are entered by an admin at Sistemas → Integrações → Spotify (stored in
// SpotifyAppConfig, see routes/spotify.ts) rather than an env var — same reasoning as the
// UERP integration's config page: whoever registers the app at
// developer.spotify.com/dashboard needs to paste the values in without server access.
// SPOTIFY_CLIENT_ID/SECRET env vars, if set, are used only as a fallback default.

import { prisma } from '../server.js';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

// Scopes needed: streaming (Web Playback SDK), playlist-read-* (list + play a venue's
// playlists), user-read-email/private (display name shown in the venue's Spotify card),
// user-read/modify-playback-state (control the Connect device from the desktop app).
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

export async function getSpotifyAppCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const config = await (prisma as any).spotifyAppConfig.findFirst();
  const clientId = config?.clientId || process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = config?.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function requireCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const creds = await getSpotifyAppCredentials();
  if (!creds) {
    throw new Error(
      'Spotify não configurado — cadastre o Client ID/Secret em Sistemas → Integrações → Spotify.'
    );
  }
  return creds;
}

function getRedirectUri(): string {
  const uri = process.env.SPOTIFY_REDIRECT_URI;
  if (!uri) throw new Error('SPOTIFY_REDIRECT_URI não configurado no ambiente.');
  return uri;
}

export async function getAuthorizeUrl(state: string): Promise<string> {
  const { clientId } = await requireCredentials();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string; // present on the initial code exchange, absent on some refreshes
  expires_in: number; // seconds
  scope: string;
  token_type: string;
}

async function basicAuthHeader(): Promise<string> {
  const { clientId, clientSecret } = await requireCredentials();
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function exchangeCode(code: string): Promise<SpotifyTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: await basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange falhou: HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: await basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh falhou: HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

export interface SpotifyProfile {
  id: string;
  display_name: string | null;
}

export async function getProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Spotify /me falhou: HTTP ${res.status}`);
  return res.json();
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
}

// Only the first page (50) — a venue realistically curates a handful of playlists for
// its own events, not hundreds; pagination can be added later if that assumption breaks.
export async function getPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const res = await fetch(`${API_BASE}/me/playlists?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify /me/playlists falhou: HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.images?.[0]?.url ?? null,
  }));
}
