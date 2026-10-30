import {
  Car,
  Circle,
  Clapperboard,
  GraduationCap,
  HeartPulse,
  Home,
  PiggyBank,
  Receipt,
  Send,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  housing: Home,
  groceries: ShoppingBasket,
  dining: UtensilsCrossed,
  transport: Car,
  shopping: ShoppingBag,
  electronics: Smartphone,
  utilities: Zap,
  remittance: Send,
  savings: PiggyBank,
  entertainment: Clapperboard,
  health: HeartPulse,
  education: GraduationCap,
  fees: Receipt,
  income: Wallet,
  other: Circle,
};

export function CategoryIcon({
  category,
  className,
  size = "md",
}: {
  category: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = ICONS[category] ?? Circle;
  const isIncome = category === "income";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl",
        size === "md" ? "size-11" : "size-9",
        isIncome ? "bg-primary/15 text-primary" : "bg-secondary text-gold",
        className,
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} strokeWidth={1.75} />
    </span>
  );
}
