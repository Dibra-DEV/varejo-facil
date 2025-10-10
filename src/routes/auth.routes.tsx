import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "../pages/auth/Login/Login";

export function AuthRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
