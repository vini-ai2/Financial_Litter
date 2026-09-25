import { Router } from "express";

import {
  createTransactionController,
  listTransactionsController,
  getTransactionController,
  updateTransactionController,
  deleteTransactionController,
} from "../controllers/transactionController";

import { mockAuthGuard } from "../middleware/mockAuthGuard";

const router = Router();

router.use(mockAuthGuard);

router.post("/", createTransactionController);

router.get("/", listTransactionsController);

router.get("/:id", getTransactionController);

router.put("/:id", updateTransactionController);

router.delete("/:id", deleteTransactionController);

export default router;