"use client";

import { createAuthClient } from "better-auth/react";

// Browser side of better-auth. Same origin, so no baseURL is needed.
export const authClient = createAuthClient();
