import { Suspense } from 'react';
import { LoginForm } from '@/components/forms/login-form';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
