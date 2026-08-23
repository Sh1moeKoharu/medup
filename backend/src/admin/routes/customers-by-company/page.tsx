import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Select, Table, Badge, Input } from "@medusajs/ui";
import { useState, useEffect } from "react";

const CustomersByCompanyPage = () => {
    const [customers, setCustomers] = useState<any[]>([]);
    const [companies, setCompanies] = useState<string[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<string>("__all__");
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/admin/medical-customers`);
            if (res.ok) {
                const data = await res.json();
                setCustomers(data.medical_customers || []);
                setCompanies(data.companies || []);
            }
        } catch (err) {
            console.error("Error loading customers:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const filtered = customers.filter((c) => {
        // Company filter
        if (selectedCompany !== "__all__") {
            if (selectedCompany === "__none__") {
                if (c.medical_customer?.company_name) return false;
            } else {
                if (c.medical_customer?.company_name !== selectedCompany) return false;
            }
        }

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().includes(term);
            const matchEmail = (c.email || "").toLowerCase().includes(term);
            const matchEmployee = (c.medical_customer?.employee_number || "").toLowerCase().includes(term);
            if (!matchName && !matchEmail && !matchEmployee) return false;
        }

        return true;
    });

    // Group by company
    const grouped = filtered.reduce((acc: Record<string, any[]>, c: any) => {
        const company = c.medical_customer?.company_name || "Sin Empresa";
        if (!acc[company]) acc[company] = [];
        acc[company].push(c);
        return acc;
    }, {});

    return (
        <Container className="p-8">
            <div className="flex flex-col gap-6">
                {/* Header */}
                <div>
                    <Heading level="h1" className="text-ui-fg-base text-2xl font-bold">
                        Clientes por Empresa
                    </Heading>
                    <Text className="text-ui-fg-subtle text-sm mt-1">
                        Visualiza y filtra los clientes registrados por su empresa y número de empleado
                    </Text>
                </div>

                {/* Filters */}
                <div className="flex items-end gap-4">
                    <div className="flex-1 max-w-[300px]">
                        <Text className="text-sm font-medium text-ui-fg-base mb-1.5">Buscar</Text>
                        <Input
                            placeholder="Nombre, correo o # empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 max-w-[300px]">
                        <Text className="text-sm font-medium text-ui-fg-base mb-1.5">Filtrar por Empresa</Text>
                        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                            <Select.Trigger>
                                <Select.Value placeholder="Todas las empresas" />
                            </Select.Trigger>
                            <Select.Content>
                                <Select.Item value="__all__">Todas las empresas</Select.Item>
                                <Select.Item value="__none__">Sin empresa asignada</Select.Item>
                                {companies.map((comp) => (
                                    <Select.Item key={comp} value={comp}>
                                        {comp}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center gap-2 py-8">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-ui-fg-base"></div>
                        <Text className="text-ui-fg-subtle">Cargando clientes...</Text>
                    </div>
                ) : filtered.length === 0 ? (
                    <Container className="p-8 text-center">
                        <Text className="text-ui-fg-muted text-lg">No se encontraron clientes con los filtros seleccionados</Text>
                    </Container>
                ) : (
                    Object.entries(grouped).sort(([a], [b]) => {
                        if (a === "Sin Empresa") return 1;
                        if (b === "Sin Empresa") return -1;
                        return a.localeCompare(b);
                    }).map(([company, custs]) => (
                        <Container key={company} className="p-0 rounded-lg border border-ui-border-base overflow-hidden">
                            {/* Company header */}
                            <div className="px-6 py-4 bg-ui-bg-subtle border-b border-ui-border-base flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{company === "Sin Empresa" ? "" : ""}</span>
                                    <Heading level="h2" className="text-ui-fg-base text-base font-semibold">
                                        {company}
                                    </Heading>
                                </div>
                                <Badge color={company === "Sin Empresa" ? "grey" : "blue"} size="small">
                                    {(custs as any[]).length} {(custs as any[]).length === 1 ? "cliente" : "clientes"}
                                </Badge>
                            </div>

                            {/* Customers table */}
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Nombre</Table.HeaderCell>
                                        <Table.HeaderCell>Email</Table.HeaderCell>
                                        <Table.HeaderCell>Teléfono</Table.HeaderCell>
                                        <Table.HeaderCell># Empleado</Table.HeaderCell>
                                        <Table.HeaderCell>Tipo</Table.HeaderCell>
                                        <Table.HeaderCell>Póliza</Table.HeaderCell>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {(custs as any[]).map((c: any) => (
                                        <Table.Row
                                            key={c.id}
                                            className="cursor-pointer hover:bg-ui-bg-subtle-hover"
                                            onClick={() => window.location.href = `/app/customers/${c.id}`}
                                        >
                                            <Table.Cell className="font-medium">
                                                {c.first_name} {c.last_name}
                                            </Table.Cell>
                                            <Table.Cell className="text-ui-fg-subtle">
                                                {c.email || "—"}
                                            </Table.Cell>
                                            <Table.Cell className="text-ui-fg-subtle">
                                                {c.phone || "—"}
                                            </Table.Cell>
                                            <Table.Cell>
                                                {c.medical_customer?.employee_number ? (
                                                    <Badge color="purple" size="small">
                                                        {c.medical_customer.employee_number}
                                                    </Badge>
                                                ) : (
                                                    <Text className="text-ui-fg-muted">—</Text>
                                                )}
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Badge
                                                    color={c.medical_customer?.customer_type === "b2b" ? "blue" : "green"}
                                                    size="small"
                                                >
                                                    {c.medical_customer?.customer_type === "b2b" ? "Empresa" : "Individual"}
                                                </Badge>
                                            </Table.Cell>
                                            <Table.Cell className="text-ui-fg-subtle">
                                                {c.medical_customer?.insurance_policy || "—"}
                                            </Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        </Container>
                    ))
                )}
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Clientes por Empresa",
    icon: undefined,
});

export default CustomersByCompanyPage;
