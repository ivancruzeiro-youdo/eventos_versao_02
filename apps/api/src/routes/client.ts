import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { createDownloadPresignedUrl, createUploadPresignedUrl, deleteS3Object, sanitizeFilenameForKey } from '../lib/s3.js';
import { mediaTypeFromMime, MAX_SIZE_BYTES, formatMb } from './event-media.js';
import { getValidAccessToken } from './spotify.js';
import { getPlaylist, parsePlaylistId } from '../lib/spotify.js';

async function getClientSession(app: FastifyInstance, request: any, reply: any) {
  const auth = request.headers['x-client-auth'] as string | undefined;
  const { token } = request.params as { token: string };

  if (!auth) {
    reply.status(401).send({ error: 'Autenticação necessária' });
    return null;
  }

  try {
    const payload = app.jwt.verify(auth) as { eventId: string; clientToken: string };
    if (payload.clientToken !== token) {
      reply.status(403).send({ error: 'Acesso negado' });
      return null;
    }
    return payload;
  } catch {
    reply.status(401).send({ error: 'Sessão inválida ou expirada' });
    return null;
  }
}

export async function clientRoutes(app: FastifyInstance) {
  // Auth: verify reservation number and return session JWT
  // Tighter limit than the global default — the reservation number is a guessable
  // secret, this endpoint needs its own throttle rather than relying on the global one.
  app.post('/client/:token/auth', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const { reservationNumber } = request.body as { reservationNumber?: string };

    if (!reservationNumber?.trim()) {
      return reply.status(400).send({ error: 'Número de reserva obrigatório' });
    }

    const event = await prisma.event.findUnique({
      where: { clientToken: token },
      select: {
        id: true,
        name: true,
        clientName: true,
        startAt: true,
        setupAt: true,
        teardownAt: true,
        status: true,
        reservationNumber: true,
        venues: { include: { venue: { select: { id: true, name: true } } } },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' });
    }

    if (!event.reservationNumber) {
      return reply.status(400).send({ error: 'Este evento ainda não está configurado para acesso de cliente' });
    }

    if (event.reservationNumber.trim().toLowerCase() !== reservationNumber.trim().toLowerCase()) {
      return reply.status(401).send({ error: 'Número de reserva incorreto' });
    }

    const sessionToken = app.jwt.sign(
      { eventId: event.id, clientToken: token },
      { expiresIn: '30d' }
    );

    return {
      success: true,
      sessionToken,
      event: {
        id: event.id,
        name: event.name,
        clientName: event.clientName,
        startAt: event.startAt,
        setupAt: event.setupAt,
        teardownAt: event.teardownAt,
        status: event.status,
        venues: event.venues.map(v => ({ id: v.id, name: v.venue.name })),
      },
    };
  });

  // Get event summary (authenticated)
  app.get('/client/:token/event', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const event = await prisma.event.findUnique({
      where: { id: session.eventId },
      select: {
        id: true,
        name: true,
        clientName: true,
        startAt: true,
        setupAt: true,
        teardownAt: true,
        status: true,
        venues: { include: { venue: { select: { id: true, name: true, address: true } } } },
      },
    });

    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });
    return { success: true, event };
  });

  // List client-visible files
  app.get('/client/:token/files', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const files = await prisma.file.findMany({
      where: { eventId: session.eventId, visibleToClient: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, files };
  });

  // Download a client-visible file (presigned URL)
  app.get('/client/:token/files/:fileId/download', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { fileId } = request.params as { token: string; fileId: string };

    const file = await prisma.file.findFirst({
      where: { id: fileId, eventId: session.eventId, visibleToClient: true },
    });

    if (!file) return reply.status(404).send({ error: 'Arquivo não encontrado' });

    const downloadUrl = await createDownloadPresignedUrl(file.s3Key, file.name);
    return { success: true, downloadUrl };
  });

  // List guests
  app.get('/client/:token/guests', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const q = request.query as { page?: string; limit?: string; search?: string };

    const page = parseInt(q.page || '1', 10);
    const limit = parseInt(q.limit || '50', 10);
    const skip = (page - 1) * limit;

    const where: any = { eventId: session.eventId };
    if (q.search?.trim()) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.guest.count({ where }),
    ]);

    return { success: true, guests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });

  // Add guest
  app.post('/client/:token/guests', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { name, email, phone, cpf } = request.body as any;

    if (!name?.trim()) return reply.status(400).send({ error: 'Nome obrigatório' });

    const guest = await prisma.guest.create({
      data: {
        eventId: session.eventId,
        name: name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        cpf: cpf?.replace(/\D/g, '') || undefined,
        status: 'confirmed',
        rsvpToken: crypto.randomUUID(),
      },
    });

    return reply.status(201).send({ success: true, guest });
  });

  // Update guest
  app.patch('/client/:token/guests/:guestId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { guestId } = request.params as { token: string; guestId: string };
    const { name, email, phone, cpf, status } = request.body as any;

    const existing = await prisma.guest.findFirst({ where: { id: guestId, eventId: session.eventId } });
    if (!existing) return reply.status(404).send({ error: 'Convidado não encontrado' });

    const guest = await prisma.guest.update({
      where: { id: guestId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(cpf !== undefined ? { cpf: cpf?.replace(/\D/g, '') || null } : {}),
        ...(status ? { status } : {}),
      },
    });

    return { success: true, guest };
  });

  // Delete guest
  app.delete('/client/:token/guests/:guestId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { guestId } = request.params as { token: string; guestId: string };

    const existing = await prisma.guest.findFirst({ where: { id: guestId, eventId: session.eventId } });
    if (!existing) return reply.status(404).send({ error: 'Convidado não encontrado' });

    await prisma.guest.delete({ where: { id: guestId } });
    return { success: true };
  });

  // Import guests from CSV
  app.post('/client/:token/guests/import', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { guests: guestList, forceStatus } = request.body as {
      guests: { name: string; email?: string; phone?: string; cpf?: string }[];
      forceStatus?: string;
    };

    if (!Array.isArray(guestList) || guestList.length === 0) {
      return reply.status(400).send({ error: 'Nenhum convidado fornecido' });
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const g of guestList) {
      if (!g.name?.trim()) { results.errors.push('Nome ausente'); continue; }

      const desiredStatus = (forceStatus || 'confirmed') as any;
      const conditions: any[] = [];
      if (g.email) conditions.push({ eventId: session.eventId, email: g.email });
      if (g.cpf) conditions.push({ eventId: session.eventId, cpf: g.cpf.replace(/\D/g, '') });

      if (conditions.length > 0) {
        const existing = await prisma.guest.findFirst({ where: { OR: conditions } });
        if (existing) {
          if (forceStatus && existing.status !== forceStatus) {
            await prisma.guest.update({ where: { id: existing.id }, data: { status: desiredStatus } });
            results.updated++;
          } else {
            results.skipped++;
          }
          continue;
        }
      }

      await prisma.guest.create({
        data: {
          eventId: session.eventId,
          name: g.name.trim(),
          email: g.email,
          phone: g.phone,
          cpf: g.cpf?.replace(/\D/g, ''),
          status: desiredStatus,
          rsvpToken: crypto.randomUUID(),
        },
      });
      results.created++;
    }

    return reply.status(201).send({ success: true, results });
  });

  // Get plan (read-only summary)
  app.get('/client/:token/plan', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const event = await prisma.event.findUnique({
      where: { id: session.eventId },
      include: {
        items: {
          include: {
            product: { include: { questions: { orderBy: { order: 'asc' } } } },
            answers: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        venues: {
          include: {
            venue: { include: { questions: { orderBy: { order: 'asc' } } } },
          },
        },
        venueAnswers: true,
      },
    });

    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });
    return { success: true, event };
  });

  // Get schedules (read-only)
  app.get('/client/:token/schedules', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const schedules = await prisma.eventSchedule.findMany({
      where: { eventId: session.eventId },
      include: {
        team: { select: { id: true, name: true } },
        file: { select: { id: true, name: true, mimeType: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    return { success: true, schedules };
  });

  // Get client approvals (plan items + schedule items confirmed as correct)
  app.get('/client/:token/approvals', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const approvals = await (prisma as any).clientApproval.findMany({
      where: { eventId: session.eventId },
      select: { itemType: true, itemId: true, approvedAt: true },
    });

    return { success: true, approvals };
  });

  // Toggle approval for a plan item or schedule activity
  app.post('/client/:token/approvals', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const { itemType, itemId } = request.body as { itemType: string; itemId: string };
    if (!itemType || !itemId) {
      return reply.status(400).send({ error: 'itemType e itemId são obrigatórios' });
    }

    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? request.headers['x-real-ip'] as string
      ?? request.ip
      ?? null;
    const userAgent = (request.headers['user-agent'] as string) ?? null;

    const existing = await (prisma as any).clientApproval.findUnique({
      where: { eventId_itemType_itemId: { eventId: session.eventId, itemType, itemId } },
    });

    if (existing) {
      const event = await prisma.event.findUnique({ where: { id: session.eventId }, select: { status: true } });
      if (event?.status === 'encerrado') {
        return reply.status(403).send({ error: 'Evento encerrado — não é possível desfazer uma confirmação.' });
      }
      await (prisma as any).clientApproval.delete({
        where: { eventId_itemType_itemId: { eventId: session.eventId, itemType, itemId } },
      });
      return { success: true, approved: false };
    } else {
      await (prisma as any).clientApproval.create({
        data: { eventId: session.eventId, itemType, itemId, ip, userAgent },
      });
      return { success: true, approved: true };
    }
  });

  // ── Fornecedores (EventProfessional) — client-facing ────────────────────────

  // List professionals/fornecedores linked to the event
  app.get('/client/:token/professionals', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const professionals = await (prisma as any).eventProfessional.findMany({
      where: { eventId: session.eventId },
      include: { person: { select: { id: true, name: true, whatsapp: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, professionals };
  });

  // Register a new fornecedor for the event
  app.post('/client/:token/professionals', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { name, whatsapp, role } = request.body as { name?: string; whatsapp?: string; role?: string };

    if (!name?.trim()) return reply.status(400).send({ error: 'Nome obrigatório' });
    if (!role?.trim()) return reply.status(400).send({ error: 'Função obrigatória' });

    const event = await prisma.event.findUnique({ where: { id: session.eventId }, select: { employerId: true } });
    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });

    const person = await (prisma as any).person.create({
      data: {
        name: name.trim(),
        whatsapp: whatsapp?.replace(/\D/g, '') || null,
        employerId: event.employerId,
      },
    });

    const professional = await (prisma as any).eventProfessional.create({
      data: { eventId: session.eventId, personId: person.id, role: role.trim() },
      include: { person: { select: { id: true, name: true, whatsapp: true } } },
    });

    return reply.status(201).send({ success: true, professional });
  });

  // ── Mídia (painel de LED) — o cliente pode subir suas próprias fotos/vídeos/áudios
  // pro evento, com um comentário livre (ex: "usar às 20h") pro operador saber quando
  // usar cada uma. Mesmo fluxo de presign/confirm de routes/event-media.ts, só que
  // escopado por session.eventId (JWT do cliente) em vez de requireAuth (staff). ──

  app.get('/client/:token/media', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const assets = await (prisma as any).eventMediaAsset.findMany({
      where: { eventId: session.eventId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    return { success: true, assets };
  });

  app.post('/client/:token/media/presign', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { filename, mimeType, sizeBytes } = request.body as { filename: string; mimeType: string; sizeBytes: number };

    const detected = mediaTypeFromMime(mimeType);
    if (!detected) return reply.status(400).send({ error: 'Formato não suportado — envie vídeo, imagem ou áudio.' });

    const maxSize = MAX_SIZE_BYTES[detected];
    if (sizeBytes > maxSize) {
      const label = detected === 'image' ? 'Imagens' : detected === 'video' ? 'Vídeos' : 'Áudios';
      return reply.status(400).send({ error: `${label} podem ter no máximo ${formatMb(maxSize)}.` });
    }

    const s3Key = `events/${session.eventId}/media/${Date.now()}-${sanitizeFilenameForKey(filename)}`;
    let uploadUrl: string;
    try {
      uploadUrl = await createUploadPresignedUrl(s3Key, mimeType);
    } catch (s3Error) {
      console.error('S3 presign error (client media):', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar URL de upload.' });
    }
    return { success: true, uploadUrl, s3Key, mediaType: detected };
  });

  app.post('/client/:token/media/confirm', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { name, mediaType, mimeType, sizeBytes, s3Key, durationSec, comment } = request.body as {
      name: string; mediaType: 'video' | 'image' | 'audio'; mimeType: string; sizeBytes: number;
      s3Key: string; durationSec?: number; comment?: string;
    };

    const maxSize = MAX_SIZE_BYTES[mediaType];
    if (sizeBytes > maxSize) return reply.status(400).send({ error: 'Arquivo excede o tamanho máximo.' });

    const maxOrder = await (prisma as any).eventMediaAsset.aggregate({
      where: { eventId: session.eventId },
      _max: { order: true },
    });

    const asset = await (prisma as any).eventMediaAsset.create({
      data: {
        eventId: session.eventId,
        name, mediaType, mimeType, sizeBytes, s3Key,
        durationSec: durationSec ?? null,
        comment: comment?.trim() || null,
        checksum: crypto.randomUUID(),
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return reply.status(201).send({ success: true, asset });
  });

  app.patch('/client/:token/media/:assetId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { assetId } = request.params as { assetId: string };
    const { name, comment } = request.body as { name?: string; comment?: string };

    const existing = await (prisma as any).eventMediaAsset.findFirst({ where: { id: assetId, eventId: session.eventId } });
    if (!existing) return reply.status(404).send({ error: 'Mídia não encontrada' });

    const asset = await (prisma as any).eventMediaAsset.update({
      where: { id: assetId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(comment !== undefined ? { comment: comment.trim() || null } : {}),
      },
    });
    return { success: true, asset };
  });

  app.delete('/client/:token/media/:assetId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { assetId } = request.params as { assetId: string };

    const existing = await (prisma as any).eventMediaAsset.findFirst({ where: { id: assetId, eventId: session.eventId } });
    if (!existing) return reply.status(404).send({ error: 'Mídia não encontrada' });

    await (prisma as any).eventMediaAsset.delete({ where: { id: assetId } });
    if (existing.s3Key) {
      try {
        await deleteS3Object(existing.s3Key);
      } catch (s3Error) {
        console.error('S3 delete error (client media, row already removed):', s3Error);
      }
    }
    return { success: true };
  });

  // ── Spotify — o cliente adiciona playlists (por link) pro(s) espaço(s) do evento,
  // com comentário. Não expõe a biblioteca de playlists da conta do espaço (só a
  // tela de staff faz isso) — o cliente só pode colar um link específico. ──

  app.get('/client/:token/spotify-playlists', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const eventVenues = await (prisma as any).eventVenue.findMany({
      where: { eventId: session.eventId },
      include: {
        venue: { select: { id: true, name: true } },
        spotifyPlaylists: { orderBy: { order: 'asc' } },
      },
    });

    return {
      success: true,
      venues: eventVenues.map((ev: any) => ({
        venueId: ev.venueId,
        venueName: ev.venue.name,
        connected: null, // resolved client-side isn't needed — POST already fails clearly if not connected
        playlists: ev.spotifyPlaylists,
      })),
    };
  });

  app.post('/client/:token/spotify-playlists', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { venueId, url, comment } = request.body as { venueId?: string; url?: string; comment?: string };
    if (!venueId || !url?.trim()) return reply.status(400).send({ error: 'Informe o espaço e o link da playlist.' });

    const eventVenue = await (prisma as any).eventVenue.findFirst({ where: { eventId: session.eventId, venueId } });
    if (!eventVenue) return reply.status(404).send({ error: 'Espaço não vinculado a este evento' });

    const parsedId = parsePlaylistId(url);
    if (!parsedId) return reply.status(400).send({ error: 'Link de playlist inválido — cole a URL ou URI do Spotify.' });

    const accessToken = await getValidAccessToken(venueId);
    if (!accessToken) return reply.status(404).send({ error: 'Este espaço ainda não conectou o Spotify' });

    let playlist;
    try {
      playlist = await getPlaylist(accessToken, parsedId);
    } catch (err: any) {
      return reply.status(502).send({ error: err.message || 'Falha ao buscar a playlist no Spotify' });
    }

    const count = await (prisma as any).eventVenueSpotifyPlaylist.count({ where: { eventVenueId: eventVenue.id } });
    const created = await (prisma as any).eventVenueSpotifyPlaylist.create({
      data: {
        eventVenueId: eventVenue.id,
        spotifyPlaylistId: playlist.id,
        spotifyPlaylistName: playlist.name,
        comment: comment?.trim() || null,
        order: count,
      },
    });

    return reply.status(201).send({ success: true, playlist: created });
  });

  app.patch('/client/:token/spotify-playlists/:playlistId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { playlistId } = request.params as { playlistId: string };
    const { comment } = request.body as { comment?: string };

    const existing = await (prisma as any).eventVenueSpotifyPlaylist.findFirst({
      where: { id: playlistId, eventVenue: { eventId: session.eventId } },
    });
    if (!existing) return reply.status(404).send({ error: 'Playlist não encontrada' });

    await (prisma as any).eventVenueSpotifyPlaylist.update({
      where: { id: playlistId },
      data: { comment: comment?.trim() || null },
    });
    return { success: true };
  });

  app.delete('/client/:token/spotify-playlists/:playlistId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { playlistId } = request.params as { playlistId: string };

    const existing = await (prisma as any).eventVenueSpotifyPlaylist.findFirst({
      where: { id: playlistId, eventVenue: { eventId: session.eventId } },
    });
    if (!existing) return reply.status(404).send({ error: 'Playlist não encontrada' });

    await (prisma as any).eventVenueSpotifyPlaylist.delete({ where: { id: playlistId } });
    return { success: true };
  });
}
