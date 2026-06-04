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

function BusIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v5h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function AuthForm({ onAuth, sessionExpiredMessage }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <div className="auth-screen">
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-bg-blob auth-bg-blob-a" />
        <div className="auth-bg-blob auth-bg-blob-b" />
        <div className="auth-bg-blob auth-bg-blob-c" />
      </div>
      <div className="auth-screen-inner">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="auth-card"
          aria-label={mode === "login" ? "Login" : "Register"}
        >
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <BusIcon />
            </div>
            <div className="auth-brand-text">
              <span className="auth-brand-kicker">derycklong</span>
              <span className="auth-brand-title">Bus Arrival Map</span>
            </div>
          </div>

          <div className="auth-header">
            <h1 className="auth-title">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="auth-subtitle">
              {mode === "login"
                ? "Log in to see your saved stops."
                : "Save your favorite stops across devices."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              disabled={isLoading}
              onClick={() => switchMode("login")}
              className={"auth-tab" + (mode === "login" ? " is-active" : "")}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              disabled={isLoading}
              onClick={() => switchMode("register")}
              className={"auth-tab" + (mode === "register" ? " is-active" : "")}
            >
              Register
            </button>
            <span
              className="auth-tab-indicator"
              aria-hidden="true"
              style={{ transform: mode === "login" ? "translateX(0%)" : "translateX(100%)" }}
            />
          </div>

          <div className="auth-fields">
            <div className="auth-field">
              <label htmlFor="auth-username" className="auth-label">Username</label>
              <input
                id="auth-username"
                className="auth-input"
                placeholder="Enter your username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password" className="auth-label">Password</label>
              <div className="auth-input-wrap">
                <input
                  id="auth-password"
                  className="auth-input auth-input-with-action"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="auth-input-action"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {mode === "register" && (
              <>
                <div className="auth-field auth-field-anim">
                  <label htmlFor="auth-email" className="auth-label">Email</label>
                  <input
                    id="auth-email"
                    className="auth-input"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="auth-field auth-field-anim">
                  <label htmlFor="auth-mobile" className="auth-label">Mobile number</label>
                  <input
                    id="auth-mobile"
                    className="auth-input"
                    type="tel"
                    placeholder="91234567"
                    autoComplete="tel"
                    maxLength={8}
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
                    disabled={isLoading}
                  />
                </div>
              </>
            )}
          </div>

          {error && (
            <p
              ref={statusRef}
              tabIndex={-1}
              aria-live="assertive"
              className="auth-error"
              role="alert"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="auth-submit"
          >
            {isLoading ? (
              <>
                <span className="auth-spinner" aria-hidden="true" />
                <span>Please wait…</span>
              </>
            ) : (
              <span>{mode === "login" ? "Login" : "Create account"}</span>
            )}
          </button>

          <p className="auth-footer">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              disabled={isLoading}
            >
              {mode === "login" ? "Create an account" : "Log in"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
