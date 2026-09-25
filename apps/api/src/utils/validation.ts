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
export type IncomeSourceInput = z.infer<typeof createIncomeSourceSchema>;
export type UpdateIncomeSourceInput = z.infer<typeof updateIncomeSourceSchema>;
export type AccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type TransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const createIncomeSourceSchema = z.object({
  name: z.string().min(1).max(100),

  type: z.enum([
    'SALARY',
    'FREELANCE',
    'RENTAL',
    'OTHER',
  ]),

  amount: z.number().positive(),

  frequency: z.enum([
    'WEEKLY',
    'MONTHLY',
    'ANNUAL',
  ]),

  effectiveFrom: z.string().datetime(),

  effectiveUntil: z
    .string()
    .datetime()
    .optional(),

  isActive: z.boolean().optional(),
})

export const updateIncomeSourceSchema =
  createIncomeSourceSchema.partial()

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),

  type: z.enum([
    "CHECKING",
    "SALARY",
    "SAVINGS",
    "FD",
  ]),

  balance: z.number(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),

  type: z.enum([
    "CHECKING",
    "SALARY",
    "SAVINGS",
    "FD",
  ]).optional(),
});
export const createTransactionSchema = z.object({
  accountId: z.string().uuid(),

  amount: z.number().positive(),

  type: z.enum([
    "INCOME",
    "EXPENSE",
  ]),

  category: z.string().min(1).max(100),

  date: z.string().datetime(),
});

export const updateTransactionSchema = z.object({
  amount: z.number().positive().optional(),

  type: z.enum([
    "INCOME",
    "EXPENSE",
  ]).optional(),

  category: z.string().min(1).max(100).optional(),

  date: z.string().datetime().optional(),
});
