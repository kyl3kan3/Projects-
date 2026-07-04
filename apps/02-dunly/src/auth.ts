import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { serverEnv } from "./lib/env";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      name: { label: "Name", type: "text" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email : "owner@northstarbilling.com";
      const name = typeof credentials?.name === "string" ? credentials.name : "Dunly Demo";

      return {
        id: email,
        email,
        name,
      };
    },
  }),
];

if (serverEnv.authGoogleId && serverEnv.authGoogleSecret) {
  providers.push(
    Google({
      clientId: serverEnv.authGoogleId,
      clientSecret: serverEnv.authGoogleSecret,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: serverEnv.authSecret,
  trustHost: true,
  providers,
  session: {
    strategy: "jwt",
  },
});
