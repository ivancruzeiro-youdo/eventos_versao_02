const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const eventId = '5eaa87f3-a5b4-4195-87cd-59566069c065';

  // Criar template de checklist
  const template = await prisma.checklistTemplate.create({
    data: {
      title: 'Abertura de bar',
      employerId: null, // Template global
    },
  });

  console.log('Template criado:', template.id);

  // Criar itens do checklist
  const items = [
    'Conferir se todos os insumos necessários para o eventos estão refrigerados e de fácil acesso no bar',
    'Conferir se será necessário fazer mais xarope artesanal para os drinks',
    'Conferir se tem todos os copos para servir todos os drinks do Cardápio para 65 pessoas',
    'Montar taças de acrilico trazidas pela cliente e deixar nas prateleiras para serem usadas no momento do brinde',
    'Fabricar o quentão com as especiarias e verificar a logística para o serviço, com garrafa térmica ou panela, considerando que a cozinha estará com todas as bocas do fogão em uso durante o serviço de comida',
    'Separar copos de papelão para o serviço do quentão que será até as 21h',
    'Conferir insumos trazidos pela cliente e orientação do serviço desses insumos',
    'Instalar barril de chopp na chopeira, testar e provar se o chopp está bom',
    'Conferir se todos os utensílios para o evento estão no bar',
    'Polir copos e taças',
    'Fazer suco de limão e colocar nas bisnagas',
    'Cortar limão em 4 partes para as caipirinhas',
    'Cortar laranja bahia em rodelas para utilizar no Aperol Spritz',
    'Fazer espuma de gengibre e deixar pronta em pelo menos 3 sifões para uso durante evento',
    'Porcionar morangos congelados para uso nas caipirinhas',
    'Separar para o serviço xarope de gengibre e xarope e frutas vermelhas em bisnagas ou garrafas individuais',
    'Ter impressa as fichas técnicas dos drinks',
    'Dispor canudos no balcão caso os convidados queiram utilizar nos drinks',
    'Alinhar com as gestoras e os bartender o serviço do dia',
    'Ter uma caixa separada em caso de quebra de copo',
  ];

  for (let i = 0; i < items.length; i++) {
    await prisma.checklistTemplateItem.create({
      data: {
        templateId: template.id,
        text: items[i],
        order: i,
      },
    });
  }

  console.log('Itens criados:', items.length);

  // Verificar se já existe checklist para o evento
  let checklist = await prisma.eventChecklist.findUnique({
    where: { eventId: eventId },
  });

  if (checklist) {
    // Se existe, deletar os itens antigos e atualizar o template
    await prisma.checklistItem.deleteMany({
      where: { checklistId: checklist.id },
    });
    
    checklist = await prisma.eventChecklist.update({
      where: { id: checklist.id },
      data: {
        title: template.title,
        templateId: template.id,
      },
    });
    console.log('Checklist atualizado:', checklist.id);
  } else {
    // Se não existe, criar novo
    checklist = await prisma.eventChecklist.create({
      data: {
        eventId: eventId,
        title: template.title,
        templateId: template.id,
      },
    });
    console.log('Checklist aplicado ao evento:', checklist.id);
  }

  // Criar itens do checklist do evento
  const templateItems = await prisma.checklistTemplateItem.findMany({
    where: { templateId: template.id },
    orderBy: { order: 'asc' },
  });

  for (const item of templateItems) {
    await prisma.checklistItem.create({
      data: {
        checklist: {
          connect: { id: checklist.id },
        },
        text: item.text,
        order: item.order,
        done: false,
      },
    });
  }

  console.log('Itens do checklist criados:', templateItems.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
