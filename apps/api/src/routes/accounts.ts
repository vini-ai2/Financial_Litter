import { Router } from "express";

import {
  createAccountController,
  listAccountsController,
  getAccountController,
  updateAccountController,
  deleteAccountController,
} from "../controllers/accountController";

import { mockAuthGuard } from "../middleware/mockAuthGuard";

const router = Router();

router.use(mockAuthGuard);

router.post("/", createAccountController);

router.get("/", listAccountsController);

router.get("/:id", getAccountController);

router.put("/:id", updateAccountController);

router.delete("/:id", deleteAccountController);

export default router;