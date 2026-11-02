import { cn } from "@/lib/format";

export function AgentAvatar({
  agent,
  size,
  className,
}: {
  agent: { full_name: string; photo_data_url: string | null };
  size: number;
  className?: string;
}) {
  if (agent.photo_data_url) {
    return (
      // A small resized photo stored inline, so next/image has nothing to add.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agent.photo_data_url}
        alt={agent.full_name}
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
        "flex shrink-0 items-center justify-center rounded-full bg-white/20 font-semibold text-white",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
