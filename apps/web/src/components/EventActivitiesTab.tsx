'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Plus, X, Check, Trash2, Pencil, CheckCircle2, Circle,
  Calendar, AlertCircle, Paperclip, FileText, ChevronDown, ChevronRight,
  RotateCcw, Upload, Image, File,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssignableUser { id: string; name: string; email: string; role: string }
interface AssignablePerson { id: string; name: string; role: string }
interface ActivityFile { id: string; name: string; mimeType: string; sizeBytes: number; createdAt: string }
interface EventActivity {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'done';
  dueAt: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string; email: string } | null;
  assignedPerson: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  completedBy: { id: string; name: string } | null;
  completedAt: string | null;
  response: string | null;
  alertFreqMinutes: number;
  files: ActivityFile[];
  sourceTemplateId: string | null;
}

// Pessoas do evento não têm login no sistema — alertá-las só 1x por dia (em horário útil) evita incomodar
const MIN_FREQ_FOR_PERSON = 1440;
const FREQ_OPTIONS = [
  { value: 30, label: 'A cada 30 min' },
  { value: 60, label: 'A cada 1 hora' },
  { value: 120, label: 'A cada 2 horas' },
  { value: 240, label: 'A cada 4 horas' },
  { value: 480, label: 'A cada 8 horas' },
  { value: 1440, label: '1x por dia' },
];
function freqOptionsFor(assigneeVal: string) {
  return assigneeVal.startsWith('person:')
    ? FREQ_OPTIONS.filter(o => o.value >= MIN_FREQ_FOR_PERSON)
    : FREQ_OPTIONS;
}

// Combina Users (equipe interna) e Pessoas (convidados/equipe do evento) num único valor de select
function assigneeValue(a: Pick<EventActivity, 'assignedTo' | 'assignedPerson'>) {
  if (a.assignedPerson) return `person:${a.assignedPerson.id}`;
  if (a.assignedTo) return `user:${a.assignedTo.id}`;
  return '';
}
function assigneePayload(value: string) {
  if (value.startsWith('person:')) return { assignedPersonId: value.slice(7), assignedToId: null };
  if (value.startsWith('user:')) return { assignedToId: value.slice(5), assignedPersonId: null };
  return { assignedToId: null, assignedPersonId: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
      {initials(name)}
    </div>
  );
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDue(iso: string, status: string) {
  const d = new Date(iso);
  const now = new Date();
  const overdue = status === 'open' && d < now;
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return { label, overdue };
}

// ISO -> valor para <input type="datetime-local"> no fuso local
function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={13} className="text-blue-500" />;
  if (mime === 'application/pdf') return <FileText size={13} className="text-red-500" />;
  return <File size={13} className="text-muted-foreground" />;
}

// ── Edit Form (inline) ────────────────────────────────────────────────────────

