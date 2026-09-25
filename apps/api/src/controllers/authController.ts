import { Request, Response } from "express";
import * as authService from "../services/authService";
import { signupSchema, loginSchema } from "../utils/validation";
//Controller deals with requests and responses, while the service layer handles the business logic.
//  The controller calls the service functions and sends the appropriate response back to the client.

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

export const login = async (req: Request, res: Response)=> {
    try{
        const data = loginSchema.parse(req.body);
        const result = await authService.login(data);
        res.status(201).json(result); 
    }
    catch(err:any){

        if (err.name === "ZodError") {
            return res.status(400).json({
                error: err.issues
            });
        }
        res.status(500).json({
            error: err.message
        });
    }
}