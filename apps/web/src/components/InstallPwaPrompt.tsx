'use client';

import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

const DISMISS_KEY = 'freelancer_pwa_prompt_dismissed_at';
const INSTALLED_KEY = 'freelancer_pwa_installed';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias

function isStandaloneNow(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isDismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage indisponível (modo privado etc.) — só não persiste a preferência, sem quebrar nada.
  }
}

// iOS de verdade (Safari), não Chrome/Firefox no iOS — esses usam WebKit mas o menu de
// compartilhar/instruções fica em lugar diferente, então não damos instrução errada pra eles.
function isRealIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && !isOtherBrowser;
}

export default function InstallPwaPrompt() {
  const [platform, setPlatform] = useState<'none' | 'android' | 'ios'>('none');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandaloneNow()) return;
    try {
      if (localStorage.getItem(INSTALLED_KEY) === '1') return;
    } catch {
      // segue normalmente sem a checagem
    }
    if (isDismissedRecently()) return;

    if (isRealIosSafari()) {
      setPlatform('ios');
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('android');
    }
    function onAppInstalled() {
      try {
        localStorage.setItem(INSTALLED_KEY, '1');
      } catch {
        // sem localStorage, só não persiste — a checagem de display-mode ainda cobre o caso normal
      }
      setPlatform('none');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  function handleClose() {
    dismiss();
    setPlatform('none');
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      // O evento só serve uma vez — sempre limpa, tenha o usuário aceitado ou não.
      setDeferredPrompt(null);
      setInstalling(false);
      dismiss();
      setPlatform('none');
    }
  }

  if (platform === 'none') return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 max-w-lg mx-auto p-3">
      <div className="bg-[#1a1f2e] text-white rounded-2xl shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Instale o app YouDO Vagas</p>
            {platform === 'android' ? (
              <p className="text-xs text-white/70 mt-0.5">
                Acesse mais rápido, direto da tela inicial do celular.
              </p>
            ) : (
              <div className="text-xs text-white/70 mt-1.5 space-y-1">
                <p className="flex items-center gap-1.5">
                  1. Toque em <Share className="w-3.5 h-3.5 inline text-orange-400" /> (Compartilhar) na barra do Safari
                </p>
                <p className="flex items-center gap-1.5">
                  2. Role e toque em <SquarePlus className="w-3.5 h-3.5 inline text-orange-400" /> "Adicionar à Tela de Início"
                </p>
                <p>3. Toque em "Adicionar"</p>
              </div>
            )}
          </div>
          <button onClick={handleClose} className="text-white/50 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button onClick={handleClose} className="text-xs font-medium text-white/70 hover:text-white px-3 py-1.5">
            Agora não
          </button>
          {platform === 'android' && (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="text-xs font-medium bg-orange-400 hover:bg-orange-500 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {installing ? 'Instalando…' : 'Instalar'}
            </button>
          )}
          {platform === 'ios' && (
            <button
              onClick={handleClose}
              className="text-xs font-medium bg-orange-400 hover:bg-orange-500 text-white rounded-lg px-3 py-1.5"
            >
              Entendi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
