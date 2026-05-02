import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-3 text-2xl font-semibold sm:text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}
