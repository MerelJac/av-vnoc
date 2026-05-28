import { DefaultSession } from "next-auth";
import { VnocRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
      vnocRole: VnocRole | null;
    } & DefaultSession["user"];
  }

  interface User {
    isSuperAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isSuperAdmin: boolean;
    vnocRole: VnocRole | null;
  }
}
