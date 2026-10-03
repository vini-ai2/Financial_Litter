import { Router } from "express";

import {
  createTransactionController,
  listTransactionsController,
  getTransactionController,
  updateTransactionController,
  deleteTransactionController,
} from "../controllers/transactionController";

import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.post("/", createTransactionController);

router.get("/", listTransactionsController);

router.get("/:id", getTransactionController);

router.put("/:id", updateTransactionController);

router.delete("/:id", deleteTransactionController);

export default router;