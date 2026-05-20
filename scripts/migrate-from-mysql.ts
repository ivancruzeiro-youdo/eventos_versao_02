/**
 * Script de migração: MySQL (Sistema Antigo) → PostgreSQL (YOUDO v2)
 * 
 * Este script migra dados do sistema legado PHP/MySQL para o novo sistema Nest.js/PostgreSQL
 * 
 * Uso:
 *   export MYSQL_URL="mysql://user:pass@localhost:3306/youdo_legacy"
 *   export DATABASE_URL="postgresql://youdo:youdo123@localhost:5432/youdo_v2"
 *   npx tsx scripts/migrate-from-mysql.ts
 */

import { createConnection as createMySQLConnection } from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import { format, parse } from 'date-fns';

const BATCH_SIZE = 100;

// Connect to MySQL (legacy)
async function connectMySQL() {
  const mysqlUrl = process.env.MYSQL_URL || 'mysql://root:root@localhost:3306/youdo';
  return createMySQLConnection(mysqlUrl);
}

// Connect to PostgreSQL (new)
const prisma = new PrismaClient();

// Migration state
interface MigrationState {
  employerId: string;
  userIdMap: Map<number, string>;
  eventIdMap: Map<number, string>;
  freelancerIdMap: Map<number, string>;
  venueIdMap: Map<number, string>;
  guestIdMap: Map<number, string>;
}

