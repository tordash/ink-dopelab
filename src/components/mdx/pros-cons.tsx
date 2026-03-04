import { Check, X } from "lucide-react";

interface ProsConsProps {
  pros: string[];
  cons: string[];
}

export function ProsCons({ pros, cons }: ProsConsProps) {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      {/* Pros */}
      <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-5">
        <h4 className="mb-3 flex items-center gap-2 font-semibold text-[#22C55E]">
          <Check className="h-5 w-5" />
          Pros
        </h4>
        <ul className="space-y-2">
          {pros.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Cons */}
      <div className="rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/5 p-5">
        <h4 className="mb-3 flex items-center gap-2 font-semibold text-[#EF4444]">
          <X className="h-5 w-5" />
          Cons
        </h4>
        <ul className="space-y-2">
          {cons.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
