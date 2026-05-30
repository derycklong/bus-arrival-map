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

const INLINE_STYLES = {
  page: {
    background: "var(--color-bg)",
    color: "var(--color-text)",
  },
  card: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.16)",
  },
  headerTitle: {
    color: "var(--color-text)",
  },
  subtitle: {
    color: "var(--color-text-secondary)",
  },
  tabActive: {
    background: "var(--color-accent)",
    color: "#ffffff",
  },
  tabInactive: {
    background: "var(--color-surface-hover)",
    color: "var(--color-text-secondary)",
  },
  input: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border-strong)",
    color: "var(--color-text)",
  },
  inputFocus: {
    borderColor: "var(--color-accent)",
  },
  errorBox: {
    background: "rgba(220, 38, 38, 0.12)",
    border: "1px solid rgba(220, 38, 38, 0.4)",
    color: "var(--color-text)",
  },
  submit: {
    background: "var(--color-accent)",
    color: "#ffffff",
  },
  submitDisabled: {
    background: "var(--color-accent)",
    opacity: 0.5,
    color: "#ffffff",
  },
};

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
    <div
      className="auth-screen fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div className="auth-screen-inner flex items-center justify-center px-4 py-6">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="w-full max-w-[380px] rounded-2xl p-8 text-center"
          style={INLINE_STYLES.card}
        >
          <h1 className="text-xl mb-1 font-bold" style={{ color: "var(--color-text)" }}>
            Bus Arrival Map
          </h1>
          <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>
            derycklong
          </p>
          <p className="text-base mb-1 font-medium" style={{ color: "var(--color-text)" }}>
            {title}
          </p>
          <p className="text-sm mb-5" style={{ color: "var(--color-text-secondary)" }}>
            {subtitle}
          </p>

          <div className="flex mb-4 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
            <button
              type="button"
              aria-pressed={mode === "login"}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm font-semibold transition-colors"
              style={mode === "login" ? INLINE_STYLES.tabActive : INLINE_STYLES.tabInactive}
              onClick={() => switchMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm font-semibold transition-colors"
              style={mode === "register" ? INLINE_STYLES.tabActive : INLINE_STYLES.tabInactive}
              onClick={() => switchMode("register")}
            >
              Register
            </button>
          </div>

          <input
            className="w-full mb-3 px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={INLINE_STYLES.input}
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
          />
          <input
            className="w-full mb-3 px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={INLINE_STYLES.input}
            type="password"
            placeholder="Password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />

          {mode === "register" && (
            <>
              <input
                className="w-full mb-3 px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={INLINE_STYLES.input}
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
              <input
                className="w-full mb-3 px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={INLINE_STYLES.input}
                type="tel"
                placeholder="Mobile number (e.g. 91234567)"
                autoComplete="tel"
                maxLength={8}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
                disabled={isLoading}
              />
            </>
          )}

          {error && (
            <p
              ref={statusRef}
              tabIndex={-1}
              aria-live="assertive"
              className="text-sm mb-3 py-3 px-3 rounded-lg outline-none"
              style={INLINE_STYLES.errorBox}
            >
              {error}
            </p>
          )}

          {isLoading && (
            <p
              aria-live="polite"
              className="text-sm mb-3 py-3 px-3 rounded-lg"
              style={{
                background: "rgba(37, 99, 235, 0.12)",
                border: "1px solid rgba(37, 99, 235, 0.4)",
                color: "var(--color-text)",
              }}
            >
              Connecting securely...
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity cursor-pointer"
            style={isLoading ? INLINE_STYLES.submitDisabled : INLINE_STYLES.submit}
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
