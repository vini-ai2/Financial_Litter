import { Router } from "express";

import {
  createIncomeSourceController,
  listIncomeSourcesController,
  getIncomeSourceController,
  updateIncomeSourceController,
  deleteIncomeSourceController,
} from "../controllers/incomeSourceController";

import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.post("/", createIncomeSourceController);

router.get("/", listIncomeSourcesController);

router.get("/:id", getIncomeSourceController);

router.put("/:id", updateIncomeSourceController);

router.delete("/:id", deleteIncomeSourceController);

export default router;