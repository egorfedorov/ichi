import { redirect } from "next/navigation";

/**
 * /connect, /sign-in and /settings/tokens are gone. Everything they did is a
 * command in the console — :connect, :signin, :token, :tokens, :revoke — and
 * a separate page for each was the thing that broke the promise the console
 * makes: one screen, nothing to navigate to.
 *
 * The route survives only as a redirect, because links to it exist in the
 * wild (the README, older MCP error messages, anything already shared).
 */
export default function ConnectRedirect() {
  redirect("/");
}
