import jwt from "jsonwebtoken";
import crypto from "crypto";
const JWT_SECRET = process.env.JWT_SECRET;
if(!JWT_SECRET){
    throw new Error("JWT Secret is not defined");
}
export const generateToken = (userId: string) => {
     return jwt.sign( { userId }, JWT_SECRET, { expiresIn: "15m" }) ; 
    };
export const generateAccessToken = generateToken;
export const generateRefreshToken = (): string => {
    return crypto.randomBytes(48).toString("hex");
};

// Hash before storing 
export const hashToken = (token: string): string => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

export const refreshTokenExpiryDate = (): Date => {
    const d = new Date();
    d.setDate(d.getDate() + 7); 
    return d;
};