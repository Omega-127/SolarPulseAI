"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      // Generate clean username from email or name
      const emailPrefix = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");
      const username = emailPrefix.length >= 3 ? emailPrefix : (name.replace(/\s+/g, "") || "user").padEnd(3, "0");

      const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email: email.trim(),
          password,
          full_name: name.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const detail = errorData?.detail;
        const errorMsg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg).join(", ")
          : detail || "Registration failed. Please try again.";
        setError(errorMsg);
        setPending(false);
        return;
      }

      setMessage("Account created successfully! You can now log in.");
      setName("");
      setEmail("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(
        "Could not connect to the backend server. Please verify that FastAPI is running on http://localhost:8000.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
        Create account
      </h1>
      <p className="mt-2 text-[color:var(--muted)]">
        Register for early access to the SolarPulse AI prototype.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Full name</span>
          <input
            className="input-field"
            type="text"
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Email</span>
          <input
            className="input-field"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Password</span>
          <input
            className="input-field"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">
            Confirm password
          </span>
          <input
            className="input-field"
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm font-medium text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}

        {message ? (
          <p
            role="status"
            className="border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2 text-sm leading-relaxed text-[color:var(--muted)]"
          >
            {message}
          </p>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Creating account…" : "Register"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[color:var(--muted)]">
        Already registered?{" "}
        <Link
          href="/login"
          className="font-semibold text-[color:var(--field)] underline-offset-2 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
