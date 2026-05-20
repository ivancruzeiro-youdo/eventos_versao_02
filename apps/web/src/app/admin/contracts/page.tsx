'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { 
  FileText, 
  Search, 
  Link as LinkIcon,
  ExternalLink,
  AlertCircle
} from 'lucide-react';

interface Contract {
  id: string;
  number: string;
  clientName: string;
  eventName: string;
  value: number;
  status: 'active' | 'completed' | 'cancelled';
  signedAt: string;
  externalId?: string;
}

export default function AdminContractsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([
    {
      id: '1',
      number: 'CTR-2024-001',
      clientName: 'Empresa ABC',
      eventName: 'Festa de Fim de Ano',
      value: 25000,
      status: 'active',
      signedAt: '2024-01-15',
      externalId: 'UERP-12345',
    },
    {
      id: '2',
      number: 'CTR-2024-002',
      clientName: 'Corp XYZ',
      eventName: 'Conferência Anual',
      value: 45000,
      status: 'active',
      signedAt: '2024-02-20',
      externalId: 'UERP-12346',
    },
  ]);

  const filteredContracts = contracts.filter(c => 
    c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function getStatusBadge(status: string) {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Ativo</span>;
      case 'completed':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Concluído</span>;
      case 'cancelled':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Cancelado</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{status}</span>;
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Contratos</h1>
        <div className="flex gap-2">
          <button className="px-4 py-2 border rounded-lg flex items-center gap-2 hover:bg-accent">
            <LinkIcon className="size-4" />
            Sincronizar USERP
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar contratos por número, cliente ou evento..."
          className="w-full pl-10 pr-4 py-2 bg-card border rounded-lg"
        />
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <AlertCircle className="size-5 text-blue-600 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800">
            Os contratos são sincronizados automaticamente com o sistema USERP.
            Clique em "Sincronizar USERP" para atualizar a lista.
          </p>
        </div>
      </div>

      {/* Contracts List */}
      <div className="bg-card rounded-lg border">
        {filteredContracts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <FileText className="size-12 mx-auto mb-4" />
            <p>Nenhum contrato encontrado</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredContracts.map((contract) => (
              <div key={contract.id} className="p-4 hover:bg-accent/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <FileText className="size-5 text-primary" />
                      <span className="font-medium">{contract.number}</span>
                      {getStatusBadge(contract.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {contract.clientName} • {contract.eventName}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="font-medium text-green-600">
                        R$ {contract.value.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        Assinado em {new Date(contract.signedAt).toLocaleDateString('pt-BR')}
                      </span>
                      {contract.externalId && (
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                          USERP: {contract.externalId}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="p-2 hover:bg-accent rounded-lg text-muted-foreground">
                    <ExternalLink className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-card rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{contracts.filter(c => c.status === 'active').length}</p>
          <p className="text-xs text-muted-foreground">Contratos Ativos</p>
        </div>
        <div className="bg-card rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">
            R$ {contracts.filter(c => c.status === 'active').reduce((sum, c) => sum + c.value, 0).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">Valor Total Ativo</p>
        </div>
        <div className="bg-card rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{contracts.length}</p>
          <p className="text-xs text-muted-foreground">Total de Contratos</p>
        </div>
      </div>
    </Layout>
  );
}
