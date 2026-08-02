import { Request, Response } from "express";
import * as authService from "../services/authService";
import { signupSchema } from "../utils/validation";

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
            return res.status(400).json({
                error: err.issues
            });
        }

        res.status(500).json({
            error: err.message
        });
    }
};