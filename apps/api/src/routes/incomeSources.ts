import { Router } from "express";

import {
  createIncomeSourceController,
  listIncomeSourcesController,
  getIncomeSourceController,
  updateIncomeSourceController,
  deleteIncomeSourceController,
} from "../controllers/incomeSourceController";

import { mockAuthGuard } from "../middleware/mockAuthGuard";

const router = Router();

router.use(mockAuthGuard);

router.post("/", createIncomeSourceController);

router.get("/", listIncomeSourcesController);

router.get("/:id", getIncomeSourceController);

router.put("/:id", updateIncomeSourceController);

router.delete("/:id", deleteIncomeSourceController);

export default router;