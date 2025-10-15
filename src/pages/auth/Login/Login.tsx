import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db, actionCodeSettings } from "../../../firebase";

const EMAIL_KEY = "emailForSignIn";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"login" | "checkEmail">("login");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const channel = new BroadcastChannel("auth_channel");

    if (step === "checkEmail") {
      channel.onmessage = (event) => {
        if (event.data === "login_success") {
          localStorage.removeItem(EMAIL_KEY);
          navigate("/");
        }
      };
    }

    if (isSignInWithEmailLink(auth, window.location.href)) {
      const savedEmail = localStorage.getItem(EMAIL_KEY);
      if (!savedEmail) {
        setError("Sessão de login inválida. Tente novamente.");
        return;
      }

      setIsLoading(true);
      signInWithEmailLink(auth, savedEmail, window.location.href)
        .then(async (result) => {
          const user = result.user;
          const userDocRef = doc(db, "users", user.uid);
          await setDoc(
            userDocRef,
            { last2faVerification: Timestamp.now() },
            { merge: true }
          );

          channel.postMessage("login_success");
          window.close();
        })
        .catch((err) => {
          setError(err.message || "Link inválido ou expirado.");
          setIsLoading(false);
        });
    }

    return () => {
      channel.close();
    };
  }, [step, navigate]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
      let needs2fa = true;

      if (userDoc.exists()) {
        const data = userDoc.data();
        const lastVerification = data.last2faVerification as
          | Timestamp
          | undefined;

        if (
          lastVerification &&
          Date.now() - lastVerification.toDate().getTime() < fiveDaysInMs
        ) {
          needs2fa = false;
        }
      }

      if (needs2fa) {
        sessionStorage.setItem("verifying-2fa", "true");
        await signOut(auth);

        try {
          await sendSignInLinkToEmail(auth, email, actionCodeSettings);
          localStorage.setItem(EMAIL_KEY, email);
          setStep("checkEmail");
        } catch (err: any) {
          if (err.code === "auth/quota-exceeded") {
            setError(
              "Limite diário de verificação por e-mail excedido (plano gratuito). Tente novamente amanhã."
            );
          } else {
            setError("Não foi possível enviar o e-mail de verificação.");
          }
        } finally {
          sessionStorage.removeItem("verifying-2fa");
        }
      } else {
        navigate("/");
      }
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        setError("Email ou senha incorretos.");
      } else {
        setError("Ocorreu um erro durante o login.");
        console.error("Login Error:", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-700">
          {step === "login" ? "Login" : "Verifique seu E-mail"}
        </h1>

        {step === "login" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-600">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isLoading ? "Verificando..." : "Avançar"}
            </button>
          </form>
        )}

        {step === "checkEmail" && (
          <div className="text-center space-y-4 p-6 bg-green-50 border border-green-200 rounded-lg">
            <svg
              className="w-16 h-16 mx-auto text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 o 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <h2 className="text-xl font-semibold text-green-800">
              Verificação Enviada!
            </h2>
            <p className="text-gray-700">
              Enviamos um link de confirmação para <strong>{email}</strong>.
              <br />
              Clique no link em seu e-mail para completar o acesso.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-center text-red-600 mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
