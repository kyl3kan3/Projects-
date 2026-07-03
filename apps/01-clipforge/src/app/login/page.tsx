import { AuthForm } from "../(auth)/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
