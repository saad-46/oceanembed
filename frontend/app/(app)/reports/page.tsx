import { Suspense } from "react";
import ReportsScreen from "./ReportsScreen";

export const metadata = { title: "Reports", description: "Generate water-column reports and export the underlying data." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <ReportsScreen />
    </Suspense>
  );
}
