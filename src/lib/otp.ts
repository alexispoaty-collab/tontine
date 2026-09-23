// Canal OTP à brancher (SMS local ou modèle WhatsApp « authentication »).
export async function sendOtp(phone: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.OTP_DEBUG === "1") {
    console.log(`[OTP] ${phone} -> ${code}`);
    return;
  }
  throw new Error("Canal OTP non configuré");
}
