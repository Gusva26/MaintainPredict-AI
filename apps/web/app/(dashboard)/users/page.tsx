import { UserList } from '@/components/users/UserList';
import { ExplanationFooter } from '@/components/ExplanationFooter';

export const metadata = { title: 'Usuarios' };

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <UserList />
      <ExplanationFooter
        what="Las cuentas del sistema con su rol, su estado y su último acceso."
        how="El rol determina la matriz de permisos (RBAC): técnico, supervisor, planificador y administrador. El estado procede de is_active; desactivar impide el login pero conserva el histórico."
        decision="Desactivar en lugar de borrar: las órdenes y la auditoría mantienen la referencia al usuario, así que borrarlo rompería el histórico. No puedes desactivarte ni cambiarte el rol a ti mismo: pídeselo a otro administrador."
      />
    </div>
  );
}
