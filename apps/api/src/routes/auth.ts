import { Router } from "express";
import { ping, signup, login } from "../controllers/authController";

const router = Router();

router.get("/ping", ping);
router.post("/signup", signup);
router.post("/login", login);


export default router;