import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create an employer
  const employer = await prisma.employer.create({
    data: {
      name: 'YOUDO Brasil',
      cnpj: '12.345.678/0001-90',
      contactEmail: 'contato@youdobrasil.com.br',
    },
  });
  console.log('✅ Created employer:', employer.name);

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@youdo.com',
      name: 'Administrador',
      role: 'admin',
      employerId: employer.id,
    },
  });
  console.log('✅ Created admin user:', adminUser.email);

  // Create event owner
  const eventOwner = await prisma.user.create({
    data: {
      email: 'owner@youdo.com',
      name: 'Gerente de Eventos',
      role: 'event_owner',
      employerId: employer.id,
    },
  });
  console.log('✅ Created event owner:', eventOwner.email);

  // Create operator
  const operator = await prisma.user.create({
    data: {
      email: 'operator@youdo.com',
      name: 'Operador',
      role: 'operator',
      employerId: employer.id,
    },
  });
  console.log('✅ Created operator:', operator.email);

  // Create freelancers
  const freelancer1 = await prisma.freelancer.create({
    data: {
      name: 'João Silva',
      email: 'joao@freelancer.com',
      cpf: '123.456.789-00',
      phone: '+55 11 99999-1111',
      status: 'active',
    },
  });
  console.log('✅ Created freelancer:', freelancer1.name);

  const freelancer2 = await prisma.freelancer.create({
    data: {
      name: 'Maria Santos',
      email: 'maria@freelancer.com',
      cpf: '987.654.321-00',
      phone: '+55 11 99999-2222',
      status: 'active',
    },
  });
  console.log('✅ Created freelancer:', freelancer2.name);

  // Create venues
  const venue1 = await prisma.venue.create({
    data: {
      name: 'Espaço YOUDO Premium',
      address: 'Rua dos Eventos, 123',
      city: 'São Paulo',
      capacity: 500,
      contactName: 'Gerente de Locação',
      contactPhone: '+55 11 3333-4444',
      employerId: employer.id,
    },
  });
  console.log('✅ Created venue:', venue1.name);

  const venue2 = await prisma.venue.create({
    data: {
      name: 'Centro de Convenções Sul',
      address: 'Av. das Convenções, 456',
      city: 'São Paulo',
      capacity: 1000,
      contactName: 'Coordenador',
      contactPhone: '+55 11 5555-6666',
      employerId: employer.id,
    },
  });
  console.log('✅ Created venue:', venue2.name);

  // Create a sample event
  const event = await prisma.event.create({
    data: {
      name: 'Conferência Anual 2026',
      clientName: 'Empresa Tech Brasil',
      employerId: employer.id,
      status: 'confirmed',
      setupAt: new Date('2026-06-15T08:00:00'),
      startAt: new Date('2026-06-15T09:00:00'),
      teardownAt: new Date('2026-06-15T18:00:00'),
      notes: 'Evento principal do ano com palestras internacionais',
      venues: {
        create: [
          { venueId: venue1.id },
        ],
      },
    },
  });
  console.log('✅ Created event:', event.name);

  // Create sample guests
  const guests = await prisma.guest.createMany({
    data: [
      {
        eventId: event.id,
        name: 'Carlos Oliveira',
        email: 'carlos@example.com',
        cpf: '111.222.333-44',
        phone: '+55 11 98888-1111',
        status: 'confirmed',
      },
      {
        eventId: event.id,
        name: 'Ana Paula',
        email: 'ana@example.com',
        cpf: '555.666.777-88',
        phone: '+55 11 98888-2222',
        status: 'pending',
      },
      {
        eventId: event.id,
        name: 'Pedro Costa',
        email: 'pedro@example.com',
        cpf: '999.000.111-22',
        phone: '+55 11 98888-3333',
        status: 'confirmed',
      },
    ],
  });
  console.log('✅ Created', guests.count, 'guests');

  // Create services
  const service1 = await prisma.service.create({
    data: {
      name: 'Catering Premium',
      category: 'Alimentação',
      description: 'Buffet completo com coquetel',
    },
  });
  console.log('✅ Created service:', service1.name);

  const service2 = await prisma.service.create({
    data: {
      name: 'Som e Iluminação',
      category: 'Técnica',
      description: 'Equipamento profissional completo',
    },
  });
  console.log('✅ Created service:', service2.name);

  // Link services to event
  await prisma.eventService.create({
    data: {
      eventId: event.id,
      serviceId: service1.id,
      notes: 'Incluir opções vegetarianas',
    },
  });

  console.log('\n✨ Seed completed successfully!');
  console.log('\n📧 Login credentials:');
  console.log('   Admin: admin@youdo.com');
  console.log('   Owner: owner@youdo.com');
  console.log('   Operator: operator@youdo.com');
  console.log('\n👤 Freelancer credentials:');
  console.log('   João: joao@freelancer.com / 123.456.789-00');
  console.log('   Maria: maria@freelancer.com / 987.654.321-00');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
