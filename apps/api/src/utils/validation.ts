import { z } from "zod";

export const signupSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().regex(/^\+?[0-9]{10,12}$/)
});

export const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(8)
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;