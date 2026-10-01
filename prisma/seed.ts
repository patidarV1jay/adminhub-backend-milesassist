import {
  PrismaClient,
  UserRole,
  UserStatus,
  TransactionType,
  TransactionStatus,
  TransactionStage,
  BookingStatus,
  PaymentStatus,
  LocationType,
} from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = [
    {
      name: 'Sarah Jenkins',
      email: (process.env.SEED_ADMIN_EMAIL ?? 'sarah.jenkins@adminhub.com').toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
      role: UserRole.SUPER_ADMIN,
      twoFactorEnabled: true,
    },
    {
      name: 'Michael Admin',
      email: 'michael.admin@adminhub.com',
      password: 'Admin@12345',
      role: UserRole.ADMIN,
      twoFactorEnabled: false,
    },
    {
      name: 'John Editor',
      email: 'john.editor@adminhub.com',
      password: 'Editor@12345',
      role: UserRole.EDITOR,
      twoFactorEnabled: false,
    },
    {
      name: 'Emily Viewer',
      email: 'emily.viewer@adminhub.com',
      password: 'Viewer@12345',
      role: UserRole.VIEWER,
      twoFactorEnabled: false,
    },
  ];

  const createdUsers: Record<string, { id: string }> = {};

  for (const user of users) {
    const passwordHash = await hash(user.password, 12);

    const createdUser = await prisma.user.upsert({
      where: {
        email: user.email,
      },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        status: UserStatus.ACTIVE,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      select: {
        id: true,
      },
    });

    createdUsers[user.email] = createdUser;

    console.log(`Seeded ${user.role}: ${user.email}`);
  }

  const consultation = await prisma.service.upsert({
    where: {
      name: 'Business Consultation',
    },
    update: {},
    create: {
      name: 'Business Consultation',
      price: 150,
      defaultDurationMinutes: 60,
      isActive: true,
    },
  });

  const development = await prisma.service.upsert({
    where: {
      name: 'Software Development',
    },
    update: {},
    create: {
      name: 'Software Development',
      price: 500,
      defaultDurationMinutes: 120,
      isActive: true,
    },
  });

  const support = await prisma.service.upsert({
    where: {
      name: 'Technical Support',
    },
    update: {},
    create: {
      name: 'Technical Support',
      price: 75,
      defaultDurationMinutes: 30,
      isActive: true,
    },
  });

  const admin = createdUsers['michael.admin@adminhub.com'];

  const booking1 = await prisma.booking.create({
    data: {
      customerId: admin.id,
      serviceId: consultation.id,
      scheduledAt: new Date('2026-10-05T10:00:00Z'),
      durationMinutes: 60,
      timezone: 'EST',
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      locationType: LocationType.VIRTUAL,
      meetingLink: 'https://meet.example.com/business-consultation',
      amount: 150,
      invoiceNumber: 'INV-10001',
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      customerId: admin.id,
      serviceId: development.id,
      scheduledAt: new Date('2026-10-07T14:00:00Z'),
      durationMinutes: 120,
      timezone: 'EST',
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PENDING,
      locationType: LocationType.VIRTUAL,
      meetingLink: 'https://meet.example.com/software-development',
      amount: 500,
      invoiceNumber: 'INV-10002',
    },
  });

  const booking3 = await prisma.booking.create({
    data: {
      customerId: admin.id,
      serviceId: support.id,
      scheduledAt: new Date('2026-10-08T09:30:00Z'),
      durationMinutes: 30,
      timezone: 'EST',
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      locationType: LocationType.IN_PERSON,
      amount: 75,
      invoiceNumber: 'INV-10003',
    },
  });

  const transactions = [
    {
      userId: admin.id,
      bookingId: booking1.id,
      gatewayReference: 'REF-98342718',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.COMPLETED,
      amount: 150,
      gatewayFee: 4.5,
      subtotal: 150,
      currency: 'USD',
      paymentMethod: 'Credit Card',
      cardBrand: 'Visa',
      cardLast4: '4242',
      description: 'Business Consultation Payment',
    },
    {
      userId: admin.id,
      bookingId: booking2.id,
      gatewayReference: 'REF-98342719',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
      amount: 500,
      gatewayFee: 15,
      subtotal: 500,
      currency: 'USD',
      paymentMethod: 'Credit Card',
      cardBrand: 'Mastercard',
      cardLast4: '5555',
      description: 'Software Development Payment',
    },
    {
      userId: admin.id,
      bookingId: booking3.id,
      gatewayReference: 'REF-98342720',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.COMPLETED,
      amount: 75,
      gatewayFee: 2.25,
      subtotal: 75,
      currency: 'USD',
      paymentMethod: 'PayPal',
      cardBrand: null,
      cardLast4: null,
      description: 'Technical Support Payment',
    },
    {
      userId: admin.id,
      bookingId: booking1.id,
      gatewayReference: 'REF-98342721',
      type: TransactionType.REFUND,
      status: TransactionStatus.REFUNDED,
      amount: -50,
      gatewayFee: 0,
      subtotal: -50,
      currency: 'USD',
      paymentMethod: 'Credit Card',
      cardBrand: 'Visa',
      cardLast4: '4242',
      description: 'Partial Refund',
    },
    {
      userId: admin.id,
      bookingId: null,
      gatewayReference: 'REF-98342722',
      type: TransactionType.TRANSFER,
      status: TransactionStatus.COMPLETED,
      amount: 1000,
      gatewayFee: 5,
      subtotal: 1005,
      currency: 'USD',
      paymentMethod: 'Bank Transfer',
      cardBrand: null,
      cardLast4: null,
      description: 'Account Transfer',
    },
    {
      userId: admin.id,
      bookingId: null,
      gatewayReference: 'REF-98342723',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.FAILED,
      amount: 250,
      gatewayFee: 0,
      subtotal: 250,
      currency: 'USD',
      paymentMethod: 'Credit Card',
      cardBrand: 'Visa',
      cardLast4: '1111',
      description: 'Failed Payment Attempt',
    },
  ];

  for (const transaction of transactions) {
    const createdTransaction = await prisma.transaction.create({
      data: transaction,
    });

    await prisma.transactionEvent.createMany({
      data: [
        {
          transactionId: createdTransaction.id,
          stage: TransactionStage.INITIATED,
          title: 'Payment Initiated',
          description: 'Transaction was initiated.',
        },
        {
          transactionId: createdTransaction.id,
          stage:
            transaction.status === TransactionStatus.FAILED
              ? TransactionStage.FAILED
              : transaction.status === TransactionStatus.REFUNDED
                ? TransactionStage.REFUNDED
                : transaction.status === TransactionStatus.COMPLETED
                  ? TransactionStage.COMPLETED
                  : TransactionStage.AUTHORIZED,
          title:
            transaction.status === TransactionStatus.FAILED
              ? 'Payment Failed'
              : transaction.status === TransactionStatus.REFUNDED
                ? 'Payment Refunded'
                : transaction.status === TransactionStatus.COMPLETED
                  ? 'Completed & Disbursed'
                  : 'Payment Authorized',
          description: 'Transaction status updated.',
        },
      ],
    });
  }

  console.log('Seeded services, bookings, transactions and transaction events.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  