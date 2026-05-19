import Link from "next/link";
import { ArrowLeft } from "lucide-react";
type BackButtonProps = {
  route: string;
};

export function BackButton({ route }: BackButtonProps) {
  return (
    <Link href={route} className="back-link">
      < ArrowLeft size={16}/>Back
    </Link>
  );
}
