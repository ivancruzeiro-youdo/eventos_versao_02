'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { freelancerApi, ApiError } from '@/lib/api';
import FreelancerHeader from '@/components/FreelancerHeader';
import { Mail, Phone, IdCard, Cake, Briefcase, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ServiceLink {
  service: { id: string; name: string };
}

interface Penalty {
  id: string;
  reason: string;
  createdAt: string;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
  birthDate: string | null;
  status: string;
  strikeCount: number;
  services: ServiceLink[];
  penalties: Penalty[];
  _count?: { applications: number };
}

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function statusLabel(s: string) {
  return { active: 'Ativo', suspended: 'Suspenso', inactive: 'Inativo' }[s] || s;
}

function statusColor(s: string) {
  return {
    active: 'bg-green-100 text-green-700',
    suspended: 'bg-red-100 text-red-700',
    inactive: 'bg-gray-100 text-gray-500',
  }[s] || 'bg-gray-100 text-gray-500';
}

export default function FreelancerProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    freelancerApi.profile()
      .then((res: any) => setProfile(res.profile))
      .catch((err: any) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/freelancer/login');
          return;
        }
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400"></div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <FreelancerHeader />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-10">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1f2e] leading-tight">Meu Perfil</h1>
          <p className="text-sm text-gray-500 mt-1">Seus dados cadastrais e serviços</p>
        </div>

        {/* Identity card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-[#1a1f2e] px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-lg">{profile.name}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-semibold ${statusColor(profile.status)}`}>
                {statusLabel(profile.status)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-400">{profile._count?.applications ?? 0}</p>
              <p className="text-[10px] text-white/60 uppercase tracking-wide">Confirmados</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-sm text-gray-700">{profile.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <IdCard className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-sm text-gray-700">{formatCpf(profile.cpf)}</p>
            </div>
            {profile.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                <p className="text-sm text-gray-700">{formatPhone(profile.phone)}</p>
              </div>
            )}
            {profile.birthDate && (
              <div className="flex items-center gap-3">
                <Cake className="w-4 h-4 text-gray-400 shrink-0" />
                <p className="text-sm text-gray-700">{new Date(profile.birthDate).toLocaleDateString('pt-BR')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-[#1a1f2e] flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-gray-400" /> Serviços cadastrados
          </p>
          {profile.services.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum serviço cadastrado.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.services.map(s => (
                <span key={s.service.id} className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full font-medium border border-orange-100">
                  {s.service.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Penalties, if any */}
        {profile.penalties.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm font-semibold text-[#1a1f2e] flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Advertências ({profile.strikeCount})
            </p>
            <div className="space-y-2">
              {profile.penalties.map(p => (
                <div key={p.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-gray-700">{p.reason}</p>
                    <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
