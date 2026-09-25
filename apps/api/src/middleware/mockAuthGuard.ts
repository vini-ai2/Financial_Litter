import { Request, Response, NextFunction } from "express";

export const mockAuthGuard = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    req.userId = "00000000-0000-0000-0000-000000000001";
    next();
};