import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.SES_REGION!,
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

export async function emailCsvFile({
  to,
  subject,
  body,
  csvContent,
  filename,
}: {
  to: string;
  subject: string;
  body: string;
  csvContent: string;
  filename: string;
}) {
  const boundary = `----=_Part_${Date.now()}`;
  const raw64 = Buffer.from(csvContent).toString("base64");
  // MIME requires base64 lines no longer than 76 chars
  const csvBase64 = raw64.match(/.{1,76}/g)!.join("\r\n");

  const rawMessage = [
    `From: ${process.env.SES_FROM_ADDRESS!.trim()}`,
    `To: ${to.trim()}`,
    `Bcc: mjacobs@calloneonline.com`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
    ``,
    `--${boundary}`,
    `Content-Type: text/csv; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    csvBase64,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
    }),
  );

  console.log(`✅ Email with CSV sent to ${to}`);
}
