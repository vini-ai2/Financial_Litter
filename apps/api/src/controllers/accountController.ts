import { Request, Response } from "express";

import {
  createAccount,
  getAccounts,
  getAccount,
  updateAccount,
  deleteAccount,
} from "../services/accountService";

import {
  createAccountSchema,
  updateAccountSchema,
} from "../utils/validation";

export async function createAccountController(
  req: Request,
  res: Response
) {
  try {
    const parsed = createAccountSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid account data",
        details: parsed.error.flatten(),
      });
    }

    const account = await createAccount(
      req.userId,
      parsed.data
    );

    return res.status(201).json(account);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to create account",
    });
  }
}

export async function listAccountsController(
  req: Request,
  res: Response
) {
  try {
    const accounts = await getAccounts(req.userId);

    return res.json(accounts);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to fetch accounts",
    });
  }
}

export async function getAccountController(
  req: Request,
  res: Response
) {
  try {
    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid account ID",
      });
    }

    const account = await getAccount(
      req.userId,
      id
    );

    if (!account) {
      return res.status(404).json({
        error: "Account not found",
      });
    }

    return res.json(account);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to fetch account",
    });
  }
}

export async function updateAccountController(
  req: Request,
  res: Response
) {
  try {
    const parsed = updateAccountSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid account data",
        details: parsed.error.flatten(),
      });
    }

    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid account ID",
      });
    }

    const account = await updateAccount(
      req.userId,
      id,
      parsed.data
    );

    if (!account) {
      return res.status(404).json({
        error: "Account not found",
      });
    }

    return res.json(account);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to update account",
    });
  }
}

export async function deleteAccountController(
  req: Request,
  res: Response
) {
  try {
    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid account ID",
      });
    }

    const account = await deleteAccount(
      req.userId,
      id
    );

    if (!account) {
      return res.status(404).json({
        error: "Account not found",
      });
    }

    return res.status(204).send();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ACCOUNT_HAS_TRANSACTIONS"
    ) {
      return res.status(409).json({
        error:
          "Cannot delete an account that has transactions",
      });
    }

    console.error(error);

    return res.status(500).json({
      error: "Failed to delete account",
    });
  }
}