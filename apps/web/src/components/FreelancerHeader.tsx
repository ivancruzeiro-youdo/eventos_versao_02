'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, Briefcase, FileText, User as UserIcon, LogOut } from 'lucide-react';
import { authApi } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/freelancer/dashboard', label: 'Vagas', icon: Briefcase },
  { href: '/freelancer/applications', label: 'Candidaturas', icon: FileText },
  { href: '/freelancer/profile', label: 'Perfil', icon: UserIcon },
];

export default function FreelancerHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    router.replace('/freelancer/login');
  }

  return (
    <>
      <header className="bg-[#1a1f2e] sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-white font-bold text-lg tracking-tight">
            YOU<span className="text-orange-400">DO</span>{' '}
            <span className="text-orange-400 font-semibold">Vagas</span>
          </span>
          <button
            onClick={() => setOpen(true)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Menu"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-[#1a1f2e] max-w-lg mx-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white font-bold text-lg tracking-tight">
                YOU<span className="text-orange-400">DO</span>{' '}
                <span className="text-orange-400 font-semibold">Vagas</span>
              </span>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="pb-2">
              {NAV_ITEMS.map(item => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 mx-2 mb-1 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-orange-400 text-white' : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="w-[calc(100%-1rem)] mx-2 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-300 hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
