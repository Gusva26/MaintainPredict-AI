import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Mi perfil' };

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <ChangePasswordForm />
      <ExplanationFooter
        what="El cambio de contraseña de tu propio usuario."
        how="Hace falta la contraseña actual. La nueva debe cumplir la política: mínimo 10 caracteres con mayúscula, minúscula, dígito y símbolo, sin espacios."
        decision="Cámbiala si sospechas que se ha filtrado; la sesión se renueva al guardar, así que no tendrás que volver a entrar."
      />
    </div>
  );
}
