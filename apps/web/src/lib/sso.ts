// YouDO Hub SSO helpers (front-end).
// The app trades the Hub's `youdo_token` cookie for a local 24h session via
// POST /api/v2/auth/userp-sso. These helpers handle the redirect to the Hub
// (with an anti-loop guard) and a logout that also clears the Hub cookies.

export const HUB_LOGIN_URL = 'https://hub.youdobrasil.com.br';
export const LOGOUT_URL =
  'https://userpweb.youdobrasil.com.br/api/userp-satelite/logout/index.php';
export const COOKIE_DOMAIN = '.youdobrasil.com.br';
export const TOKEN_COOKIE = 'youdo_token';
export const USER_COOKIE = 'youdo_user';

const REDIRECT_GUARD_KEY = 'sso_login_redirect_at';
const REDIRECT_GUARD_WINDOW_MS = 15_000;

// Returns true if we redirected to the Hub very recently. Prevents an infinite
// Hub <-> app loop when the Hub bounces back without a (still valid) cookie.
function recentlyRedirected(): boolean {
  try {
    const raw = sessionStorage.getItem(REDIRECT_GUARD_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < REDIRECT_GUARD_WINDOW_MS;
  } catch {
    return false;
  }
}

export function clearLoginRedirectGuard(): void {
  try {
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
  } catch {
    /* ignore */
  }
}

// Sends the browser to the Hub login, passing the current URL as `return` so the
// Hub can bring the user back here after authenticating.
export function redirectToLogin(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force && recentlyRedirected()) return;
  try {
    sessionStorage.setItem(REDIRECT_GUARD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const returnUrl = encodeURIComponent(window.location.href);
  window.location.href = `${HUB_LOGIN_URL}?return=${returnUrl}`;
}

function expireCookie(name: string): void {
  const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  // Clear on the shared root domain and on the current host as a fallback.
  document.cookie = `${name}=; ${expires}; domain=${COOKIE_DOMAIN}; path=/`;
  document.cookie = `${name}=; ${expires}; path=/`;
}

// Best-effort logout: notify the Hub, clear the shared cookies + localStorage,
// then bounce back to the Hub login screen.
export async function logoutHub(): Promise<void> {
  try {
    await fetch(LOGOUT_URL, { method: 'POST' });
  } catch {
    /* best-effort */
  }
  expireCookie(TOKEN_COOKIE);
  expireCookie(USER_COOKIE);
  try {
    localStorage.removeItem(TOKEN_COOKIE);
    localStorage.removeItem(USER_COOKIE);
  } catch {
    /* ignore */
  }
  clearLoginRedirectGuard();
  redirectToLogin(true);
}
