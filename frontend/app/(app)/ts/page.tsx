import { Suspense } from "react";
import TSScreen from "./TSScreen";

export const metadata = { title: "T-S analysis", description: "Temperature–salinity diagram of the nearest measured profile, with TEOS-10 density contours." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <TSScreen />
    </Suspense>
  );
}
