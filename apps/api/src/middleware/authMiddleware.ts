import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined");
}

interface JwtPayload {
    userId: string;
}

export const authenticate = (
    req: Request,
    res: Response,
    next: NextFunction
) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Authentication required"
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Invalid authorization header"
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

        req.userId = decoded.userId;

        next();

    } catch {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};