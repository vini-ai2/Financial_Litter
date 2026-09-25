import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

export type CreateTransactionInput = {
  accountId: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  category: string;
  date: string;
};

export type UpdateTransactionInput = {
  amount?: number;
  type?: "INCOME" | "EXPENSE";
  category?: string;
  date?: string;
};

function getBalanceDelta(
  amount: Prisma.Decimal | number,
  type: "INCOME" | "EXPENSE"
): Prisma.Decimal {
  const decimalAmount =
    amount instanceof Prisma.Decimal
      ? amount
      : new Prisma.Decimal(amount);

  return type === "INCOME"
    ? decimalAmount
    : decimalAmount.negated();
}

export async function createTransaction(
  userId: string,
  data: CreateTransactionInput
) {
  const amount = new Prisma.Decimal(data.amount);

  return prisma.$transaction(async (tx) => {
    // Verify that this account belongs to the user.
    const account = await tx.account.findFirst({
      where: {
        id: data.accountId,
        userId,
      },
    });

    if (!account) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const balanceDelta = getBalanceDelta(
      amount,
      data.type
    );

    const transaction =
      await tx.transaction.create({
        data: {
          accountId: data.accountId,
          amount,
          type: data.type,
          category: data.category,
          date: new Date(data.date),
        },
      });

    await tx.account.update({
      where: {
        id: account.id,
      },
      data: {
        balance: {
          increment: balanceDelta,
        },
      },
    });

    return transaction;
  });
}

export async function getTransactions(
  userId: string,
  filters?: {
    month?: string;
    type?: "INCOME" | "EXPENSE";
    category?: string;
  }
) {
  let dateFilter:
    | { gte: Date; lt: Date }
    | undefined;

  if (filters?.month) {
    const match = /^(\d{4})-(\d{2})$/.exec(
      filters.month
    );

    if (!match) {
      throw new Error("INVALID_MONTH");
    }

    const year = Number(match[1]);
    const month = Number(match[2]);

    if (month < 1 || month > 12) {
      throw new Error("INVALID_MONTH");
    }

    dateFilter = {
      gte: new Date(
        Date.UTC(year, month - 1, 1)
      ),
      lt: new Date(
        Date.UTC(year, month, 1)
      ),
    };
  }

  return prisma.transaction.findMany({
    where: {
      account: {
        userId,
      },

      ...(filters?.type && {
        type: filters.type,
      }),

      ...(filters?.category && {
        category: filters.category,
      }),

      ...(dateFilter && {
        date: dateFilter,
      }),
    },

    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },

    orderBy: {
      date: "desc",
    },
  });
}

export async function getTransaction(
  userId: string,
  id: string
) {
  return prisma.transaction.findFirst({
    where: {
      id,
      account: {
        userId,
      },
    },
    include: {
      account: true,
    },
  });
}

export async function updateTransaction(
  userId: string,
  id: string,
  data: UpdateTransactionInput
) {
  return prisma.$transaction(async (tx) => {
    const existing =
      await tx.transaction.findFirst({
        where: {
          id,
          account: {
            userId,
          },
        },
      });

    if (!existing) {
      return null;
    }

    const oldDelta = getBalanceDelta(
      existing.amount,
      existing.type
    );

    const newAmount =
      data.amount !== undefined
        ? new Prisma.Decimal(data.amount)
        : existing.amount;

    const newType =
      data.type ?? existing.type;

    const newDelta = getBalanceDelta(
      newAmount,
      newType
    );

    // Difference between new transaction effect
    // and old transaction effect.
    const balanceDelta =
      newDelta.minus(oldDelta);

    const updated =
      await tx.transaction.update({
        where: {
          id,
        },
        data: {
          ...(data.amount !== undefined && {
            amount: newAmount,
          }),

          ...(data.type !== undefined && {
            type: data.type,
          }),

          ...(data.category !== undefined && {
            category: data.category,
          }),

          ...(data.date !== undefined && {
            date: new Date(data.date),
          }),
        },
      });

    if (!balanceDelta.isZero()) {
      await tx.account.update({
        where: {
          id: existing.accountId,
        },
        data: {
          balance: {
            increment: balanceDelta,
          },
        },
      });
    }

    return updated;
  });
}

export async function deleteTransaction(
  userId: string,
  id: string
) {
  return prisma.$transaction(async (tx) => {
    const existing =
      await tx.transaction.findFirst({
        where: {
          id,
          account: {
            userId,
          },
        },
      });

    if (!existing) {
      return null;
    }

    const oldDelta = getBalanceDelta(
      existing.amount,
      existing.type
    );

    // Reverse the original transaction effect.
    const reverseDelta = oldDelta.negated();

    await tx.transaction.delete({
      where: {
        id,
      },
    });

    await tx.account.update({
      where: {
        id: existing.accountId,
      },
      data: {
        balance: {
          increment: reverseDelta,
        },
      },
    });

    return existing;
  });
}