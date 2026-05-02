import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface DataColumn<T> {
  key: keyof T;
  label: string;
  render?: (row: T) => React.ReactNode;
}

export function DataTable<T extends object>({ title, description, columns, rows }: { title: string; description?: string; columns: DataColumn<T>[]; rows: T[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-start text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className="pb-3 pe-6 font-medium text-muted-foreground text-start">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={String(column.key)} className="py-4 pe-6 align-top text-start">
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

