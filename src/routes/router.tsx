import { useAuth } from "../domain/auth/AuthProvider";
import { AppRoutes } from "./app.routes";
import { AuthRoutes } from "./auth.routes";

export function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        Carregando...
      </div>
    );
  }

  return user ? <AppRoutes /> : <AuthRoutes />;
}
