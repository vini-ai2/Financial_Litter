import { Request, Response, NextFunction } from "express";

export const mockAuthGuard = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    req.userId = "test-user-id";
    next();
};