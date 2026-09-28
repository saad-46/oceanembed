import { Suspense } from "react";
import TimelineScreen from "./TimelineScreen";

export const metadata = { title: "Timeline", description: "Follow the reconstructed water column at one location through time, with MLD, D20 and D26." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <TimelineScreen />
    </Suspense>
  );
}
