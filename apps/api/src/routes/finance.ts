import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getDashboardController, listLoansController, createLoanController, updateLoanController, deleteLoanController,
  listBudgetsController, createBudgetController, updateBudgetController, deleteBudgetController,
  listBillsController, createBillController, updateBillController, deleteBillController,
  getCreditScoreController, updateCreditScoreController,
} from "../controllers/financeController";

const router = Router();
router.use(authenticate);
router.get("/dashboard", getDashboardController);
router.get("/loans", listLoansController);
router.post("/loans", createLoanController);
router.put("/loans/:id", updateLoanController);
router.delete("/loans/:id", deleteLoanController);
router.get("/budgets", listBudgetsController);
router.post("/budgets", createBudgetController);
router.put("/budgets/:id", updateBudgetController);
router.delete("/budgets/:id", deleteBudgetController);
router.get("/bills", listBillsController);
router.post("/bills", createBillController);
router.put("/bills/:id", updateBillController);
router.delete("/bills/:id", deleteBillController);
router.get("/credit-score", getCreditScoreController);
router.put("/credit-score", updateCreditScoreController);
export default router;
