"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyableCode(props: React.HTMLAttributes<HTMLPreElement>) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = preRef.current?.textContent ?? "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative">
      <pre ref={preRef} {...props} />
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 opacity-0 backdrop-blur transition-all hover:bg-white/10 hover:text-white/80 group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
