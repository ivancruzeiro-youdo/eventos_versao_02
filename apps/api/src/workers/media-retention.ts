import { prisma } from '../server.js';
import { deleteS3Object } from '../lib/s3.js';

// 4 dias após o encerramento do evento, os arquivos de mídia do painel de LED são
// removidos do S3 — mas o registro (nome, tipo, tamanho) fica na tabela, marcado com
// deletedAt, como prova de que existiu e foi excluído pela retenção.
const RETENTION_DAYS = 4;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // a cada 6h — a janela é de dias, não precisa ser mais frequente

async function purgeExpiredMedia(log: (msg: string) => void) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);

  const expiredEvents = await (prisma as any).event.findMany({
    where: {
      status: 'encerrado',
      closure: { createdAt: { lte: cutoff } },
      mediaAssets: { some: { deletedAt: null } },
    },
    select: {
      id: true, name: true,
      mediaAssets: { where: { deletedAt: null }, select: { id: true, name: true, s3Key: true } },
    },
  });

  if (expiredEvents.length === 0) return;

  let purged = 0;
  let errors = 0;

  for (const event of expiredEvents) {
    for (const asset of event.mediaAssets) {
      try {
        if (asset.s3Key) {
          try {
            await deleteS3Object(asset.s3Key);
          } catch (s3Error: any) {
            log(`Erro ao apagar do S3 (mantendo tentativa de marcar excluído): ${event.name} — ${asset.name}: ${s3Error.message}`);
          }
        }
        await (prisma as any).eventMediaAsset.update({
          where: { id: asset.id },
          data: { deletedAt: new Date(), s3Key: null },
        });
        purged++;
        log(`Excluído (retenção ${RETENTION_DAYS} dias): ${event.name} — ${asset.name}`);
      } catch (err: any) {
        errors++;
        log(`Erro ao processar mídia ${asset.id} (${event.name}): ${err.message}`);
      }
    }
  }

  log(`media-retention: ${purged} mídia(s) excluída(s), ${errors} erro(s), ${expiredEvents.length} evento(s) processados.`);
}

export function startMediaRetentionWorker(log: (msg: string) => void = console.log) {
  const run = () => purgeExpiredMedia(log).catch(err => log(`media-retention: ${err.message}`));
  setInterval(run, CHECK_INTERVAL_MS);
  setTimeout(run, 30_000); // primeira checagem 30s após o boot
  log(`media-retention iniciado (retenção de ${RETENTION_DAYS} dias após encerramento)`);
}
