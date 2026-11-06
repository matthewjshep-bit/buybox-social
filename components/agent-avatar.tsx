import { cn } from "@/lib/format";

export function AgentAvatar({
  agent,
  size,
  className,
  decorative = false,
  light = false,
}: {
  agent: { full_name: string; photo_data_url: string | null };
  size: number;
  className?: string;
  // Their name is right beside it, so a screen reader needn't hear it twice.
  decorative?: boolean;
  // On a white card, rather than over a photo or the brand colour.
  light?: boolean;
}) {
  if (agent.photo_data_url) {
    return (
      // A small resized photo stored inline, so next/image has nothing to add.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agent.photo_data_url}
        alt={decorative ? "" : agent.full_name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  const initials = agent.full_name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        light ? "bg-brand" : "bg-white/20",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
