// src/services/authService.ts
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { SignupInput, LoginInput } from "../utils/validation";
import {
    generateAccessToken,
    generateRefreshToken,
    hashToken,
    refreshTokenExpiryDate
} from "../utils/jwt";

export const ping = async () => {
    return "Auth service is working!";
};

export const signup = async (data: SignupInput) => {
    const existingUser = await prisma.user.findUnique({
        where: { email: data.email }
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
            lastName: data.lastName,
            phone: data.phone
        }
    });

    return { message: "User created successfully" };
};

export const login = async (
    data: LoginInput,
    userAgent?: string
) => {
    const user = await prisma.user.findUnique({
        where: { email: data.email }
    });

    if (!user) throw new Error("Invalid email or password");

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isPasswordValid) throw new Error("Invalid email or password");

    // Generate both tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();

    // Store session (refresh token hash) in DB
    await prisma.session.create({
        data: {
            userId: user.id,
            refreshTokenHash: hashToken(refreshToken),
            userAgent: userAgent ?? null,
            expiresAt: refreshTokenExpiryDate()
        }
    });

    // Clean up any expired sessions for this user while we're here
    await prisma.session.deleteMany({
        where: {
            userId: user.id,
            expiresAt: { lt: new Date() }
        }
    });

    return {
        message: "Login successful",
        accessToken,
        refreshToken  // controller will put this in httpOnly cookie
    };
};

export const refresh = async (incomingRefreshToken: string) => {
    const tokenHash = hashToken(incomingRefreshToken);

    const session = await prisma.session.findUnique({
        where : {
             refreshTokenHash: tokenHash }
    });

    if (!session) throw new Error("Invalid refresh token");

    if (session.expiresAt < new Date()) {
        // Clean up expired session
        await prisma.session.delete({ where: { refreshTokenHash: tokenHash } });
        throw new Error("Refresh token expired, please login again");
    }

    // Rotation: delete old session, create new one
    await prisma.session.delete({ where: { refreshTokenHash: tokenHash } });

    const newRefreshToken = generateRefreshToken();
    await prisma.session.create({
        data: {
            userId: session.userId,
            refreshTokenHash: hashToken(newRefreshToken),
            userAgent: session.userAgent,
            expiresAt: refreshTokenExpiryDate()
        }
    });

    const newAccessToken = generateAccessToken(session.userId);

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
    };
};

export const logout = async (incomingRefreshToken: string) => {
    const tokenHash = hashToken(incomingRefreshToken);

    // deleteMany so it doesn't throw if session is already gone
    await prisma.session.deleteMany({
        where: { refreshTokenHash: tokenHash }
    });

    return { message: "Logged out successfully" };
};