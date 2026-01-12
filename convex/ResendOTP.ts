import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import type { RandomReader } from "@oslojs/crypto/random";
import { generateRandomString } from "@oslojs/crypto/random";

export const ResendOTP = Resend({
  id: "resend-otp-verify",
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    await resend.emails.send({
      from: "Tilly <noreply@notifications.tillycal.co>",
      to: [email],
      subject: "Verify your email for Tilly",
      text: `Your verification code is: ${token}\n\nThis code will expire in 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; margin-bottom: 20px;">Verify your email</h2>
          <p style="color: #666; margin-bottom: 20px;">Enter this code to verify your email for Tilly:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">${token}</span>
          </div>
          <p style="color: #999; font-size: 14px;">This code will expire in 10 minutes.</p>
        </div>
      `,
    });
  },
});
