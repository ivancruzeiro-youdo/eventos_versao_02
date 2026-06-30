'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LayoutDashboard, Calendar, MapPin, Users, FileText, Settings, LogOut, ChefHat, Package, UtensilsCrossed, ShoppingCart, ClipboardList, BrainCircuit, SlidersHorizontal } from 'lucide-react';
import { logoutHub } from '@/lib/sso';
import { authApi } from '@/lib/api';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  event_owner: 'Gestor de Eventos',
  operator: 'Operador',
};

interface CurrentUser {
  name: string | null;
  email: string | null;
  role: string | null;
}

const mainNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Eventos', href: '/events', icon: Calendar },
  { name: 'Locais', href: '/venues', icon: MapPin },
  { name: 'Freelancers', href: '/freelancers', icon: Users },
  { name: 'Relatórios', href: '/reports', icon: FileText },
];

const kitchenNavigation = [
  { name: 'Ingredientes & Estoque', href: '/cozinha/ingredientes', icon: Package },
  { name: 'Receitas', href: '/cozinha/receitas', icon: UtensilsCrossed },
  { name: 'Lista de Compras', href: '/cozinha/compras', icon: ShoppingCart },
  { name: 'Registro de Compras', href: '/cozinha/compras/registros', icon: ClipboardList },
  { name: 'Plano de Produção IA', href: '/cozinha/producao', icon: BrainCircuit },
  { name: 'Configurações', href: '/cozinha/config', icon: SlidersHorizontal },
];

const adminNavigation = [
  { name: 'Usuários', href: '/admin/users' },
  { name: 'Empresas', href: '/admin/employers' },
  { name: 'Times', href: '/admin/times' },
  { name: 'Produtos', href: '/admin/products' },
  { name: 'Templates de Plano', href: '/admin/plan-templates' },
  { name: 'Templates de Briefing', href: '/admin/briefing-templates' },
  { name: 'Templates de Checklist', href: '/admin/checklist-templates' },
  { name: 'Relatórios', href: '/admin/reports' },
  { name: 'Logs', href: '/admin/audit-log' },
  { name: 'Acessos por Serviço', href: '/admin/acessos' },
  { name: 'Integrações', href: '/admin/integrations/userp' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith('/admin'));
  const [kitchenOpen, setKitchenOpen] = useState(pathname.startsWith('/cozinha'));
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    authApi
      .me()
      .then((res) => setUser(res.user ?? null))
      .catch(() => setUser(null));
  }, []);

  async function handleLogout() {
    // Clear the local session cookie, then clear the Hub cookies and bounce to the Hub.
    try {
      await fetch('/api/v2/auth/logout', {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    await logoutHub();
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - sempre dark conforme Design System */}
      <aside className="w-64 min-h-screen bg-sidebar text-sidebar-foreground hidden md:flex flex-col fixed left-0 top-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-sidebar-foreground">
            YouDO
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* Main Navigation */}
          {mainNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
              >
                <Icon className="size-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}

          {/* Kitchen Section */}
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <button
              onClick={() => setKitchenOpen(!kitchenOpen)}
              className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith('/cozinha')
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <ChefHat className="size-4" />
                <span>Cozinha</span>
              </div>
              {kitchenOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>

            {kitchenOpen && (
              <div className="mt-1 ml-4 space-y-1">
                {kitchenNavigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Admin Section */}
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <Settings className="size-4" />
                <span>Administração</span>
              </div>
              {adminOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            
            {adminOpen && (
              <div className="mt-1 ml-4 space-y-1">
                {adminNavigation.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                      }`}
                    >
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.name || user?.email || 'Carregando...'}
              </p>
              {user?.role && (
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {roleLabels[user.role] || user.role}
                </p>
              )}
            </div>
            <button 
              onClick={handleLogout}
              className="text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors flex items-center gap-2 shrink-0"
              title="Sair"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 md:ml-64">
        {/* Header */}
        <header className="h-14 border-b bg-card flex items-center px-6 sticky top-0 z-10">
          <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
            <h1 className="text-sm font-medium text-muted-foreground">
              {[...mainNavigation, ...adminNavigation].find(n => pathname.startsWith(n.href))?.name || 'YOUDO Experience'}
            </h1>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
