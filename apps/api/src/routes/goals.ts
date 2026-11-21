import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  addGoalContributionController, archiveGoalController, createGoalController, getGoalController,
  goalPlanningController, linkGoalTransactionController, listEligibleGoalTransactionsController, listGoalContributionsController,
  listGoalsController, reverseGoalContributionController, setGoalStatusController, updateGoalController,
} from "../controllers/goalController";

const router = Router();
router.use(authenticate);
router.get("/", listGoalsController);
router.post("/", createGoalController);
router.get("/eligible-transactions", listEligibleGoalTransactionsController);
router.get("/:id/contributions", listGoalContributionsController);
router.post("/:id/contributions", addGoalContributionController);
router.post("/:id/contributions/:contributionId/reversals", reverseGoalContributionController);
router.post("/:id/transactions", linkGoalTransactionController);
router.get("/:id/planning", goalPlanningController);
router.patch("/:id/status", setGoalStatusController);
router.put("/:id", updateGoalController);
router.delete("/:id", archiveGoalController);
router.get("/:id", getGoalController);
export default router;
