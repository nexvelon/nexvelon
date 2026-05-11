import type { User } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The User type is
// preserved.
//
// `currentUser` is now `User | undefined` — consumers that previously
// read it as a fake "Marcus Holloway" demo identity should either
// migrate to `useAuth().user` (the real signed-in user) or guard the
// undefined case. The dashboard greeting + a couple of mock-driven
// surfaces still read this — the build pass will flag them and they
// get optional-chained or fallback'd.
export const users: User[] = [];

export const currentUser: User | undefined = users[0];
