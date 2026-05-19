// lib/emailWithAttachment.ts
import nodemailer from "nodemailer";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.SES_REGION!,
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

// nodemailer SDK v2-style SES transport doesn't work with @aws-sdk v3.
// Instead: build the raw MIME via nodemailer's streamTransport, then send
// it with SendRawEmailCommand from the v3 SDK.
const streamTransporter = nodemailer.createTransport({
  streamTransport: true,
  newline: "unix",
});

export async function sendEmailWithAttachment({
  to,
  bcc,
  subject,
  html,
  attachments,
}: {
  to: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: Buffer }[];
}) {
  const { message } = await streamTransporter.sendMail({
    from: `"Call One, Inc." <${process.env.SES_FROM_ADDRESS}>`,
    to,
    bcc,
    subject,
    html,
    attachments,
  });

  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawMessage = Buffer.concat(chunks);

  await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: rawMessage },
    }),
  );
}
