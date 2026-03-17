"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

export function Newsletter() {
  const t = useTranslations("newsletter");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      // Store in Google Sheet via Apps Script web app (simple, free)
      // For now, open LINE OA as fallback — replace with actual endpoint later
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="mx-auto my-12 max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-6 text-center sm:p-8">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)]/10">
        <Mail className="h-6 w-6 text-[var(--color-accent)]" />
      </div>
      <h3 className="mb-2 text-lg font-bold text-[var(--color-text-primary)]">
        {t("title")}
      </h3>
      <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
        {t("description")}
      </p>

      {status === "success" ? (
        <p className="text-sm font-medium text-green-600 dark:text-green-400">
          {t("success")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("placeholder")}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#1A1A1A] transition-opacity hover:opacity-90"
          >
            {t("button")}
          </button>
        </form>
      )}
      {status === "error" && (
        <p className="mt-2 text-xs text-red-500">{t("error")}</p>
      )}
    </section>
  );
}
