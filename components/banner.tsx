import { BannerArt } from "@/components/banner-art";
import type { BannerChoice } from "@/lib/banner";

// The band across the top of someone's profile (and their card on the home),
// as they chose it: their own image, nothing at all (an agent's colour, plain;
// anyone else's, a quiet grey), or a drawn scene of home. It fills its box.
export function Banner({
  seed,
  brand = null,
  choice,
}: {
  // Their page's id: which scene is theirs when they haven't chosen.
  seed: string;
  // An agent's own colour.
  brand?: string | null;
  choice: BannerChoice;
}) {
  if (choice.style === "image" && choice.image) {
    // Their own small image, served as it is.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={choice.image} alt="" className="block size-full object-cover" />;
  }
  if (choice.style === "blank") {
    return <div className="size-full" style={{ backgroundColor: brand ?? "#E7E5E4" }} />;
  }
  return <BannerArt seed={seed} brand={brand} pick={choice.style === "image" ? null : choice.style || null} />;
}
