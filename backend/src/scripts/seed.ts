import { PrismaClient, TenderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding mock tenders...');
  
  const mockTenders = [
    {
      tenderId: 'GEM/2026/B/1234567',
      portal: 'GeM',
      title: 'Supply of Heavy Duty Laptops',
      organisation: 'Ministry of Education',
      department: 'Department of Higher Education',
      location: 'New Delhi',
      state: 'Delhi',
      category: 'IT Equipment',
      description: 'Supply and installation of 50 heavy duty laptops for research labs.',
      estimatedValue: 7500000.00,
      emdAmount: 150000.00,
      tenderFee: 0,
      publishedDate: new Date(),
      closingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      openingDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      keywordMatched: 'Laptops',
      tenderStatus: TenderStatus.LIVE,
      tenderURL: 'https://gem.gov.in/tenders/mock1',
    },
    {
      tenderId: 'GEM/2026/B/7654321',
      portal: 'GeM',
      title: 'CCTV Camera Installation Service',
      organisation: 'Ministry of Home Affairs',
      department: 'Central Reserve Police Force',
      location: 'Mumbai',
      state: 'Maharashtra',
      category: 'Security Services',
      description: 'Comprehensive annual maintenance and installation of CCTV cameras.',
      estimatedValue: 2500000.00,
      emdAmount: 50000.00,
      tenderFee: 500,
      publishedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      closingDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      openingDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      keywordMatched: 'CCTV',
      tenderStatus: TenderStatus.LIVE,
      tenderURL: 'https://gem.gov.in/tenders/mock2',
    }
  ];

  for (const t of mockTenders) {
    await prisma.tender.upsert({
      where: { tenderId: t.tenderId },
      update: t,
      create: t,
    });
  }

  console.log('Successfully added mock tenders to database!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
