import { sendEmail } from "./config";

/**
 * Welcome email
 */
export async function sendAdditionalWorkoutEmailToTrainer(to: string, clientName: string, workoutType: string, performedAt: Date) {
  const appUrl =
    process.env.APP_URL || "${process.env.APP_URL}";

  return sendEmail({
    to,
    subject: `New Workout Added for ${clientName}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>New Workout Added for ${clientName} 🔥</h2>
        <p>Workout Type: ${workoutType}</p>
        <p>Performed At: ${performedAt.toLocaleString()}</p>
        <p>
          <a href="${appUrl}" 
             style="display:inline-block; background:#ff6a00; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">
            View additional workouts
          </a>
        </p>
        <br/>
        <p style="font-size: 0.9rem; color: #888;">— AV_FLOW</p>
      </div>
    `,
    text: `New Workout Added for ${clientName} 🔥
View additional workouts here: ${appUrl}`,
  });
}
