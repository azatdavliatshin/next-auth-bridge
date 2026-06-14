// The /auth/bridge endpoint — mints a one-time opaque handle after the package's
// session gate confirms a real session. The popup fetches this with a GET; POST
// is wired too so the handler is reachable either way (the package handler reads
// the request the same way regardless of method).

import { bridge } from "@/lib/auth-bridge";

export const GET = (request: Request): Promise<Response> => bridge(request);
export const POST = (request: Request): Promise<Response> => bridge(request);
