import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { phoneNumber } from "better-auth/plugins";
import { prisma } from "./db";
import { tempEmailFor } from "./phone";
import { sendOtp } from "./otp";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  advanced: { database: { generateId: "uuid" } },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      phoneNumberValidator: (p) => /^\+[1-9]\d{7,14}$/.test(p),
      sendOTP: ({ phoneNumber, code }) => {
        void sendOtp(phoneNumber, code);
      },
      signUpOnVerification: { getTempEmail: tempEmailFor },
    }),
  ],
});
