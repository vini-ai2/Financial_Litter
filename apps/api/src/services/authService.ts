import bcrypt from "bcrypt";  //hashing library for securely storing passwords
import prisma from "../lib/prisma";
import { SignupInput, LoginInput } from "../utils/validation";

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
            lastName: data.lastName,
            phone: data.phone

        }
    });

    return {
        message: "User created successfully"
    };
};

export const login = async (data: LoginInput)=>{
       //Check if the user exists
       const user = await prisma.user.findUnique({ //finding the user, await return user or null
        where:{
            email: data.email
        }
       }
       );
       if(!user){
        throw new Error("Invalid email or password");
       }
       //if user exists
       const isPasswordValid = await bcrypt.compare(
    data.password,
    user.passwordHash
);
if(!isPasswordValid){
    throw new Error("Invalid Email or password");
}
return{
    message: "Login succesfull"
};
};