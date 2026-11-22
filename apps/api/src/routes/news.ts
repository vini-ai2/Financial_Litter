import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getNewsEventController,
  getNewsFilterOptionsController,
  getNewsSourceStatusController,
  getNewsPreferencesController,
  addNewsWatchController,
  listNewsHistoryController,
  listNewsWatchesController,
  removeNewsWatchController,
  saveNewsEventController,
  unsaveNewsEventController,
  listNewsEventsController,
  updateNewsPreferencesController,
} from "../controllers/newsController";

const router = Router();
router.use(authenticate);
router.get("/events", listNewsEventsController);
router.get("/events/:id", getNewsEventController);
router.get("/filters", getNewsFilterOptionsController);
router.get("/source-status", getNewsSourceStatusController);
router.get("/history", listNewsHistoryController);
router.get("/watchlist", listNewsWatchesController);
router.post("/watchlist", addNewsWatchController);
router.delete("/watchlist/:id", removeNewsWatchController);
router.get("/preferences", getNewsPreferencesController);
router.put("/preferences", updateNewsPreferencesController);
router.post("/events/:id/save", saveNewsEventController);
router.delete("/events/:id/save", unsaveNewsEventController);

export default router;
