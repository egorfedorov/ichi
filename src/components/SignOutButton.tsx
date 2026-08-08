"use client";

import { authClient } from "@/lib/auth-client";

/**
 * The way out. An anchor with a full reload on purpose: it drops every piece
 * of client state belonging to the session that just ended.
 */
export default function SignOutButton() {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/"
      onClick={(e) => {
        e.preventDefault();
        void authClient.signOut().finally(() => {
          window.location.href = "/";
        });
      }}
      className="cursor-pointer text-sm text-snow-3 transition-colors hover:text-snow"
    >
      Sign out
    </a>
  );
}
