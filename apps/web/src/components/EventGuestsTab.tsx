'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Plus, 
  Upload, 
  QrCode, 
  Link as LinkIcon, 
  CheckCircle, 
  XCircle,
  Search,
  Trash2,
  Download,
  Copy,
  CheckCheck
} from 'lucide-react';

interface Guest {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'declined';
  rsvpToken?: string;
}

interface EventGuestsTabProps {
  eventId: string;
}

export default function EventGuestsTab({ eventId }: EventGuestsTabProps) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');

  function openCsvModal() { setCsvText(''); setDupAlert(null); setShowCsvModal(true); }
  function closeCsvModal() { setShowCsvModal(false); setDupAlert(null); setCsvText(''); }
  const [importAsConfirmed, setImportAsConfirmed] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [qrData, setQrData] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [dupAlert, setDupAlert] = useState<{
    duplicateNames: string[];
    newOnly: any[];
    all: any[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  
  // Form state
  const [newGuest, setNewGuest] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
  });

  const loadGuests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v2/events/${eventId}/guests?limit=1000`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error('Failed to load guests');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadGuests();
  }, [loadGuests]);

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch(`/api/v2/events/${eventId}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newGuest),
      });
      if (response.ok) {
        setNewGuest({ name: '', email: '', phone: '', cpf: '' });
        setShowAddForm(false);
        loadGuests();
      }
    } catch (err) {
      alert('Erro ao adicionar convidado');
    }
  }

  async function deleteGuest(guestId: string) {
    if (!confirm('Tem certeza que deseja remover este convidado?')) return;
    try {
      await fetch(`/api/v2/events/${eventId}/guests/${guestId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      loadGuests();
    } catch (err) {
      alert('Erro ao remover convidado');
    }
  }

  async function setGuestStatus(guestId: string, status: Guest['status']) {
    try {
      await fetch(`/api/v2/guests/${guestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      loadGuests();
    } catch (err) {
      alert('Erro ao atualizar status do convidado');
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function parseCsvGuests(text: string) {
    const lines = text.trim().split(/\r?\n/);
    while (lines.length > 0 && /nome|name|e-?mail|telefone|phone|cpf|lista\s+de\s+conv|convidados|^\s*-+\s*$|^\s*#/i.test(lines[0])) {
      lines.shift();
    }
    return lines
      .map(line => {
        const [name, email, phone, cpf, status] = line.split(/[,;]/).map(s => s.trim());
        return { name, email, phone, cpf, status: importAsConfirmed ? 'confirmed' : (status || undefined) };
      })
      .filter(g => g.name?.trim());
  }

  async function doImport(list: any[]) {
    setImporting(true);
    try {
      const response = await fetch(`/api/v2/events/${eventId}/guests/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ guests: list }),
      });
      const data = await response.json();
      if (data.success) {
        alert(`Importação concluída: ${data.results.created} criados, ${data.results.skipped} ignorados`);
        setImportAsConfirmed(false);
        closeCsvModal();
        loadGuests();
      }
    } catch {
      alert('Erro ao importar');
    } finally {
      setImporting(false);
    }
  }

  function importCsv() {
    const parsed = parseCsvGuests(csvText);
    if (parsed.length === 0) {
      alert('Nenhum convidado válido encontrado no arquivo.');
      return;
    }

    const existingNames = new Set(guests.map(g => g.name.trim().toLowerCase()));
    const duplicateNames = parsed
      .filter(g => existingNames.has(g.name.trim().toLowerCase()))
      .map(g => g.name);
    const newOnly = parsed.filter(g => !existingNames.has(g.name.trim().toLowerCase()));

    if (duplicateNames.length > 0) {
      setDupAlert({ duplicateNames, newOnly, all: parsed });
    } else {
      doImport(parsed);
    }
  }

  async function generateQR(guest: Guest) {
    try {
      const response = await fetch(`/api/v2/events/${eventId}/guests/${guest.id}/qr`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setQrData(data.qrData);
        setSelectedGuest(guest);
        setShowQrModal(true);
      }
    } catch (err) {
      alert('Erro ao gerar QR code');
    }
  }

  async function generateRSVP(guest: Guest) {
    try {
      const response = await fetch(`/api/v2/events/${eventId}/guests/${guest.id}/rsvp-invite`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        const rsvpLink = `${window.location.origin}/rsvp/${data.guest.rsvpToken}`;
        navigator.clipboard.writeText(rsvpLink);
        setCopiedLink(guest.id);
        setTimeout(() => setCopiedLink(null), 2000);
        loadGuests();
      }
    } catch (err) {
      alert('Erro ao gerar link RSVP');
    }
  }

  async function checkInGuest(guestId: string) {
    try {
      await fetch(`/api/v2/events/${eventId}/guests/${guestId}/checkin`, {
        method: 'POST',
        credentials: 'include',
      });
      loadGuests();
    } catch (err) {
      alert('Erro no check-in');
    }
  }

  const filteredGuests = guests.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.cpf?.includes(searchTerm)
  );

  const stats = {
    total: guests.length,
    confirmed: guests.filter(g => g.status === 'confirmed').length,
    checkedIn: guests.filter(g => g.status === 'checked_in').length,
    pending: guests.filter(g => g.status === 'pending').length,
  };

  function getStatusBadge(status: string) {
    switch (status) {
      case 'confirmed':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Confirmado</span>;
      case 'checked_in':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Check-in</span>;
      case 'declined':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Recusado</span>;
      default:
        return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">Pendente</span>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
          <p className="text-xs text-muted-foreground">Confirmados</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.checkedIn}</p>
          <p className="text-xs text-muted-foreground">Check-ins</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pendentes</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar convidados..."
            className="w-full pl-10 pr-4 py-2 bg-card border rounded-lg"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCsvModal}
            className="px-4 py-2 border rounded-lg flex items-center gap-2 hover:bg-accent"
          >
            <Upload className="size-4" />
            CSV
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2"
          >
            <Plus className="size-4" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Add Guest Form */}
      {showAddForm && (
        <form onSubmit={addGuest} className="bg-card rounded-lg border p-4 space-y-3">
          <h4 className="font-medium">Novo Convidado</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newGuest.name}
              onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
              placeholder="Nome *"
              className="px-3 py-2 bg-background border rounded-lg"
              required
            />
            <input
              type="email"
              value={newGuest.email}
              onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
              placeholder="Email"
              className="px-3 py-2 bg-background border rounded-lg"
            />
            <input
              type="tel"
              value={newGuest.phone}
              onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
              placeholder="Telefone"
              className="px-3 py-2 bg-background border rounded-lg"
            />
            <input
              type="text"
              value={newGuest.cpf}
              onChange={(e) => setNewGuest({ ...newGuest, cpf: e.target.value })}
              placeholder="CPF"
              className="px-3 py-2 bg-background border rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
              Salvar
            </button>
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* CSV Modal */}
      {showCsvModal && (
        <div className="bg-card rounded-lg border p-4 space-y-3">
          <h4 className="font-medium">Importar CSV</h4>
          <p className="text-sm text-muted-foreground">
            Colunas: nome, email, telefone, cpf (status opcional). Uma linha por convidado; a primeira linha pode ser o cabeçalho.
          </p>
          <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-accent w-fit">
            <Upload className="size-4" />
            <span className="text-sm">Selecionar arquivo .csv</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFile}
              className="hidden"
            />
          </label>
          <p className="text-xs text-muted-foreground">Ou cole o conteúdo abaixo:</p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="João Silva, joao@email.com, 11999999999, 12345678901&#10;Maria Souza, maria@email.com, 11888888888, 98765432109"
            className="w-full h-32 px-3 py-2 bg-background border rounded-lg font-mono text-sm"
          />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={importAsConfirmed}
              onChange={e => setImportAsConfirmed(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Importar todos como <strong>confirmados</strong></span>
          </label>
          {/* Duplicate warning */}
          {dupAlert && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                {dupAlert.duplicateNames.length} convidado{dupAlert.duplicateNames.length !== 1 ? 's' : ''} já existe{dupAlert.duplicateNames.length !== 1 ? 'm' : ''} com o mesmo nome:
              </p>
              <ul className="text-xs text-amber-700 max-h-28 overflow-y-auto space-y-0.5">
                {dupAlert.duplicateNames.map(n => <li key={n}>• {n}</li>)}
              </ul>
              <p className="text-xs text-amber-700">O que deseja fazer?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => doImport(dupAlert.newOnly)}
                  disabled={importing || dupAlert.newOnly.length === 0}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50"
                >
                  {importing ? 'Importando...' : `Importar apenas os ${dupAlert.newOnly.length} novos`}
                </button>
                <button
                  onClick={() => doImport(dupAlert.all)}
                  disabled={importing}
                  className="px-3 py-1.5 border border-amber-400 text-amber-800 rounded text-xs font-medium disabled:opacity-50"
                >
                  {importing ? 'Importando...' : `Importar todos os ${dupAlert.all.length} (incluindo duplicatas)`}
                </button>
                <button onClick={() => setDupAlert(null)} className="px-3 py-1.5 border rounded text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {!dupAlert && (
            <div className="flex gap-2">
              <button
                onClick={importCsv}
                disabled={importing || !csvText.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {importing ? 'Importando...' : 'Importar'}
              </button>
              <button
                onClick={closeCsvModal}
                className="px-4 py-2 border rounded-lg"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* QR Modal */}
      {showQrModal && selectedGuest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 max-w-sm w-full mx-4">
            <h3 className="font-medium mb-4 text-center">QR Code - {selectedGuest.name}</h3>
            <div className="bg-white p-4 rounded-lg mb-4">
              <div className="w-48 h-48 mx-auto bg-gray-200 flex items-center justify-center">
                <QrCode className="size-32 text-gray-400" />
              </div>
              <p className="text-xs text-center text-muted-foreground mt-2 font-mono break-all">
                {qrData}
              </p>
            </div>
            <p className="text-sm text-center text-muted-foreground mb-4">
              Escaneie para fazer check-in
            </p>
            <button 
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 border rounded-lg"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Guests List */}
      <div className="bg-card rounded-lg border">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : filteredGuests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="size-12 mx-auto mb-4" />
            <p>Nenhum convidado encontrado</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredGuests.map((guest) => (
              <div key={guest.id} className="p-4 flex items-center gap-4 hover:bg-accent/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{guest.name}</p>
                    {getStatusBadge(guest.status)}
                  </div>
                  <div className="text-sm text-muted-foreground space-x-3">
                    {guest.email && <span>{guest.email}</span>}
                    {guest.phone && <span>{guest.phone}</span>}
                    {guest.cpf && <span className="font-mono">{guest.cpf}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {guest.status !== 'confirmed' && guest.status !== 'checked_in' && (
                    <button
                      onClick={() => setGuestStatus(guest.id, 'confirmed')}
                      className="p-2 hover:bg-green-100 text-green-600 rounded-lg"
                      title="Marcar como confirmado"
                    >
                      <CheckCircle className="size-4" />
                    </button>
                  )}
                  {guest.status !== 'declined' && guest.status !== 'checked_in' && (
                    <button
                      onClick={() => setGuestStatus(guest.id, 'declined')}
                      className="p-2 hover:bg-red-100 text-red-600 rounded-lg"
                      title="Marcar como recusado"
                    >
                      <XCircle className="size-4" />
                    </button>
                  )}
                  {guest.status !== 'checked_in' && (
                    <button
                      onClick={() => checkInGuest(guest.id)}
                      className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"
                      title="Check-in"
                    >
                      <CheckCheck className="size-4" />
                    </button>
                  )}
                  <button
                    onClick={() => generateRSVP(guest)}
                    className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"
                    title="Copiar link RSVP"
                  >
                    {copiedLink === guest.id ? (
                      <CheckCircle className="size-4" />
                    ) : (
                      <LinkIcon className="size-4" />
                    )}
                  </button>
                  <button
                    onClick={() => generateQR(guest)}
                    className="p-2 hover:bg-purple-100 text-purple-600 rounded-lg"
                    title="QR Code"
                  >
                    <QrCode className="size-4" />
                  </button>
                  <button
                    onClick={() => deleteGuest(guest.id)}
                    className="p-2 hover:bg-red-100 text-red-600 rounded-lg"
                    title="Remover"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
