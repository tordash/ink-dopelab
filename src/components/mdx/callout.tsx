import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

const variants = {
  info: {
    icon: Info,
    bg: "bg-[#E8F0FE] dark:bg-[#1a2332]",
    border: "border-[#B0C4DE] dark:border-[#2a3a4a]",
    text: "text-[#1A3A5C] dark:text-[#A8C8E8]",
    iconColor: "text-[#3B82F6]",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-[#E6F4EA] dark:bg-[#1a2e1a]",
    border: "border-[#A8D5A8] dark:border-[#2a4a2a]",
    text: "text-[#1A4D2E] dark:text-[#A8D8A8]",
    iconColor: "text-[#22C55E]",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-[#FFF3E0] dark:bg-[#2e2510]",
    border: "border-[#FFCC80] dark:border-[#4a3a1a]",
    text: "text-[#5C3D1A] dark:text-[#FFD080]",
    iconColor: "text-[#F59E0B]",
  },
  danger: {
    icon: AlertCircle,
    bg: "bg-[#FDE8E8] dark:bg-[#2e1a1a]",
    border: "border-[#F5A8A8] dark:border-[#4a2a2a]",
    text: "text-[#7C1D1D] dark:text-[#F8A8A8]",
    iconColor: "text-[#EF4444]",
  },
};

interface CalloutProps {
  variant?: keyof typeof variants;
  title?: string;
  children: React.ReactNode;
}

export function Callout({
  variant = "info",
  title,
  children,
}: CalloutProps) {
  const { icon: Icon, bg, border, text, iconColor } = variants[variant];

  return (
    <div
      className={cn(
        "my-6 flex gap-3 rounded-xl border p-4",
        bg,
        border
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconColor)} />
      <div className={cn("text-sm leading-relaxed [&_a]:underline [&_a]:font-semibold [&_a]:decoration-current", text)}>
        {title && <p className="mb-1 font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
