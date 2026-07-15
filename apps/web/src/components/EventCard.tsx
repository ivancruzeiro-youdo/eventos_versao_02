'use client';

import Link from 'next/link';
import { Calendar, MapPin, Users } from 'lucide-react';
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

interface Event {
  id: string;
  name: string;
  clientName: string;
  status: string;
  startAt: string | null;
  venues: { venue: { name: string } }[];
  _count?: { guests: number };
}

interface EventCardProps {
  event: Event;
}

export default function EventCard({ event }: EventCardProps) {
  const venueName = event.venues?.length > 0 ? event.venues.map(v => v.venue.name).join(' + ') : 'Sem local definido';
  const guestCount = event._count?.guests || 0;

  return (
    <Link href={`/events/${event.id}`} className="block">
      <div className="bg-card rounded-lg border hover:border-primary/50 transition p-6 cursor-pointer">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">{event.name}</h3>
            <p className="text-sm text-muted-foreground">{event.clientName}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
            {getStatusLabel(event.status)}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4" />
            <span>{event.startAt ? formatDate(event.startAt) : 'Data não definida'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4" />
            <span>{venueName}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span>{guestCount} convidados</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex gap-2">
          <span className="text-xs text-primary font-medium">
            Ver detalhes →
          </span>
        </div>
      </div>
    </Link>
  );
}
