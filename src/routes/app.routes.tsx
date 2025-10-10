import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "../pages/app/Dashboard/Dashboard";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
