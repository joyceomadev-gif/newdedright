import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props { title: string; description: string; }

export function ModulePlaceholder({ title, description }: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <Card className="p-12 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <Construction className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
        <p className="text-sm text-muted-foreground">This module is being built. The database is ready — UI coming next.</p>
      </Card>
    </div>
  );
}
