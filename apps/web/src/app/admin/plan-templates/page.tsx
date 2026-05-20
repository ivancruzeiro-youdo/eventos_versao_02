'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { Plus, Trash2 } from 'lucide-react';

interface Question {
  id: string;
  text: string;
  type: string;
  required: boolean;
  category?: string;
}

export default function AdminPlanTemplatesPage() {
  const [questions, setQuestions] = useState<Question[]>([
    { id: '1', text: 'Quantidade de convidados esperada?', type: 'number', required: true, category: 'Geral' },
    { id: '2', text: 'Tipo de buffet desejado?', type: 'select', required: true, category: 'Alimentação' },
    { id: '3', text: 'Necessita de som e iluminação?', type: 'checkbox', required: false, category: 'Técnica' },
    { id: '4', text: 'Observações especiais sobre decoração?', type: 'textarea', required: false, category: 'Decoração' },
  ]);
  const [newQuestion, setNewQuestion] = useState({ text: '', type: 'text', required: false, category: '' });

  function addQuestion() {
    if (!newQuestion.text) return;
    setQuestions([...questions, { ...newQuestion, id: Date.now().toString() }]);
    setNewQuestion({ text: '', type: 'text', required: false, category: '' });
  }

  function removeQuestion(id: string) {
    setQuestions(questions.filter(q => q.id !== id));
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Templates de Plano</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Questions List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4">Perguntas do Template Padrão</h2>
          <div className="space-y-3">
            {questions.map((q, index) => (
              <div key={q.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{q.text}</p>
                  <p className="text-sm text-gray-500">
                    {q.type} {q.required && '• Obrigatória'} • {q.category}
                  </p>
                </div>
                <button
                  onClick={() => removeQuestion(q.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Add Question */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4">Adicionar Pergunta</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Texto da Pergunta
              </label>
              <input
                type="text"
                value={newQuestion.text}
                onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Ex: Quantidade de convidados?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={newQuestion.type}
                  onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="text">Texto</option>
                  <option value="textarea">Texto Longo</option>
                  <option value="number">Número</option>
                  <option value="select">Seleção</option>
                  <option value="checkbox">Sim/Não</option>
                  <option value="date">Data</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria
                </label>
                <input
                  type="text"
                  value={newQuestion.category}
                  onChange={(e) => setNewQuestion({ ...newQuestion, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Ex: Alimentação"
                />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newQuestion.required}
                onChange={(e) => setNewQuestion({ ...newQuestion, required: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">Pergunta obrigatória</span>
            </label>
            <button
              onClick={addQuestion}
              className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              + Adicionar Pergunta
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
