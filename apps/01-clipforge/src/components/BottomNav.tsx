"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { openUploadSheet } from "./UploadSheet";
import { IconFilm, IconPlus, IconUser } from "./icons";

/** Primary phone navigation. Center action is a paper circle (DESIGN.md). */
export function BottomNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [account, setAccount] = useState(false);
  const onProjects = pathname === "/dashboard" || pathname.startsWith("/projects");

  return (
    <>
      <nav className="tabbar">
        <Link href="/dashboard" data-active={onProjects} aria-label="Projects">
          <IconFilm size={22} />
          Projects
        </Link>
        <button className="tab-cta" onClick={openUploadSheet} aria-label="New content kit">
          <span className="tab-ic">
            <IconPlus size={22} />
          </span>
        </button>
        <button onClick={() => setAccount(true)} aria-label="Account">
          <IconUser size={22} />
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
              style={{ borderRadius: "20px 20px 0 0" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-line)]" />
              <div className="t-label">Signed in as</div>
              <div className="t-title mb-4 mt-1">{email}</div>
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
