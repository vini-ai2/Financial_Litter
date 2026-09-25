// src/controllers/authController.ts
import { Request, Response } from "express";
import * as authService from "../services/authService";
import { signupSchema, loginSchema } from "../utils/validation";

const COOKIE_NAME = "refreshToken";
const COOKIE_OPTIONS = {
    httpOnly: true,        
    secure: process.env.NODE_ENV === "production",  // HTTPS only in prod
    sameSite: "strict" as const,
    path: "/auth",           // only sent to /auth/* routes
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days in milliseconds
};

export const ping = async (_: Request, res: Response) => {
    const message = await authService.ping();
    res.json({ message });
};

export const signup = async (req: Request, res: Response) => {
    try {
        const data = signupSchema.parse(req.body);
        const result = await authService.signup(data);
        res.status(201).json(result);
    } catch (err: any) {
        if (err.name === "ZodError") {
            return res.status(400).json({ error: err.issues });
        }
        res.status(500).json({ error: err.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const data = loginSchema.parse(req.body);
        const result = await authService.login(data, req.headers["user-agent"]);

        // Put refresh token in httpOnly cookie
        res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);

        // Return access token in body — frontend stores in memory, NOT localStorage
        res.status(200).json({
            message: result.message,
            accessToken: result.accessToken
        });
    } catch (err: any) {
        if (err.name === "ZodError") {
            return res.status(400).json({ error: err.issues });
        }
        res.status(401).json({ error: err.message });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    try {
        const token = req.cookies?.[COOKIE_NAME];

        if (!token) {
            return res.status(401).json({ error: "No refresh token provided" });
        }

        const result = await authService.refresh(token);

        // Set new refresh token cookie (rotation)
        res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);

        res.status(200).json({ accessToken: result.accessToken });
    } catch (err: any) {
        // Clear cookie on failure — force re-login
        res.clearCookie(COOKIE_NAME, { path: "/auth" });
        res.status(401).json({ error: err.message });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const token = req.cookies?.[COOKIE_NAME];

        if (token) {
            await authService.logout(token);
        }

        res.clearCookie(COOKIE_NAME, { path: "/auth" });
        res.status(200).json({ message: "Logged out successfully" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};