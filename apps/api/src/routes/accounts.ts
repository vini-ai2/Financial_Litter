import { Router } from "express";

import {
  createAccountController,
  listAccountsController,
  getAccountController,
  updateAccountController,
  deleteAccountController,
} from "../controllers/accountController";

import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.post("/", createAccountController);

router.get("/", listAccountsController);

router.get("/:id", getAccountController);

router.put("/:id", updateAccountController);

router.delete("/:id", deleteAccountController);

export default router;