import { Suspense } from "react";
import TimelineScreen from "./TimelineScreen";

export const metadata = { title: "Ocean State Timeline — OceanSight" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <TimelineScreen />
    </Suspense>
  );
}
