import { redirect } from "next/navigation";

/** Retired route: kept so older links land in Guided Exploration. */
export default function Page() {
  redirect("/guide");
}
