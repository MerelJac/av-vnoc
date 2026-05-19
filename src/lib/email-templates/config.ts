// lib/emailTemplates.ts
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Initialize once for all sends
const ses = new SESClient({
  region: process.env.SES_REGION!,
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

/**
 * Generic SES send helper
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const params = {
    Source: process.env.SES_FROM_ADDRESS!,
    Destination: {
      ToAddresses: [to],
      BccAddresses: ["mjacobs@calloneonline.com"],
    }, // Removed BccAddresses: ["mjacobs@calloneonline.com"]
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: html },
        Text: { Data: text },
      },
    },
  };

  await ses.send(new SendEmailCommand(params));
  console.log(`✅ Email sent to ${to}`);
}
