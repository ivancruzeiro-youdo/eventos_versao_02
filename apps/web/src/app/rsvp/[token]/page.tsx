'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface RSVPData {
  guest: {
    name: string;
  };
  event: {
    name: string;
    startAt: string;
  };
}

export default function RSVPPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<RSVPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [response, setResponse] = useState<'confirmed' | 'declined' | null>(null);

  useEffect(() => {
    loadRSVP();
  }, [token]);

  async function loadRSVP() {
    try {
      const res = await fetch(`/api/v2/rsvp/${token}`);
      if (!res.ok) throw new Error('Convite não encontrado');
      const data = await res.json();
      setData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResponse(status: 'confirmed' | 'declined') {
    try {
      const res = await fetch(`/api/v2/rsvp/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Erro ao confirmar');
      setResponse(status);
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
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Convite Inválido</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">
            {response === 'confirmed' ? '🎉' : '😔'}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {response === 'confirmed' ? 'Presença Confirmada!' : 'Resposta Registrada'}
          </h1>
          <p className="text-gray-600">
            {response === 'confirmed' 
              ? `Obrigado, ${data?.guest.name}! Sua presença foi confirmada em ${data?.event.name}.`
              : `Obrigado pela resposta, ${data?.guest.name}.`
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Você foi convidado!</h1>
          <p className="text-gray-600 mt-2">{data?.event.name}</p>
          <p className="text-sm text-gray-500">
            {new Date(data?.event.startAt || '').toLocaleDateString('pt-BR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        <div className="bg-primary-50 rounded-lg p-4 mb-6">
          <p className="text-center text-primary-800">
            Olá, <strong>{data?.guest.name}</strong>! <br />
            Confirme sua presença:
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleResponse('confirmed')}
            className="py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
          >
            ✓ Vou comparecer
          </button>
          <button
            onClick={() => handleResponse('declined')}
            className="py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
          >
            ✗ Não posso ir
          </button>
        </div>
      </div>
    </div>
  );
}
