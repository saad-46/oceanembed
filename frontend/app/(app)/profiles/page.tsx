import { Suspense } from "react";
import ProfilesScreen from "./ProfilesScreen";

export const metadata = { title: "Profiles — OceanSight" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <ProfilesScreen />
    </Suspense>
  );
}
