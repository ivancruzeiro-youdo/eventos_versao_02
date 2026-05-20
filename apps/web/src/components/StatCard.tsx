'use client';

import { Calendar, Users, Briefcase, LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: 'calendar' | 'users' | 'briefcase';
  trend?: string;
}

const iconMap: Record<string, LucideIcon> = {
  calendar: Calendar,
  users: Users,
  briefcase: Briefcase,
};

export default function StatCard({ title, value, icon, trend }: StatCardProps) {
  const Icon = iconMap[icon];

  return (
    <div className="bg-card rounded-lg border p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-card-foreground mt-2">{value}</p>
          {trend && (
            <p className="text-sm text-success mt-1">{trend}</p>
          )}
        </div>
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
