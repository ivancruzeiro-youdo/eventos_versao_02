'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { SlidersHorizontal, Key, Bot, Calendar, Check, X, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recomendado — mais inteligente)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (mais rápido e barato)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

export default function CozinhaConfigPage() {
  const [config, setConfig] = useState<{
    hasApiKey: boolean;
    apiKeyMasked: string | null;
    model: string;
    windowDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gpt-4o');
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/kitchen/config', { credentials: 'include' });
      const data = await res.json();
      setConfig(data);
      setModel(data.model || 'gpt-4o');
      setWindowDays(data.windowDays || 30);
    } catch {
      setError('Erro ao carregar configurações');
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body: any = { model, windowDays };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const res = await fetch('/api/v2/kitchen/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSuccess('Configurações salvas com sucesso!');
        setApiKey('');
        await load();
      } else {
        const d = await res.json();
        setError(d.error || 'Erro ao salvar');
      }
    } catch {
      setError('Erro ao salvar configurações');
    }
    setSaving(false);
  }

  async function removeKey() {
    if (!confirm('Remover a chave de API? O plano de produção IA não funcionará sem ela.')) return;
    await fetch('/api/v2/kitchen/config/openai-key', { method: 'DELETE', credentials: 'include' });
    await load();
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SlidersHorizontal size={24} /> Configurações da Cozinha
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure a integração com IA para geração automática do plano de produção.
          </p>
        </div>

        {/* OpenAI Section */}
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Bot size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold">OpenAI</h2>
              <p className="text-xs text-muted-foreground">Inteligência artificial para planejamento de produção</p>
            </div>
            <div className="ml-auto">
              {config?.hasApiKey ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
                  <CheckCircle size={12} /> Conectado
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full font-medium">
                  <AlertTriangle size={12} /> Não configurado
                </span>
              )}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-sm font-medium block mb-1.5 flex items-center gap-1.5">
              <Key size={14} /> Chave de API (OpenAI)
            </label>
            {config?.hasApiKey && (
              <div className="flex items-center gap-2 mb-2 text-sm">
                <span className="text-muted-foreground font-mono bg-muted px-2.5 py-1 rounded text-xs">
                  {config.apiKeyMasked}
                </span>
                <button onClick={removeKey} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                  <Trash2 size={12} /> Remover
                </button>
              </div>
            )}
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={config?.hasApiKey ? 'Nova chave (deixe vazio para manter a atual)' : 'sk-proj-...'}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background pr-10 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Obtenha sua chave em{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                platform.openai.com/api-keys
              </a>
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="text-sm font-medium block mb-1.5 flex items-center gap-1.5">
              <Bot size={14} /> Modelo
            </label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              GPT-4o oferece melhor qualidade de planejamento. GPT-4o Mini é mais econômico.
            </p>
          </div>
        </div>

        {/* Planning window */}
        <div className="bg-card border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Calendar size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold">Janela de Planejamento</h2>
              <p className="text-xs text-muted-foreground">Quantos dias à frente a IA deve planejar</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">
              Janela de planejamento: <span className="text-primary font-bold">{windowDays} dias</span>
            </label>
            <input
              type="range"
              min={7}
              max={90}
              step={7}
              value={windowDays}
              onChange={e => setWindowDays(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>7 dias</span>
              <span>30 dias</span>
              <span>60 dias</span>
              <span>90 dias</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              A IA analisará todos os eventos confirmados nos próximos {windowDays} dias e criará um plano de produção otimizado.
            </p>
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
            <X size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-4 py-3 text-sm">
            <Check size={16} /> {success}
          </div>
        )}

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50"
          >
            <Check size={16} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>

        {/* Info box */}
        <div className="bg-muted/40 border rounded-xl p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground flex items-center gap-2"><Bot size={14} /> Como funciona o Plano de Produção IA</p>
          <ul className="space-y-1 text-xs list-disc list-inside">
            <li>A IA analisa todos os eventos confirmados na janela de planejamento</li>
            <li>Considera receitas dos menus, tempo de preparo e validade pós-produção</li>
            <li>Agrupa produções de receitas comuns entre eventos próximos</li>
            <li>Verifica o estoque atual e aponta deficits de ingredientes</li>
            <li>Você pode ajustar o plano antes de aprovar</li>
            <li>Cada evento recebe um resumo com quantidade e custo de produção</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