function EditForm({
  activity, users, people, eventId,
  onCancel, onSaved,
}: {
  activity: EventActivity;
  users: AssignableUser[];
  people: AssignablePerson[];
  eventId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(activity.title);
  const [desc, setDesc] = useState(activity.description ?? '');
  const [assignee, setAssignee] = useState(assigneeValue(activity));
  const [dueAt, setDueAt] = useState(activity.dueAt ? isoToLocalInput(activity.dueAt) : '');
  const [alertFreq, setAlertFreq] = useState(activity.alertFreqMinutes ?? 30);
  const [saving, setSaving] = useState(false);

  function handleAssigneeChange(v: string) {
    setAssignee(v);
    const opts = freqOptionsFor(v);
    if (!opts.some(o => o.value === alertFreq)) setAlertFreq(opts[0].value);
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch(`/api/v2/events/${eventId}/activities/${activity.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description: desc || null,
        ...assigneePayload(assignee),
        alertFreqMinutes: alertFreq,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
        className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Descrição…"
        className="w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      <div className="flex gap-2">
        <select value={assignee} onChange={e => handleAssigneeChange(e.target.value)}
          className="flex-1 px-2 py-1.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">— Ninguém —</option>
          {users.length > 0 && (
            <optgroup label="Equipe interna">
              {users.map(u => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
            </optgroup>
          )}
          {people.length > 0 && (
            <optgroup label="Pessoas do evento">
              {people.map(p => <option key={p.id} value={`person:${p.id}`}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
        <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}
          className="flex-1 px-2 py-1.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      {assignee && (
        <select value={alertFreq} onChange={e => setAlertFreq(Number(e.target.value))}
          className="w-full px-2 py-1.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
          {freqOptionsFor(assignee).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1 text-xs border rounded hover:bg-muted transition">Cancelar</button>
        <button onClick={save} disabled={saving || !title.trim()}
          className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-1">
          <Check size={11} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ── Completion Modal ──────────────────────────────────────────────────────────

function CompletionModal({
  activity, eventId, onClose, onCompleted,
}: {
  activity: EventActivity;
  eventId: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [response, setResponse] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!response.trim()) { setError('Resposta é obrigatória'); return; }
    setSubmitting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('response', response);
      for (const f of files) fd.append('file', f);
      const r = await fetch(`/api/v2/events/${eventId}/activities/${activity.id}/complete`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao concluir');
      onCompleted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-sm">Concluir atividade</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-64">{activity.title}</p>
          </div>
          <button onClick={onClose}><X size={16} className="text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Resposta / conclusão *</label>
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Descreva como a atividade foi concluída…"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Anexos (opcional)</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed rounded-lg text-xs text-muted-foreground hover:bg-muted/40 transition"
            >
              <Upload size={13} /> Adicionar arquivos
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={e => addFiles(e.target.files)} />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between px-2 py-1.5 bg-muted/40 rounded-md text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileIcon mime={f.type} />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive ml-2 shrink-0"><X size={12} /></button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 text-sm border rounded-lg hover:bg-muted/50 transition">Cancelar</button>
            <button
              onClick={submit}
              disabled={submitting || !response.trim()}
              className="flex-1 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={14} /> {submitting ? 'Concluindo…' : 'Concluir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity Card ─────────────────────────────────────────────────────────────

function ActivityCard({
  activity, users, people, eventId,
  onDelete, onUpdated,
}: {
  activity: EventActivity;
  users: AssignableUser[];
  people: AssignablePerson[];
  eventId: string;
  onDelete: (id: string) => void;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isDone = activity.status === 'done';

  const due = activity.dueAt ? fmtDue(activity.dueAt, activity.status) : null;

  async function reopen() {
    await fetch(`/api/v2/events/${eventId}/activities/${activity.id}/reopen`, {
      method: 'POST', credentials: 'include',
    });
    onUpdated();
  }

  return (
    <>
      <div className={`bg-card border rounded-xl overflow-hidden transition ${isDone ? 'opacity-75' : ''}`}>
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            {/* Status icon */}
            <div className="mt-0.5 shrink-0">
              {isDone
                ? <CheckCircle2 size={16} className="text-green-500" />
                : <Circle size={16} className="text-amber-400" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {editing ? (
                <EditForm
                  activity={activity} users={users} people={people} eventId={eventId}
                  onCancel={() => setEditing(false)}
                  onSaved={() => { setEditing(false); onUpdated(); }}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                      {activity.title}
                      {activity.sourceTemplateId && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded align-middle">
                          espaço
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!isDone && (
                        <button onClick={() => setEditing(true)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition">
                          <Pencil size={12} />
                        </button>
                      )}
                      <button onClick={() => onDelete(activity.id)}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {activity.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{activity.description}</p>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                    {(activity.assignedTo || activity.assignedPerson) && (
                      <div className="flex items-center gap-1">
                        <Avatar name={(activity.assignedTo ?? activity.assignedPerson)!.name} />
                        <span className="text-xs text-muted-foreground">{(activity.assignedTo ?? activity.assignedPerson)!.name}</span>
                      </div>
                    )}
                    {due && (
                      <span className={`flex items-center gap-1 text-xs ${due.overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        <Calendar size={11} />
                        {due.overdue && <AlertCircle size={11} />}
                        {due.label}
                        {due.overdue && ' — atrasado'}
                      </span>
                    )}
                    {activity.createdBy && (
                      <span className="text-xs text-muted-foreground">
                        por {activity.createdBy.name}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions row */}
          {!editing && (
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t">
              {isDone ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Concluído por <span className="font-medium text-foreground">{activity.completedBy?.name}</span>
                    {activity.completedAt && <> · {new Date(activity.completedAt).toLocaleDateString('pt-BR')}</>}
                  </span>
                </div>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                {isDone && (activity.response || activity.files.length > 0) && (
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Ver resposta{activity.files.length > 0 && ` · ${activity.files.length} anexo${activity.files.length !== 1 ? 's' : ''}`}
                  </button>
                )}
                {isDone && (
                  <button onClick={reopen}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 hover:bg-muted transition">
                    <RotateCcw size={11} /> Reabrir
                  </button>
                )}
                {!isDone && (
                  <button onClick={() => setCompleting(true)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                    <Check size={12} /> Concluir
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Expanded response */}
        {isDone && expanded && (activity.response || activity.files.length > 0) && (
          <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
            {activity.response && (
              <div className="text-sm text-foreground bg-background border rounded-lg px-3 py-2 leading-relaxed">
                {activity.response}
              </div>
            )}
            {activity.files.length > 0 && (
              <div className="space-y-1">
                {activity.files.map(f => (
                  <a
                    key={f.id}
                    href={`/api/v2/activity-files/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition text-xs group"
                  >
                    <FileIcon mime={f.mimeType} />
                    <span className="flex-1 truncate group-hover:underline">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">{fmtSize(f.sizeBytes)}</span>
                    <Paperclip size={11} className="text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {completing && (
        <CompletionModal
          activity={activity}
          eventId={eventId}
          onClose={() => setCompleting(false)}
          onCompleted={() => { setCompleting(false); onUpdated(); }}
        />
      )}
    </>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function EventActivitiesTab({ eventId }: { eventId: string }) {
  const [activities, setActivities] = useState<EventActivity[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [people, setPeople] = useState<AssignablePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [alertFreq, setAlertFreq] = useState(30);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  function handleAssigneeChange(v: string) {
    setAssignee(v);
    const opts = freqOptionsFor(v);
    if (!opts.some(o => o.value === alertFreq)) setAlertFreq(opts[0].value);
  }

  const load = useCallback(async () => {
    const [actRes, usersRes] = await Promise.all([
      fetch(`/api/v2/events/${eventId}/activities`, { credentials: 'include' }),
      fetch(`/api/v2/events/${eventId}/assignable-users`, { credentials: 'include' }),
    ]);
    const actData = await actRes.json();
    const usersData = await usersRes.json();
    setActivities(actData.activities || []);
    setUsers(usersData.users || []);
    setPeople(usersData.people || []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!title.trim()) { setCreateError('Título é obrigatório'); return; }
    setCreating(true); setCreateError('');
    try {
      const r = await fetch(`/api/v2/events/${eventId}/activities`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim() || null,
          ...assigneePayload(assignee),
          alertFreqMinutes: alertFreq,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error);
      }
      setTitle(''); setDesc(''); setAssignee(''); setDueAt(''); setAlertFreq(30);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteActivity(id: string) {
    if (!confirm('Remover esta atividade?')) return;
    await fetch(`/api/v2/events/${eventId}/activities/${id}`, { method: 'DELETE', credentials: 'include' });
    setActivities(prev => prev.filter(a => a.id !== id));
  }

  const open = activities.filter(a => a.status === 'open');
  const done = activities.filter(a => a.status === 'done');

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Carregando atividades…</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Atividades</h3>
          {open.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
              {open.length} pendente{open.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition"
        >
          <Plus size={13} /> Nova atividade
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
          <p className="font-semibold text-sm">Nova atividade</p>

          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Título *"
            autoFocus
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Atribuir a</label>
              <select value={assignee} onChange={e => handleAssigneeChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— Ninguém —</option>
                {users.length > 0 && (
                  <optgroup label="Equipe interna">
                    {users.map(u => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                  </optgroup>
                )}
                {people.length > 0 && (
                  <optgroup label="Pessoas do evento">
                    {people.map(p => <option key={p.id} value={`person:${p.id}`}>{p.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prazo</label>
              <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {assignee && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Avisar por WhatsApp{assignee.startsWith('person:') && ' (pessoa sem login: mínimo 1x/dia)'}
              </label>
              <select value={alertFreq} onChange={e => setAlertFreq(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                {freqOptionsFor(assignee).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Alertas só são enviados em horário útil (dias úteis, 08h–18h).</p>
            </div>
          )}

          {createError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{createError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setShowForm(false); setCreateError(''); }}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted/50 transition">Cancelar</button>
            <button onClick={create} disabled={creating || !title.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition">
              <Check size={13} /> {creating ? 'Criando…' : 'Criar atividade'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {activities.length === 0 && !showForm && (
        <div className="bg-card border rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={22} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nenhuma atividade neste evento</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Crie atividades para delegar tarefas com prazo. A conclusão exige uma resposta e pode incluir anexos.
          </p>
        </div>
      )}

      {/* Open activities */}
      {open.length > 0 && (
        <div className="space-y-2">
          {open.map(a => (
            <ActivityCard
              key={a.id}
              activity={a}
              users={users}
              people={people}
              eventId={eventId}
              onDelete={deleteActivity}
              onUpdated={load}
            />
          ))}
        </div>
      )}

      {/* Done activities */}
      {done.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Concluídas — {done.length}
          </p>
          <div className="space-y-2">
            {done.map(a => (
              <ActivityCard
                key={a.id}
                activity={a}
                users={users}
                people={people}
                eventId={eventId}
                onDelete={deleteActivity}
                onUpdated={load}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
