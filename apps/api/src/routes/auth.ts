import { Router } from "express";
import { ping, signup } from "../controllers/authController";

const router = Router();

router.get("/ping", ping);
router.post("/signup", signup);

export default router;