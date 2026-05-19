import { DotLoader } from "react-spinners";

export default function Loading() {
  return (
    <div className="flex justify-center items-center h-full py-20">
      <DotLoader color="#90d5ff" />
    </div>
  );
}
