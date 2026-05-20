'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface NPSData {
  guest: {
    name: string;
  };
  event: {
    name: string;
    startAt: string;
  };
}

export default function NPSPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<NPSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    loadNPS();
  }, [token]);

  async function loadNPS() {
    try {
      const res = await fetch(`http://localhost:3001/api/v2/nps/${token}`);
      if (!res.ok) throw new Error('Pesquisa não encontrada');
      const data = await res.json();
      setData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;

    try {
      const res = await fetch(`http://localhost:3001/api/v2/nps/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment }),
      });
      if (!res.ok) throw new Error('Erro ao enviar');
      setSubmitted(true);
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Pesquisa Indisponível</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🙏</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Obrigado!</h1>
          <p className="text-gray-600">
            Sua avaliação foi registrada. Agradecemos sua participação!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Como foi o evento?</h1>
          <p className="text-gray-600 mt-2">{data?.event.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-center text-sm font-medium text-gray-700 mb-4">
              Em uma escala de 0 a 10, qual a probabilidade de você recomendar este evento?
            </label>
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setScore(num)}
                  className={`w-10 h-10 rounded-lg font-medium transition ${
                    score === num
                      ? 'bg-primary-600 text-white'
                      : num <= 6
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : num <= 8
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>Não recomendaria</span>
              <span>Recomendaria com certeza</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comentários (opcional)
            </label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Conte-nos mais sobre sua experiência..."
            />
          </div>

          <button
            type="submit"
            disabled={score === null}
            className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 font-medium"
          >
            Enviar Avaliação
          </button>
        </form>
      </div>
    </div>
  );
}
