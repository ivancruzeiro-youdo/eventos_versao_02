'use client';

import { useEffect, useRef, useState } from 'react';
import { aiChatApi, ApiError } from '@/lib/api';
import { BrainCircuit, Send, Plus, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface Thread {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ToolTraceEntry {
  tool: string;
  input: string;
  rowCount?: number;
  error?: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  toolTrace: ToolTraceEntry[] | null;
  createdAt: string;
}

export default function AiChatWidget() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [error, setError] = useState('');
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (activeThreadId) loadMessages(activeThreadId);
    else setMessages([]);
  }, [activeThreadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function loadThreads() {
    try {
      setLoadingThreads(true);
      const res = await aiChatApi.listThreads();
      setThreads(res.threads || []);
      if (res.threads?.length && !activeThreadId) setActiveThreadId(res.threads[0].id);
    } catch {
      setError('Erro ao carregar conversas.');
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadMessages(threadId: string) {
    try {
      const res = await aiChatApi.listMessages(threadId);
      setMessages(res.messages || []);
    } catch {
      setError('Erro ao carregar mensagens.');
    }
  }

  async function handleNewThread() {
    const res = await aiChatApi.createThread();
    setThreads((prev) => [res.thread, ...prev]);
    setActiveThreadId(res.thread.id);
  }

  async function handleDeleteThread(id: string) {
    await aiChatApi.deleteThread(id);
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) {
      const remaining = threads.filter((t) => t.id !== id);
      setActiveThreadId(remaining[0]?.id ?? null);
    }
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    let threadId: string;
    if (activeThreadId) {
      threadId = activeThreadId;
    } else {
      const res = await aiChatApi.createThread();
      setThreads((prev) => [res.thread, ...prev]);
      threadId = res.thread.id;
      setActiveThreadId(threadId);
    }

    setInput('');
    setError('');
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, role: 'user', content, toolTrace: null, createdAt: new Date().toISOString() },
    ]);
    setSending(true);

    try {
      const res = await aiChatApi.sendMessage(threadId, content);
      setMessages((prev) => [...prev, res.message]);
      loadThreads();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao consultar a IA.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <div className="px-6 py-4 border-b flex items-center gap-2">
        <BrainCircuit className="size-5 text-primary" />
        <h2 className="text-lg font-medium text-card-foreground">Assistente de Dados (IA)</h2>
        <span className="text-xs text-muted-foreground ml-1">pergunte sobre eventos, A&B, convidados...</span>
      </div>

      <div className="flex flex-col md:flex-row min-h-[420px]">
        {/* Threads sidebar */}
        <div className="md:w-56 border-b md:border-b-0 md:border-r flex flex-col">
          <button
            onClick={handleNewThread}
            className="flex items-center gap-2 px-4 py-3 text-sm text-primary hover:bg-muted/40 border-b"
          >
            <Plus className="size-4" /> Nova conversa
          </button>
          <div className="overflow-y-auto max-h-64 md:max-h-none">
            {loadingThreads ? (
              <p className="text-xs text-muted-foreground p-4">Carregando…</p>
            ) : threads.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4">Nenhuma conversa ainda.</p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  className={`group flex items-center justify-between gap-1 px-4 py-2.5 text-sm cursor-pointer border-b border-border/50 ${
                    activeThreadId === t.id ? 'bg-muted/60 font-medium' : 'hover:bg-muted/30'
                  }`}
                >
                  <span className="truncate">{t.title || 'Nova conversa'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteThread(t.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-h-96">
            {messages.length === 0 && !sending && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Ex.: "quantos eventos faltam fechar A&B em agosto?"
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}
                >
                  {m.content}
                  {m.toolTrace && m.toolTrace.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <button
                        onClick={() => setExpandedTrace(expandedTrace === m.id ? null : m.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {expandedTrace === m.id ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        {m.toolTrace.length} consulta{m.toolTrace.length > 1 ? 's' : ''} ao banco
                      </button>
                      {expandedTrace === m.id && (
                        <div className="mt-1.5 space-y-1.5">
                          {m.toolTrace.map((t, i) => (
                            <div key={i} className="text-xs bg-background/60 rounded p-2 font-mono">
                              <div className="opacity-70">{t.tool}</div>
                              <div className="whitespace-pre-wrap break-all">{t.input}</div>
                              {t.rowCount !== undefined && <div className="opacity-70">{t.rowCount} linha(s)</div>}
                              {t.error && <div className="text-destructive">{t.error}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> consultando o banco...
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive px-4">{error}</p>}

          <div className="border-t p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Pergunte algo sobre os dados do sistema..."
              disabled={sending}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
