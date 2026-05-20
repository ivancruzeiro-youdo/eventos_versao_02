'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  doneAt: string | null;
  doneBy: { name: string } | null;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export default function EventChecklistPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    loadChecklist();
  }, [eventId]);

  async function loadChecklist() {
    try {
      const response = await fetch(`http://localhost:3001/api/v2/events/${eventId}/checklist`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setChecklist(data.checklist);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(itemId: string) {
    try {
      await fetch(`http://localhost:3001/api/v2/checklist/items/${itemId}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });
      loadChecklist();
    } catch (err) {
      console.error(err);
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;

    try {
      await fetch(`http://localhost:3001/api/v2/events/${eventId}/checklist/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: newItem }),
      });
      setNewItem('');
      loadChecklist();
    } catch (err) {
      console.error(err);
    }
  }

  const completedCount = checklist?.items.filter(i => i.done).length || 0;
  const totalCount = checklist?.items.length || 0;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="hover:text-gray-700">Evento</Link>
          <span>/</span>
          <span>Checklist</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Checklist</h1>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">Progresso</span>
          <span className="text-sm text-gray-500">{completedCount} de {totalCount} itens</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-primary-600 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Add Item */}
      <form onSubmit={addItem} className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Adicionar novo item..."
            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            + Adicionar
          </button>
        </div>
      </form>

      {/* Items */}
      <div className="bg-white rounded-lg shadow">
        {checklist?.items.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Nenhum item no checklist. Adicione o primeiro acima.
          </p>
        ) : (
          <div className="divide-y">
            {checklist?.items.map((item, index) => (
              <div 
                key={item.id} 
                className={`p-4 flex items-start gap-3 ${item.done ? 'bg-green-50' : ''}`}
              >
                <span className="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium mt-0.5">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className={`${item.done ? 'line-through text-gray-400' : ''}`}>
                    {item.text}
                  </p>
                  {item.done && item.doneAt && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ Concluído por {item.doneBy?.name || 'Usuário'} em {new Date(item.doneAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleItem(item.id)}
                  className={`px-3 py-1 rounded text-sm transition ${
                    item.done 
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {item.done ? 'Desfazer' : 'Concluir'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
