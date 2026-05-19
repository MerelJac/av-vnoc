import { Profile } from "./profile";

export type User = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  profile?: Profile | null;
};

export type UserWithProfile = User & { profile: Profile | null };
