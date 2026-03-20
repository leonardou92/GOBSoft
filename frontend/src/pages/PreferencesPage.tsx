import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function PreferencesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Apariencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Tema oscuro</p>
              <p className="text-xs text-muted-foreground">Cambiar entre tema claro y oscuro</p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Sidebar compacto</p>
              <p className="text-xs text-muted-foreground">Mostrar solo iconos en el sidebar</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Regional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Idioma</Label>
            <Select defaultValue="es">
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Zona horaria</Label>
            <Select defaultValue="vt">
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vt">Venezuela (UTC-4)</SelectItem>
                <SelectItem value="et">Eastern (UTC-5)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Notificaciones de pago</p>
              <p className="text-xs text-muted-foreground">Recibir alertas cuando se procese un pago</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Alertas de seguridad</p>
              <p className="text-xs text-muted-foreground">Notificaciones de accesos y cambios críticos</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
