'use client';

// Barra de voz. Todo retorno falado também aparece em texto GRANDE aqui: em cozinha
// barulhenta o áudio pode não ser ouvido, então o visual é o canal real e o som é a
// confirmação — não o contrário.
import { Mic, MicOff, Ear, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import type { VoiceMode, VoiceState, PendingRemoval, Choice } from './useVoiceController';

interface Props {
  voiceMode: VoiceMode;
  state: VoiceState;
  transcript: string;
  message: string;
  level: number;
  pending: PendingRemoval | null;
  choices: Choice[];
  available: boolean | null;
  availableReason: string | null;
  micError: { message: string } | null;
  allowRemove: boolean;
  onAllowRemoveChange: (v: boolean) => void;
  onEnable: (m: 'ptt' | 'wake') => void;
  onDisable: () => void;
  onPushToTalk: () => void;
  onConfirmRemoval: () => void;
  onCancelRemoval: () => void;
  onDismissChoices: () => void;
}

const STATE_LABEL: Record<VoiceState, string> = {
  off: 'desligado',
  idle: 'pronto',
  gravando: 'ouvindo…',
  transcrevendo: 'entendendo…',
  executando: 'executando…',
  confirmando: 'aguardando confirmação',
  desambiguando: 'qual deles?',
};

export default function VoiceBar(p: Props) {
  const off = p.voiceMode === 'off';
  const disabled = p.available === false;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2">
      {/* Confirmação de remoção: faixa de alto contraste + botões gigantes. Confirmação
          respondível só por voz é armadilha em cozinha barulhenta. */}
      {p.pending && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border-2 border-red-500 bg-red-50 p-3">
          <AlertTriangle className="size-6 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight text-red-800">
              Remover “{p.pending.label}” das {p.pending.timeLabel}?
            </p>
            <p className="text-xs text-red-700">diga “sim” ou “não”, ou use os botões</p>
          </div>
          <button
            onClick={p.onConfirmRemoval}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-lg font-bold text-white hover:bg-red-700"
          >
            <Check className="size-5" /> SIM
          </button>
          <button
            onClick={p.onCancelRemoval}
            className="flex items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-6 py-3 text-lg font-bold text-slate-700 hover:bg-slate-50"
          >
            <X className="size-5" /> NÃO
          </button>
        </div>
      )}

      {/* Alternativas quando o nome ficou ambíguo — um toque resolve melhor que repetir. */}
      {p.choices.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 p-2">
          <span className="text-sm font-semibold text-amber-800">Qual deles?</span>
          {p.choices.map(c => (
            <button
              key={c.label}
              onClick={c.run}
              className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-amber-100"
            >
              {c.label}
            </button>
          ))}
          <button onClick={p.onDismissChoices} className="ml-auto text-xs text-slate-400 hover:text-slate-700">
            deixa
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Botão grande de apertar-e-falar: toque pra começar, toque de novo pra cancelar.
            Segurar é errado pra mão suja. */}
        <button
          onClick={off ? () => p.onEnable('wake') : p.onPushToTalk}
          disabled={disabled}
          className={`relative flex items-center gap-3 rounded-xl px-6 py-4 text-lg font-bold shadow-sm transition disabled:opacity-40 ${
            p.state === 'gravando'
              ? 'bg-red-600 text-white'
              : off
                ? 'border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
          title={off ? 'Ligar voz' : 'Falar um comando'}
        >
          {p.state === 'gravando' ? <Mic className="size-6" /> : off ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          {/* Um clique só liga tudo (microfone + "ok cozinha"). Depois da primeira vez, a tela
              já sobe com a voz ligada sozinha — o navegador só exige o gesto na 1ª permissão. */}
          {off ? 'LIGAR VOZ' : p.state === 'gravando' ? 'OUVINDO' : 'FALAR'}
          {/* Medidor de nível: mostra que o microfone captou, antes de qualquer resposta. */}
          {p.state === 'gravando' && (
            <span
              className="absolute inset-x-2 bottom-1 h-1 rounded bg-white/40"
              style={{ transform: `scaleX(${Math.max(0.05, p.level)})`, transformOrigin: 'left' }}
            />
          )}
        </button>

        {!off && (
          <>
            {/* Escuta contínua fica visível SEMPRE que ligada — quem está na cozinha tem que
                saber que o microfone está aberto. */}
            {p.voiceMode === 'wake' ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">
                <Ear className="size-4 animate-pulse" /> ESCUTANDO · diga “ok cozinha”
              </span>
            ) : (
              <button
                onClick={() => p.onEnable('wake')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ativar “ok cozinha”
              </button>
            )}

            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={p.allowRemove}
                onChange={e => p.onAllowRemoveChange(e.target.checked)}
                className="accent-red-600"
              />
              permitir remover por voz
            </label>

            <button onClick={p.onDisable} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">
              desligar
            </button>
          </>
        )}

        {/* Estado + o que foi entendido, em texto grande */}
        <div className="ml-auto min-w-0 flex-1 text-right">
          <p className="flex items-center justify-end gap-1.5 text-xs uppercase tracking-wide text-slate-400">
            {(p.state === 'transcrevendo' || p.state === 'executando') && <Loader2 className="size-3 animate-spin" />}
            {STATE_LABEL[p.state]}
          </p>
          {p.transcript && (
            <p className="truncate text-lg font-medium text-slate-700">“{p.transcript}”</p>
          )}
          {p.message && (
            <p className="truncate text-xl font-bold text-emerald-700">{p.message}</p>
          )}
        </div>
      </div>

      {(disabled || p.micError) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="size-3.5 shrink-0" />
          {p.micError?.message || p.availableReason || 'Voz indisponível.'}
        </p>
      )}

      {/* Só na primeira vez neste computador: depois a permissão fica salva no navegador e a
          voz sobe sozinha a cada carregamento. */}
      {off && !disabled && !p.micError && (
        <p className="mt-1.5 text-xs text-slate-400">
          Um toque libera o microfone e ativa o “ok cozinha”. Nas próximas vezes já sobe ligado.
        </p>
      )}
    </div>
  );
}
