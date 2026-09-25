// src/routes/auth.ts
import { Router } from "express";
import { ping, signup, login, refreshToken, logout } from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.get("/ping", ping);
router.post("/signup", signup);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", logout);  // authenticate not required — cookie is the credential

// Temporary protected route
router.get("/protected", authenticate, (req, res) => {
    res.json({
        message: "You are authenticated!",
        userId: req.userId
    });
});

export default router;