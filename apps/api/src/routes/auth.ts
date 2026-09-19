import { Router } from "express";
import { ping, signup, login } from "../controllers/authController";
import {authenticate} from "../middleware/authMiddleware";

const router = Router();

router.get("/ping", ping);
router.post("/signup", signup);
router.post("/login", login);
router.get("/protected", authenticate, (req, res) => {
    res.json({
        message: "You are authenticated!",
        userId: req.userId
    });
});

export default router;