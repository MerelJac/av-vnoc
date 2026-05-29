// lib/emailTemplates.ts
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Lazily initialized to avoid module-load failures when SES env vars are absent
let _ses: SESClient | null = null;

function getSesClient(): SESClient {
  if (!_ses) {
    const region = process.env.SES_REGION;
    if (!region) throw new Error("SES_REGION is not configured");
    _ses = new SESClient({
      region,
      credentials: {
        accessKeyId: process.env.SES_ACCESS_KEY_ID!,
        secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _ses;
}

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
    },
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: html },
        Text: { Data: text },
      },
    },
  };

  await getSesClient().send(new SendEmailCommand(params));
}
