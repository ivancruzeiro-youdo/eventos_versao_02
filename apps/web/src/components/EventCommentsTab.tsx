'use client';

import { useState, useEffect } from 'react';
import { MessageCircle, Send, Trash2, Edit2, Clock, User, RefreshCw } from 'lucide-react';

interface Comment {
  id: string;
  content: string;
  isSystem: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface EventCommentsTabProps {
  eventId: string;
}

export default function EventCommentsTab({ eventId }: EventCommentsTabProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    fetchComments();
  }, [eventId]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/v2/events/${eventId}/comments`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newComment }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [...prev, data.comment]);
        setNewComment('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (commentId: string) => {
    const res = await fetch(`/api/v2/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: editContent }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments(prev => prev.map(c => c.id === commentId ? data.comment : c));
      setEditingId(null);
      setEditContent('');
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Excluir este comentário?')) return;
    const res = await fetch(`/api/v2/comments/${commentId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const formatDate = (dateString: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(dateString));

  return (
    <div className="space-y-4">
      {/* Compose */}
      <div className="bg-card border rounded-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Escreva um comentário..."
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none bg-background text-sm"
            rows={3}
            disabled={loading}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !newComment.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm"
            >
              <Send size={14} />
              {loading ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>

      {/* Comments list */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
            <MessageCircle className="mx-auto h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum comentário ainda.</p>
          </div>
        ) : (
          comments.map(comment => {
            if (comment.isSystem) {
              return (
                <div key={comment.id} className="bg-muted/40 border border-dashed rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground">Sistema</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
                  </div>
                  <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{comment.content}</pre>
                </div>
              );
            }

            return (
              <div key={comment.id} className="bg-card border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                    <User size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-medium text-sm text-foreground">{comment.user?.name ?? '—'}</span>
                      <span className="text-xs text-muted-foreground">{comment.user?.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Clock size={11} />
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>

                    {editingId === comment.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none bg-background text-sm"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(comment.id)}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90">
                            Salvar
                          </button>
                          <button onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-3 py-1 border rounded text-sm hover:bg-muted">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition rounded" title="Editar">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(comment.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition rounded" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
