import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

export type CreateIncomeSourceInput = {
  name: string
  type: 'SALARY' | 'FREELANCE' | 'RENTAL' | 'OTHER'
  amount: number
  frequency: 'WEEKLY' | 'MONTHLY' | 'ANNUAL'
  effectiveFrom: string
  effectiveUntil?: string
  isActive?: boolean
}

export type UpdateIncomeSourceInput = Partial<CreateIncomeSourceInput>

export function normalizeToMonthly(
  amount: number,
  frequency: 'WEEKLY' | 'MONTHLY' | 'ANNUAL'
): number {
  switch (frequency) {
    case 'WEEKLY':
      return amount * 52 / 12

    case 'MONTHLY':
      return amount

    case 'ANNUAL':
      return amount / 12
  }
}

export async function createIncomeSource(
  userId: string,
  data: CreateIncomeSourceInput
) {
  return prisma.incomeSource.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      amount: new Prisma.Decimal(data.amount),
      frequency: data.frequency,
      effectiveFrom: new Date(data.effectiveFrom),
      effectiveUntil: data.effectiveUntil
        ? new Date(data.effectiveUntil)
        : null,
      isActive: data.isActive ?? true,
    },
  })
}

export async function getIncomeSources(userId: string) {
  return prisma.incomeSource.findMany({
    where: {
      userId,
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  })
}

export async function getIncomeSource(
  userId: string,
  id: string
) {
  return prisma.incomeSource.findFirst({
    where: {
      id,
      userId,
    },
  })
}

export async function updateIncomeSource(
  userId: string,
  id: string,
  data: UpdateIncomeSourceInput
) {
  const existing = await prisma.incomeSource.findFirst({
    where: {
      id,
      userId,
    },
  })

  if (!existing) {
    return null
  }

  return prisma.incomeSource.update({
    where: {
      id,
    },
    data: {
      ...(data.name !== undefined && {
        name: data.name,
      }),

      ...(data.type !== undefined && {
        type: data.type,
      }),

      ...(data.amount !== undefined && {
        amount: new Prisma.Decimal(data.amount),
      }),

      ...(data.frequency !== undefined && {
        frequency: data.frequency,
      }),

      ...(data.effectiveFrom !== undefined && {
        effectiveFrom: new Date(data.effectiveFrom),
      }),

      ...(data.effectiveUntil !== undefined && {
        effectiveUntil: data.effectiveUntil
          ? new Date(data.effectiveUntil)
          : null,
      }),

      ...(data.isActive !== undefined && {
        isActive: data.isActive,
      }),
    },
  })
}

export async function deleteIncomeSource(
  userId: string,
  id: string
) {
  const existing = await prisma.incomeSource.findFirst({
    where: {
      id,
      userId,
    },
  })

  if (!existing) {
    return null
  }

  return prisma.incomeSource.delete({
    where: {
      id,
    },
  })
}