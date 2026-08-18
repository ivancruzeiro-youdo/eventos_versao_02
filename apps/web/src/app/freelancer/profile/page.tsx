'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { freelancerApi, ApiError } from '@/lib/api';
import FreelancerHeader from '@/components/FreelancerHeader';
import { Mail, Phone, IdCard, Cake, Briefcase, CheckCircle2, AlertTriangle, Camera, X, RotateCcw, Check, User } from 'lucide-react';

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
  fotoBase64: string | null;
  services: ServiceLink[];
  penalties: Penalty[];
  _count?: { applications: number };
}

/** Reduz o frame pra um tamanho razoável de foto de identificação antes de virar base64 —
 *  sem isso um frame de câmera cru vira um base64 gigante indo pro banco e pro sistema de
 *  acessos à toa. */
function drawToJpegDataUrl(source: CanvasImageSource, srcW: number, srcH: number, maxDim = 480): string {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
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

  const [showCamera, setShowCamera] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  }

  async function openCamera() {
    setPhotoError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setShowCamera(true);
      // O <video> só existe depois do setShowCamera renderizar o modal.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      // Sem câmera/permissão negada: cai pro seletor nativo (que no celular já abre a câmera).
      fileInputRef.current?.click();
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPhotoPreview(drawToJpegDataUrl(video, video.videoWidth, video.videoHeight));
    stopCamera();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setPhotoPreview(drawToJpegDataUrl(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  async function confirmPhoto() {
    if (!photoPreview) return;
    setSavingPhoto(true);
    setPhotoError(null);
    try {
      const res: any = await freelancerApi.updatePhoto(photoPreview);
      setProfile(res.freelancer);
      setPhotoPreview(null);
    } catch {
      setPhotoError('Não foi possível salvar a foto. Tente novamente.');
    } finally {
      setSavingPhoto(false);
    }
  }

  useEffect(() => stopCamera, []);

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
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {profile.fotoBase64 ? (
                  <img src={profile.fotoBase64} alt="Sua foto" className="w-16 h-16 rounded-full object-cover border-2 border-orange-100" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                    <User className="w-7 h-7 text-gray-400" />
                  </div>
                )}
                <button
                  onClick={openCamera}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-orange-400 text-white flex items-center justify-center shadow-sm hover:bg-orange-500"
                  aria-label="Tirar foto"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1a1f2e]">{profile.fotoBase64 ? 'Foto para o sistema de acessos' : 'Sem foto cadastrada'}</p>
                <button onClick={openCamera} className="text-xs text-orange-600 font-medium hover:underline">
                  {profile.fotoBase64 ? 'Trocar foto' : 'Tirar foto'}
                </button>
              </div>
            </div>
            {photoError && <p className="text-xs text-red-500">{photoError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileSelected}
            />

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

      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-md h-auto scale-x-[-1]" />
          <div className="absolute top-4 right-4">
            <button onClick={stopCamera} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="absolute bottom-8">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-orange-400 flex items-center justify-center"
              aria-label="Capturar foto"
            >
              <Camera className="w-6 h-6 text-[#1a1f2e]" />
            </button>
          </div>
        </div>
      )}

      {photoPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center gap-6 px-4">
          <img src={photoPreview} alt="Prévia da foto" className="w-56 h-56 rounded-full object-cover border-4 border-white/20" />
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setPhotoPreview(null); openCamera(); }}
              disabled={savingPhoto}
              className="px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> Tirar novamente
            </button>
            <button
              onClick={confirmPhoto}
              disabled={savingPhoto}
              className="px-4 py-2.5 rounded-xl bg-orange-400 text-white font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> {savingPhoto ? 'Salvando...' : 'Usar esta foto'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
