import { sendEmail } from "./config";

/**
 * Welcome email
 */
export async function sendWelcomeEmail(to: string) {
  const appUrl =
    process.env.APP_URL || "${process.env.APP_URL}";

  return sendEmail({
    to,
    subject: "Welcome to AV_FLOW!",
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>Welcome to AV_FLOW 🔥</h2>
        <p>You have been invited to register!</p>
        <p>We’re excited to have you on board. Reminder: Register with the same email address from this email!</p>
        <p>
          <a href="${appUrl}/signup" 
             style="display:inline-block; background:#ff6a00; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">
            Click here to get started
          </a>
        </p>
        <br/>
        <p style="font-size: 0.9rem; color: #888;">— AV_FLOW</p>
      </div>
    `,
    text: `Welcome to AV_FLOW! You're officially part of the team 🔥
Get started here: ${appUrl}/signup`,
  });
}
