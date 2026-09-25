import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

export type CreateAccountInput = {
  name: string;
  type: "CHECKING" | "SALARY" | "SAVINGS" | "FD";
  balance: number;
};

export type UpdateAccountInput = {
  name?: string;
  type?: "CHECKING" | "SALARY" | "SAVINGS" | "FD";
};

export async function createAccount(
  userId: string,
  data: CreateAccountInput
) {
  return prisma.account.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      balance: new Prisma.Decimal(data.balance),
    },
  });
}

export async function getAccounts(userId: string) {
  return prisma.account.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getAccount(
  userId: string,
  id: string
) {
  return prisma.account.findFirst({
    where: {
      id,
      userId,
    },
  });
}

export async function updateAccount(
  userId: string,
  id: string,
  data: UpdateAccountInput
) {
  const existing = await prisma.account.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!existing) {
    return null;
  }

  return prisma.account.update({
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
    },
  });
}

export async function deleteAccount(
  userId: string,
  id: string
) {
  const existing = await prisma.account.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      _count: {
        select: {
          transactions: true,
        },
      },
    },
  });

  if (!existing) {
    return null;
  }

  if (existing._count.transactions > 0) {
    throw new Error(
      "ACCOUNT_HAS_TRANSACTIONS"
    );
  }

  return prisma.account.delete({
    where: {
      id,
    },
  });
}