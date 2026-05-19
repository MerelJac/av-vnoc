import { sendEmail } from "./config";

/**
 * Compelted Workout email
 */
export async function sendCreatedWorkoutForLaterEmailToTrainer(
  to: string,
  clientName: string,
  workoutLogName: string,
  programName: string,
  endedAt: Date,
) {
  const appUrl = process.env.APP_URL || "${process.env.APP_URL}";

  return sendEmail({
    to,
    subject: `Created custom Workout for ${clientName}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>created Workout for ${clientName} 🔥</h2>
        <p>Workout: ${workoutLogName}</p>
        <p>Program: ${programName}</p>
        <p>created At: ${endedAt.toLocaleString()}</p>
        <p>
          <a href="${appUrl}" 
             style="display:inline-block; background:#ff6a00; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">
            View created workout
          </a>
        </p>
        <br/>
        <p style="font-size: 0.9rem; color: #888;">— AV_FLOW</p>
      </div>
    `,
    text: `Created Workout for ${clientName} 🔥
View created workout here: ${appUrl}`,
  });
}
