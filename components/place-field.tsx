"use client";

import { useId } from "react";
import { cn } from "@/lib/format";
import { field } from "@/lib/ui";

// Where someone is, typed as "City, ST", with the cities homes here are in
// offered as they type (`places`), and any other city fine too.
export function PlaceField({
  value,
  onChange,
  places,
  invalid = false,
  describedBy,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  places: string[];
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={`${id}-place`} className="text-sm font-medium">
        City and state
      </label>
      <input
        id={`${id}-place`}
        list={`${id}-places`}
        autoFocus={autoFocus}
        maxLength={80}
        autoComplete="address-level2"
        placeholder="Seattle, WA"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(field(), "mt-1")}
      />
      <datalist id={`${id}-places`}>
        {places.map((place) => (
          <option key={place} value={place} />
        ))}
      </datalist>
    </>
  );
}
