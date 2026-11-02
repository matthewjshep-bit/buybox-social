"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// A route shown over the page that opened it. Closing goes back, so the URL and
// the browser's back button stay in step with what's on screen.
export function Modal({ label, children }: { label: string; children: ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        router.back();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) router.back();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-transparent p-0 backdrop:bg-black/60 sm:px-6 sm:py-8"
    >
      <div className="relative mx-auto min-h-full max-w-5xl overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-2xl">
        <button
          type="button"
          aria-label="Close"
          onClick={() => router.back()}
          className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/95 text-stone-900 shadow"
        >
          <X aria-hidden size={22} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
