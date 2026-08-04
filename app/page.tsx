import MapwiseClient from "./mapwise-client";
import { requireUser, signOutPath, isEmployee } from "./access-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();

  if (!isEmployee(user.email)) {
    return (
      <main className="access-page">
        <section className="access-card">
          <span className="brand-mark">M</span>
          <p className="eyebrow">BOOKINGPAL INTERNAL</p>
          <h1>Access restricted</h1>
          <p>Mapwise is available to authenticated BookingPal employees.</p>
          <a href={signOutPath()}>Sign in with a different account</a>
        </section>
      </main>
    );
  }

  return <MapwiseClient user={{ displayName: user.displayName, email: user.email }} />;
}
