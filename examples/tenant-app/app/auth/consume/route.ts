// The /auth/consume endpoint — redeems the one-time handle (atomic, single use)
// and sets the partitioned session cookie. Reached by a GET carrying the opaque
// code in the query string.

import { consume } from "@/lib/auth-bridge";

export const GET = (request: Request): Promise<Response> => consume(request);
