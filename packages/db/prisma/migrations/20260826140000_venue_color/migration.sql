-- Cor do local no calendário de eventos, mostrada como borda do evento.
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "color" TEXT;
