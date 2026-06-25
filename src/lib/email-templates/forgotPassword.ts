import { sendEmail } from "./config";

/**
 * Forgot password email
 */
export async function sendForgotPasswordEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: "Reset your Call One VNOC password",
    html: `
        <div style="font-family:sans-serif; line-height:1.5; color:#333;">
          <h2>Password reset requested</h2>
          <p>We received a request to reset your password.</p>
          <p>
            <a href="${resetUrl}" style="background:black; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">
              Reset your password
            </a>
          </p>
          <p>If you didn’t request this, please contact support.</p>
          <br/>
          <p style="font-size:0.9rem; color:#888;">— Call One VNOC</p>
        </div>
      `,
    text: "Reset your password! Click the link to reset: " + resetUrl,
  });
}
