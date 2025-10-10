import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./domain";
import { Router } from "./routes";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
    </AuthProvider>
  );
}
