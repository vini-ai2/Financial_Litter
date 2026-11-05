import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  createStockTradeController,
  listStockHoldingsController,
  listStockTradeHistoryController,
  reverseStockTradeController,
} from "../controllers/stockTradeController";

const router = Router();
router.use(authenticate);
router.get("/holdings", listStockHoldingsController);
router.get("/transactions", listStockTradeHistoryController);
router.post("/transactions", createStockTradeController);
router.post("/transactions/:id/reversals", reverseStockTradeController);

export default router;
