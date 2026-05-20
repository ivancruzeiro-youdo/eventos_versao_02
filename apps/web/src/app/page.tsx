import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold tracking-tight mb-4 text-primary">
          YouDO Experience
        </h1>
        <p className="text-muted-foreground mb-8">
          Sistema de gestão de eventos
        </p>
        
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition font-medium"
          >
            Acessar Dashboard
          </Link>
          
          <Link
            href="/freelancer/login"
            className="block px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition font-medium"
          >
            Portal do Freelancer
          </Link>
        </div>
      </div>
    </main>
  );
}
