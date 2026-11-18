import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  createStockTradeController,
  capturePortfolioSnapshotController,
  comparePortfolioSnapshotsController,
  getPortfolioSnapshotController,
  getStockPortfolioController,
  historicalPortfolioValuationController,
  listPortfolioSnapshotsController,
  listStockHoldingsController,
  listStockTradeHistoryController,
  reverseStockTradeController,
  stockRebalancePreviewController,
  upsertStockPriceController,
} from "../controllers/stockTradeController";

const router = Router();
router.use(authenticate);
router.get("/holdings", listStockHoldingsController);
router.get("/portfolio", getStockPortfolioController);
router.post("/portfolio/snapshots", capturePortfolioSnapshotController);
router.get("/portfolio/snapshots", listPortfolioSnapshotsController);
router.get("/portfolio/snapshots/:id", getPortfolioSnapshotController);
router.get("/portfolio/history", historicalPortfolioValuationController);
router.get("/portfolio/history/comparison", comparePortfolioSnapshotsController);
router.put("/prices", upsertStockPriceController);
router.post("/rebalance-preview", stockRebalancePreviewController);
router.get("/transactions", listStockTradeHistoryController);
router.post("/transactions", createStockTradeController);
router.post("/transactions/:id/reversals", reverseStockTradeController);

export default router;
