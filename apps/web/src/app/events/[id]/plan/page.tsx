'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { eventsApi } from '@/lib/api';

interface PlanQuestion {
  id: string;
  text: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'number';
  required: boolean;
  answer?: string;
  options?: string[];
  product?: { id: string; name: string; category: string };
}

interface Plan {
  id: string;
  name: string;
  questions: PlanQuestion[];
}

export default function EventPlanPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPlan();
  }, [eventId]);

  async function loadPlan() {
    try {
      const response = await fetch(`/api/v2/events/${eventId}/plan`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPlan(data.plan);
        // Load existing answers
        const existingAnswers: Record<string, string> = {};
        data.plan?.questions?.forEach((q: PlanQuestion) => {
          if (q.answer) existingAnswers[q.id] = q.answer;
        });
        setAnswers(existingAnswers);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/v2/events/${eventId}/plan/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answers }),
      });
      alert('Respostas salvas com sucesso!');
    } catch (err) {
      alert('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

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
          <span>Plano</span>
        </div>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {plan?.name || 'Plano do Evento'}
          </h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Respostas'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {plan?.questions?.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Nenhuma pergunta configurada para este plano.
          </p>
        ) : (
          plan?.questions?.map((question, index) => (
            <div key={question.id} className="border-b pb-6 last:border-0">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {question.text}
                    {question.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  {question.product && (
                    <p className="text-sm text-gray-500 mt-1">
                      📦 {question.product.name} ({question.product.category})
                    </p>
                  )}
                </div>
              </div>

              <div className="ml-11">
                {question.type === 'text' && (
                  <input
                    type="text"
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Sua resposta..."
                  />
                )}

                {question.type === 'textarea' && (
                  <textarea
                    rows={3}
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Sua resposta..."
                  />
                )}

                {question.type === 'number' && (
                  <input
                    type="number"
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                )}

                {question.type === 'date' && (
                  <input
                    type="date"
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                )}

                {question.type === 'select' && question.options && (
                  <select
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Selecione...</option>
                    {question.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {question.type === 'checkbox' && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={answers[question.id] === 'true'}
                      onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.checked ? 'true' : 'false' })}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span>Sim</span>
                  </label>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
