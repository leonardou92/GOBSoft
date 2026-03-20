import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Información del Usuario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input defaultValue="Admin" />
            </div>
            <div className="space-y-2">
              <Label>Apellido</Label>
              <Input defaultValue="BNC" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Correo electrónico</Label>
            <Input defaultValue="admin@bnc.com" type="email" />
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input defaultValue="0412-1234567" />
          </div>
          <Button onClick={() => toast.success("Perfil actualizado (simulado)")}>Guardar cambios</Button>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cambiar Contraseña</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Contraseña actual</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Nueva contraseña</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Confirmar nueva contraseña</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <Button onClick={() => toast.success("Contraseña actualizada (simulado)")}>Actualizar contraseña</Button>
        </CardContent>
      </Card>
    </div>
  );
}
