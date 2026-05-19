export type Profile = {
  id: string;
  height?: number | null;
  weight?: number | null;
  firstName: string;
  lastName: string;
  dob?: Date | null;
  experience?: string | null;
  injuryNotes?: string | null;
  phone?: string | null;
};
