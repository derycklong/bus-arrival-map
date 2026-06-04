"use client";

import { useRef, useState } from "react";
import { login, register } from "@/lib/api";

interface AuthFormProps {
  onAuth: (token: string, username: string) => void;
  sessionExpiredMessage?: string;
}

function normalizeError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Request timed out. Please try again.";
  }
  if (err instanceof TypeError) {
    return "Connection error. Check your network or try again.";
  }
  const msg = err instanceof Error ? err.message : "Something went wrong";
  const lower = msg.toLowerCase();
  if (lower.includes("401") || lower.includes("invalid")) {
    return "Invalid username or password.";
  }
  if (lower.includes("409") || lower.includes("already") || lower.includes("taken")) {
    return "Username already taken.";
  }
  return msg;
}

export default function AuthForm({ onAuth, sessionExpiredMessage }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [error, setError] = useState(sessionExpiredMessage || "");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "error">("idle");
  const statusRef = useRef<HTMLParagraphElement>(null);

  function showError(message: string) {
    setError(message);
    setSubmitState("error");
    requestAnimationFrame(() => {
      statusRef.current?.focus();
      statusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function switchMode(m: "login" | "register") {
    setMode(m);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const errors: string[] = [];
    if (!username.trim() || !password) {
      errors.push("Please fill in both fields.");
    }

    if (mode === "register") {
      if (!email.trim()) errors.push("Email is required.");
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Invalid email address.");
      if (!mobileNumber.trim()) errors.push("Mobile number is required.");
      else if (!/^[89]\d{7}$/.test(mobileNumber)) errors.push("Mobile number must start with 8 or 9 and be 8 digits.");
    }

    if (errors.length) {
      showError(errors.join("; "));
      return;
    }

    setSubmitState("loading");
    try {
      let res;
      if (mode === "login") {
        res = await login(username.trim(), password);
      } else {
        res = await register(username.trim(), password, email.trim(), mobileNumber.trim());
      }
      localStorage.setItem("token", res.token);
      setSubmitState("idle");
      onAuth(res.token, res.user.username);
    } catch (err) {
      showError(normalizeError(err));
    }
  }

  const isLoading = submitState === "loading";
  const title = mode === "login" ? "Welcome back" : "Create your account";
  const subtitle = mode === "login"
    ? "Log in to see your saved stops."
    : "Save your favorite stops across devices.";

  return (
    <div className="auth-screen fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <div className="auth-screen-inner flex items-center justify-center px-4 py-6">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="w-full max-w-[380px] rounded-2xl p-8 text-center fade-in"
          style={{
            background: "var(--color-surface)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid var(--color-glass-border)",
            boxShadow: "0 8px 32px var(--color-glass-shadow)",
          }}
        >
          {/* App branding */}
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-accent)] mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="3" width="16" height="16" rx="3"/>
                <rect x="6" y="5" width="12" height="6" rx="1"/>
                <circle cx="8" cy="16" r="1.5"/>
                <circle cx="16" cy="16" r="1.5"/>
                <line x1="8" y1="19" x2="8" y2="21"/>
                <line x1="16" y1="19" x2="16" y2="21"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Bus Arrival Map</h1>
            <p className="text-xs mt-1 font-semibold tracking-wider uppercase" style={{ color: "var(--color-text-muted)" }}>
              derycklong
            </p>
          </div>

          {/* Title */}
          <p className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>{title}</p>
          <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>{subtitle}</p>

          {/* Tabs */}
          <div
            className="flex mb-5 rounded-xl overflow-hidden p-1"
            style={{ background: "var(--color-surface-hover)" }}
          >
            <button
              type="button"
              aria-pressed={mode === "login"}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200"
              style={{
                background: mode === "login" ? "var(--color-accent)" : "transparent",
                color: mode === "login" ? "#ffffff" : "var(--color-text-secondary)",
              }}
              onClick={() => switchMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200"
              style={{
                background: mode === "register" ? "var(--color-accent)" : "transparent",
                color: mode === "register" ? "#ffffff" : "var(--color-text-secondary)",
              }}
              onClick={() => switchMode("register")}
            >
              Register
            </button>
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <input
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "var(--color-surface-hover)",
                border: "1px solid var(--color-border-strong)",
                color: "var(--color-text)",
              }}
              placeholder="Username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border-strong)")}
            />
            <input
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "var(--color-surface-hover)",
                border: "1px solid var(--color-border-strong)",
                color: "var(--color-text)",
              }}
              type="password"
              placeholder="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border-strong)")}
            />

            {mode === "register" && (
              <div className="space-y-3 slide-up">
                <input
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    background: "var(--color-surface-hover)",
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--color-text)",
                  }}
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border-strong)")}
                />
                <input
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    background: "var(--color-surface-hover)",
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--color-text)",
                  }}
                  type="tel"
                  placeholder="Mobile number (e.g. 91234567)"
                  autoComplete="tel"
                  maxLength={8}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
                  disabled={isLoading}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border-strong)")}
                />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p
              ref={statusRef}
              tabIndex={-1}
              aria-live="assertive"
              className="text-sm mt-4 py-3 px-4 rounded-xl outline-none fade-in"
              style={{
                background: "var(--color-danger-bg)",
                border: "1px solid var(--color-danger)",
                color: "var(--color-text)",
              }}
            >
              {error}
            </p>
          )}

          {/* Loading */}
          {isLoading && (
            <p
              aria-live="polite"
              className="text-sm mt-4 py-3 px-4 rounded-xl fade-in flex items-center justify-center gap-2"
              style={{
                background: "rgba(37, 99, 235, 0.1)",
                border: "1px solid rgba(37, 99, 235, 0.3)",
                color: "var(--color-text)",
              }}
            >
              <span className="spinner-modern inline-block" />
              Connecting securely...
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-5 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200"
            style={{
              background: "var(--color-accent)",
              opacity: isLoading ? 0.5 : 1,
              color: "#ffffff",
            }}
          >
            {isLoading
              ? "Please wait..."
              : mode === "login"
              ? "Login"
              : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}