import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

const variants = {
  info: {
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-300",
    iconColor: "text-blue-500",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    text: "text-green-800 dark:text-green-300",
    iconColor: "text-green-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-300",
    iconColor: "text-amber-500",
  },
  danger: {
    icon: AlertCircle,
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-800 dark:text-red-300",
    iconColor: "text-red-500",
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
      <div className={cn("text-sm leading-relaxed", text)}>
        {title && <p className="mb-1 font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
