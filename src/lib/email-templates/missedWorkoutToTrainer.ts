import { sendEmail } from "./config";

/**
 * Missed workout email
 */
export async function missedWorkoutToTrainer(
  to: string,
  who: string,
  date: string,
  workout: string,
  clientName?: string
) {
  const appUrl = process.env.APP_URL || "${process.env.APP_URL}";

  return sendEmail({
    to,
    subject: "Missed Workout Notification",
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>Missed Workout Notification</h2>
        <p>Hello ${who},</p>
        <p>This is a notification that ${clientName ? `${clientName}'s` : "a"} workout on ${date} for ${workout} was missed.</p>
        <p>
            <a href="${appUrl}/trainer" style="display:inline-block; background:#ff6a00; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">
              View Dashboard
            </a>
        </p>
        <br/>
        <p style="font-size: 0.9rem; color: #888;">— AV_FLOW</p>
      </div>
    `,
    text: `Missed Workout Notification 
View your profile here: ${appUrl}/trainer`,
  });
}
