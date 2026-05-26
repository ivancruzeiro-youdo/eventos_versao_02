'use client';

import { useEffect, useState } from 'react';
import { Check, X, Phone, Mail, AlertTriangle, UserCheck, Clock, Users } from 'lucide-react';

interface Application {
  id: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  freelancer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    strikeCount: number;
  };
}

interface Props {
  eventId: string;
}

const statusConfig = {
  pending:  { label: 'Pendente',  color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Aprovado',  color: 'bg-green-100 text-green-800'  },
  rejected: { label: 'Rejeitado', color: 'bg-red-100 text-red-800'      },
};

export default function EventFreelancersTab({ eventId }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/applications`, { credentials: 'include' });
      const data = await res.json();
      setApplications(data.applications || []);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(appId: string, status: 'approved' | 'rejected') {
    setUpdating(appId);
    try {
      const res = await fetch(`/api/v2/applications/${appId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setApplications(prev =>
          prev.map(a => a.id === appId ? { ...a, status } : a)
        );
      } else {
        const d = await res.json();
        alert('Erro: ' + (d.error || 'Falha ao atualizar'));
      }
    } finally {
      setUpdating(null);
    }
  }

  // Group by role
  const byRole = applications.reduce<Record<string, Application[]>>((acc, app) => {
    (acc[app.role] ??= []).push(app);
    return acc;
  }, {});

  const pending  = applications.filter(a => a.status === 'pending').length;
  const approved = applications.filter(a => a.status === 'approved').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="bg-card rounded-lg border p-12 text-center">
        <Users className="size-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-medium text-foreground mb-1">Nenhuma candidatura</h3>
        <p className="text-sm text-muted-foreground">
          Freelancers ainda não se candidataram a este evento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Clock size={14} className="text-yellow-600" />
            <span className="text-xs text-muted-foreground font-medium">Pendentes</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{pending}</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <UserCheck size={14} className="text-green-600" />
            <span className="text-xs text-muted-foreground font-medium">Aprovados</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{approved}</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <X size={14} className="text-red-500" />
            <span className="text-xs text-muted-foreground font-medium">Rejeitados</span>
          </div>
          <p className="text-2xl font-bold text-red-500">{rejected}</p>
        </div>
      </div>

      {/* By role */}
      {Object.entries(byRole).map(([role, apps]) => (
        <div key={role} className="bg-card border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold text-sm">{role}</h3>
            <span className="text-xs text-muted-foreground">{apps.length} candidatura{apps.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y">
            {apps.map(app => {
              const cfg = statusConfig[app.status];
              const busy = updating === app.id;
              return (
                <div key={app.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary text-sm">
                    {app.freelancer.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{app.freelancer.name}</p>
                      {app.freelancer.strikeCount > 0 && (
                        <span title={`${app.freelancer.strikeCount} penalidade(s)`}
                          className="flex items-center gap-0.5 text-xs text-orange-600">
                          <AlertTriangle size={11} /> {app.freelancer.strikeCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail size={11} /> {app.freelancer.email}
                      </span>
                      {app.freelancer.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone size={11} /> {app.freelancer.phone}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(app.appliedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
                    {cfg.label}
                  </span>

                  {/* Actions */}
                  {app.status === 'pending' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateStatus(app.id, 'approved')}
                        disabled={busy}
                        title="Aprovar"
                        className="p-1.5 rounded-full bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 transition"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => updateStatus(app.id, 'rejected')}
                        disabled={busy}
                        title="Rejeitar"
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {app.status !== 'pending' && (
                    <button
                      onClick={() => updateStatus(app.id, app.status === 'approved' ? 'rejected' : 'approved')}
                      disabled={busy}
                      title="Reverter"
                      className="p-1.5 rounded border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition shrink-0"
                    >
                      Reverter
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
