import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { RoomJoinForm } from "./components/RoomJoinForm";
import { SpectrumBoard } from "./components/SpectrumBoard";
import { finishOAuthRedirectIfPresent } from "./oauthCallback";

function HomePage() {
  return (
    <main className="centeredPage">
      <RoomJoinForm />
    </main>
  );
}

function RoomPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return <Navigate to="/" replace />;
  }

  return <SpectrumBoard roomSlug={slug} />;
}

export default function App() {
  const [oauthHandled, setOauthHandled] = useState(
    () => !new URLSearchParams(window.location.search).has("code"),
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("code")) {
      return;
    }
    void finishOAuthRedirectIfPresent().finally(() => setOauthHandled(true));
  }, []);

  if (!oauthHandled) {
    return (
      <main className="centeredPage">
        <p className="muted">Finishing sign-in…</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/r/:slug" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
