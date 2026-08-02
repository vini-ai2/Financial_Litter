import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { SignupInput } from "../utils/validation";

export const ping = async () => {
    return "Auth service is working!";
};

export const signup = async (data: SignupInput) => {

    const existingUser = await prisma.user.findUnique({
        where: {
            email: data.email
        }
    });

    if (existingUser) {
        throw new Error("Email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    await prisma.user.create({
        data: {
            email: data.email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName
        }
    });

    return {
        message: "User created successfully"
    };
};