import { cn } from "@/lib/format";
import { avatarColor } from "@/lib/ui";

// An agent's own face: their photo, or their initials, in ink as an agent's
// face is everywhere (frosted white over a photo or their colour).
export function AgentAvatar({
  agent,
  size,
  className,
  decorative = false,
  light = false,
  sizes,
}: {
  agent: { full_name: string; photo_data_url: string | null };
  size: number;
  className?: string;
  // Its size in classes, for one that grows with the screen ("size-14
  // sm:size-18"), in place of the fixed `size` (still the photo's own size).
  sizes?: string;
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
        style={sizes ? undefined : { width: size, height: size }}
        className={cn("shrink-0 rounded-full object-cover", sizes, className)}
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
      style={sizes ? undefined : { width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes,
        light ? avatarColor("agent") : "bg-white/20 text-white",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
