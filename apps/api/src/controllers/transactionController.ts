import { Request, Response } from "express";

import {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "../services/transactionService";

import {
  createTransactionSchema,
  updateTransactionSchema,
} from "../utils/validation";

export async function createTransactionController(
  req: Request,
  res: Response
) {
  try {
    const parsed =
      createTransactionSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid transaction data",
        details: parsed.error.flatten(),
      });
    }

    const transaction =
      await createTransaction(
        req.userId,
        parsed.data
      );

    return res.status(201).json(transaction);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ACCOUNT_NOT_FOUND"
    ) {
      return res.status(404).json({
        error: "Account not found",
      });
    }

    console.error(error);

    return res.status(500).json({
      error: "Failed to create transaction",
    });
  }
}

export async function listTransactionsController(
  req: Request,
  res: Response
) {
  try {
    const typeParam = req.query.type;
    const categoryParam = req.query.category;
    const monthParam = req.query.month;

    const type =
      typeof typeParam === "string"
        ? typeParam
        : undefined;

    if (
      type !== undefined &&
      type !== "INCOME" &&
      type !== "EXPENSE"
    ) {
      return res.status(400).json({
        error: "Invalid transaction type",
      });
    }

    const category =
      typeof categoryParam === "string"
        ? categoryParam
        : undefined;

    const month =
      typeof monthParam === "string"
        ? monthParam
        : undefined;

    try {
      const transactions =
        await getTransactions(
          req.userId,
          {
            type,
            category,
            month,
          }
        );

      return res.json(transactions);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "INVALID_MONTH"
      ) {
        return res.status(400).json({
          error:
            "Month must be in YYYY-MM format",
        });
      }

      throw error;
    }
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to fetch transactions",
    });
  }
}

export async function getTransactionController(
  req: Request,
  res: Response
) {
  try {
    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid transaction ID",
      });
    }

    const transaction =
      await getTransaction(
        req.userId,
        id
      );

    if (!transaction) {
      return res.status(404).json({
        error: "Transaction not found",
      });
    }

    return res.json(transaction);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to fetch transaction",
    });
  }
}

export async function updateTransactionController(
  req: Request,
  res: Response
) {
  try {
    const parsed =
      updateTransactionSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid transaction data",
        details: parsed.error.flatten(),
      });
    }

    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid transaction ID",
      });
    }

    const transaction =
      await updateTransaction(
        req.userId,
        id,
        parsed.data
      );

    if (!transaction) {
      return res.status(404).json({
        error: "Transaction not found",
      });
    }

    return res.json(transaction);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to update transaction",
    });
  }
}

export async function deleteTransactionController(
  req: Request,
  res: Response
) {
  try {
    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid transaction ID",
      });
    }

    const transaction =
      await deleteTransaction(
        req.userId,
        id
      );

    if (!transaction) {
      return res.status(404).json({
        error: "Transaction not found",
      });
    }

    return res.status(204).send();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to delete transaction",
    });
  }
}