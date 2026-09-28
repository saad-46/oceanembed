import { Suspense } from "react";
import ProfilesScreen from "./ProfilesScreen";

export const metadata = { title: "Profile", description: "Inspect the reconstructed water column from the surface to 1000 m with uncertainty, climatology and Argo observations." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <ProfilesScreen />
    </Suspense>
  );
}
