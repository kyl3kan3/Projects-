"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { openUploadSheet } from "./UploadSheet";

/** Primary phone navigation. Center Upload is the visual anchor (thumb zone). */
export function BottomNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [account, setAccount] = useState(false);
  const onProjects = pathname === "/dashboard" || pathname.startsWith("/projects");

  return (
    <>
      <nav className="tabbar">
        <Link href="/dashboard" data-active={onProjects} aria-label="Projects">
          <span className="tab-icon">🎞️</span>
          Projects
        </Link>
        <button className="tab-cta" onClick={openUploadSheet} aria-label="New content kit">
          <span className="tab-icon">＋</span>
          <span className="sr-only">Upload</span>
        </button>
        <button onClick={() => setAccount(true)} aria-label="Account">
          <span className="tab-icon">◔</span>
          Account
        </button>
      </nav>

      <AnimatePresence>
        {account && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setAccount(false)} />
            <motion.div
              role="dialog"
              aria-label="Account"
              className="card safe-b relative z-10 rounded-b-none p-5"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-line)]" />
              <div className="text-sm text-[var(--color-muted)]">Signed in as</div>
              <div className="mb-4 font-medium">{email}</div>
              <form action="/api/auth/logout" method="post">
                <button className="btn btn-ghost btn-block">Log out</button>
              </form>
              <button onClick={() => setAccount(false)} className="btn btn-ghost btn-block mt-2">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