async function migrateEmployers(mysql: any, state: MigrationState): Promise<void> {
  console.log('🏢 Migrando employers...');
  
  const [rows] = await mysql.execute('SELECT * FROM employers WHERE ativo = 1');
  
  for (const row of rows) {
    const employer = await prisma.employer.create({
      data: {
        name: row.nome || row.razao_social,
        cnpj: row.cnpj,
        contactEmail: row.email_contato,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
    state.employerId = employer.id;
    console.log(`  ✓ Employer: ${employer.name}`);
  }
}

async function migrateUsers(mysql: any, state: MigrationState): Promise<void> {
  console.log('👤 Migrando usuários...');
  
  const [rows] = await mysql.execute(
    'SELECT * FROM users WHERE ativo = 1 AND employer_id IS NOT NULL'
  );
  
  for (const row of rows) {
    const user = await prisma.user.create({
      data: {
        email: row.email,
        name: row.nome,
        role: row.role === 'admin' ? 'admin' : row.role === 'owner' ? 'event_owner' : 'operator',
        employerId: state.employerId,
        ssoId: row.sso_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
    state.userIdMap.set(row.id, user.id);
    console.log(`  ✓ User: ${user.name}`);
  }
}

async function migrateFreelancers(mysql: any, state: MigrationState): Promise<void> {
  console.log('💼 Migrando freelancers...');
  
  const [rows] = await mysql.execute(
    'SELECT * FROM freelancers WHERE ativo = 1'
  );
  
  for (const row of rows) {
    const freelancer = await prisma.freelancer.create({
      data: {
        name: row.nome,
        email: row.email,
        cpf: row.cpf,
        phone: row.telefone,
        whatsapp: row.whatsapp,
        instagram: row.instagram,
        pixKey: row.pix_key,
        bankInfo: row.bank_info ? JSON.stringify(row.bank_info) : null,
        specialties: row.especialidades ? row.especialidades.split(',') : [],
        shirtSize: row.tamanho_camisa,
        status: row.status === 'ativo' ? 'active' : 'suspended',
        score: row.score || 100,
        notes: row.observacoes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
    state.freelancerIdMap.set(row.id, freelancer.id);
    console.log(`  ✓ Freelancer: ${freelancer.name}`);
  }
}

async function migrateVenues(mysql: any, state: MigrationState): Promise<void> {
  console.log('📍 Migrando venues...');
  
  const [rows] = await mysql.execute(
    'SELECT * FROM venues WHERE ativo = 1'
  );
  
  for (const row of rows) {
    const venue = await prisma.venue.create({
      data: {
        name: row.nome,
        address: row.endereco,
        city: row.cidade,
        capacity: row.capacidade,
        contactName: row.nome_contato,
        contactPhone: row.telefone_contato,
        employerId: state.employerId,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
    state.venueIdMap.set(row.id, venue.id);
    console.log(`  ✓ Venue: ${venue.name}`);
  }
}

async function migrateEvents(mysql: any, state: MigrationState): Promise<void> {
  console.log('📅 Migrando eventos...');
  
  const [rows] = await mysql.execute(
    'SELECT * FROM events ORDER BY id DESC LIMIT 1000'
  );
  
  for (const row of rows) {
    try {
      const statusMap: Record<string, string> = {
        'rascunho': 'draft',
        'confirmado': 'confirmed',
        'em_andamento': 'in_progress',
        'concluido': 'completed',
        'cancelado': 'cancelled',
      };

      const event = await prisma.event.create({
        data: {
          name: row.nome,
          clientName: row.nome_cliente,
          employerId: state.employerId,
          createdByUserId: state.userIdMap.get(row.created_by) || state.userIdMap.values().next().value,
          status: statusMap[row.status] || 'draft',
          setupAt: row.data_montagem ? new Date(row.data_montagem) : null,
          startAt: row.data_inicio ? new Date(row.data_inicio) : null,
          teardownAt: row.data_fim ? new Date(row.data_fim) : null,
          notes: row.observacoes,
          budgetTotalCents: row.orcamento_total ? Math.round(row.orcamento_total * 100) : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          venues: row.venue_id ? {
            create: {
              venueId: state.venueIdMap.get(row.venue_id) || state.venueIdMap.values().next().value,
            }
          } : undefined,
        },
      });
      state.eventIdMap.set(row.id, event.id);
      console.log(`  ✓ Event: ${event.name}`);
    } catch (err) {
      console.error(`  ✗ Failed to migrate event ${row.id}:`, err);
    }
  }
}

async function migrateGuests(mysql: any, state: MigrationState): Promise<void> {
  console.log('👥 Migrando convidados...');
  
  const [rows] = await mysql.execute(
    'SELECT * FROM convidados ORDER BY id DESC LIMIT 5000'
  );
  
  for (const row of rows) {
    try {
      const eventId = state.eventIdMap.get(row.evento_id);
      if (!eventId) continue;

      const statusMap: Record<string, string> = {
        'pendente': 'pending',
        'confirmado': 'confirmed',
        'recusado': 'declined',
        'lista_espera': 'waitlisted',
        'checkin': 'checked_in',
      };

      const guest = await prisma.guest.create({
        data: {
          eventId,
          name: row.nome,
          phone: row.telefone,
          email: row.email,
          cpf: row.cpf,
          isMinor: row.menor_idade === 1,
          responsibleName: row.nome_responsavel,
          status: statusMap[row.status] || 'pending',
          checkedInAt: row.checkin_em ? new Date(row.checkin_em) : null,
          checkedInByUserId: row.checkin_por ? state.userIdMap.get(row.checkin_por) : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
      state.guestIdMap.set(row.id, guest.id);
    } catch (err) {
      console.error(`  ✗ Failed to migrate guest ${row.id}:`, err);
    }
  }
  console.log(`  ✓ Migrated ${state.guestIdMap.size} guests`);
}

async function migrateServices(mysql: any, state: MigrationState): Promise<void> {
  console.log('🔧 Migrando serviços...');
  
  // Create default services if they don't exist
  const defaultServices = [
    { name: 'Catering/Buffet', category: 'Alimentação' },
    { name: 'Decoração', category: 'Decoração' },
    { name: 'Som e Iluminação', category: 'Técnica' },
    { name: 'Fotografia', category: 'Entretenimento' },
    { name: 'Segurança', category: 'Infraestrutura' },
  ];

  for (const svc of defaultServices) {
    await prisma.service.upsert({
      where: { id: svc.name.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: {
        id: svc.name.toLowerCase().replace(/\s+/g, '-'),
        name: svc.name,
        category: svc.category,
      },
    });
  }
  console.log('  ✓ Default services created');
}

async function runMigration() {
  console.log('🚀 Iniciando migração MySQL → PostgreSQL\n');
  
  const mysql = await connectMySQL();
  const state: MigrationState = {
    employerId: '',
    userIdMap: new Map(),
    eventIdMap: new Map(),
    freelancerIdMap: new Map(),
    venueIdMap: new Map(),
    guestIdMap: new Map(),
  };

  try {
    // Clear existing data (optional - be careful!)
    if (process.env.CLEAR_DATA === 'true') {
      console.log('⚠️  Limpando dados existentes...');
      await prisma.auditLog.deleteMany();
      await prisma.eventNPS.deleteMany();
      await prisma.guest.deleteMany();
      await prisma.job.deleteMany();
      await prisma.jobApplication.deleteMany();
      await prisma.eventService.deleteMany();
      await prisma.event.deleteMany();
      await prisma.freelancer.deleteMany();
      await prisma.venue.deleteMany();
      await prisma.user.deleteMany();
      await prisma.employer.deleteMany();
    }

    // Run migrations in order
    await migrateEmployers(mysql, state);
    await migrateUsers(mysql, state);
    await migrateFreelancers(mysql, state);
    await migrateVenues(mysql, state);
    await migrateEvents(mysql, state);
    await migrateGuests(mysql, state);
    await migrateServices(mysql, state);

    console.log('\n✅ Migração concluída com sucesso!');
    console.log(`
Resumo:
- Employers: 1
- Users: ${state.userIdMap.size}
- Freelancers: ${state.freelancerIdMap.size}
- Venues: ${state.venueIdMap.size}
- Events: ${state.eventIdMap.size}
- Guests: ${state.guestIdMap.size}
    `);

  } catch (err) {
    console.error('\n❌ Erro na migração:', err);
    process.exit(1);
  } finally {
    await mysql.end();
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  runMigration();
}

export { runMigration };
