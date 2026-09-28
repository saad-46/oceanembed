import { redirect } from "next/navigation";

/** The map is the primary workspace; the former overview route redirects there. */
export default function Page() {
  redirect("/map");
}
