import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "../auth.js";

// Gate a route behind login. With `admin`, also require admin rights.
export default function AuthGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { data: me, isLoading } = useMe();
  const loc = useLocation();

  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Checking…</p>;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && !me.isAdmin)
    return (
      <div className="fl-enter mx-auto max-w-md text-center">
        <h1 className="font-display text-2xl text-cream">Not authorised</h1>
        <p className="mt-2 text-sm text-muted">This area is for organisers only.</p>
      </div>
    );
  return <>{children}</>;
}
