import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function GET(req: Request) {
  const token = await getToken({ req: req as NextRequest, secret: process.env.NEXTAUTH_SECRET! });

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
