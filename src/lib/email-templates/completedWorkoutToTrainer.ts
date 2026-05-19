import { sendEmail } from "./config";

/**
 * Compelted Workout email
 */
export async function sendCompletedWorkoutEmailToTrainer(
  to: string,
  clientName: string,
  workoutLogName: string,
  programName: string,
  endedAt: Date,
) {
  const appUrl = process.env.APP_URL || "${process.env.APP_URL}";

  return sendEmail({
    to,
    subject: `Completed Workout for ${clientName}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>Completed Workout for ${clientName} 🔥</h2>
        <p>Workout: ${workoutLogName}</p>
        <p>Program: ${programName}</p>
        <p>Completed At: ${endedAt.toLocaleString()}</p>
        <p>
          <a href="${appUrl}" 
             style="display:inline-block; background:#ff6a00; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">
            View completed workout
          </a>
        </p>
        <br/>
        <p style="font-size: 0.9rem; color: #888;">— AV_FLOW</p>
      </div>
    `,
    text: `Completed Workout for ${clientName} 🔥
View completed workout here: ${appUrl}`,
  });
}
