import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Only used for the Spotify OAuth refresh/access tokens (VenueSpotifyConnection) — the
// only long-lived third-party credential this API stores today. Everything else
// (VenueDevice.deviceToken, UerpConfig password) is plaintext-in-Postgres; a Spotify
// refresh token grants standing access to someone's real account, so it gets the extra
// layer instead of following those precedents.
//
// AES-256-GCM: authenticated encryption (tamper-evident, not just confidentiality).
// Key is derived once from SPOTIFY_TOKEN_ENCRYPTION_KEY via scrypt so the env var can be
// any passphrase-shaped string rather than needing to be exactly 32 random bytes.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce size for GCM
const SALT = 'youdo-spotify-token-v1'; // fixed salt: this only needs to be a KDF, not a password hash

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY não configurado no ambiente.');
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

// Output format: base64(iv) + '.' + base64(authTag) + '.' + base64(ciphertext)
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decrypt(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split('.');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Formato de token criptografado inválido.');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
