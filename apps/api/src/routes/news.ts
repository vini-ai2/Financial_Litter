import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getNewsEventController,
  getNewsFilterOptionsController,
  getNewsPreferencesController,
  listNewsEventsController,
  updateNewsPreferencesController,
} from "../controllers/newsController";

const router = Router();
router.use(authenticate);
router.get("/events", listNewsEventsController);
router.get("/events/:id", getNewsEventController);
router.get("/filters", getNewsFilterOptionsController);
router.get("/preferences", getNewsPreferencesController);
router.put("/preferences", updateNewsPreferencesController);

export default router;
