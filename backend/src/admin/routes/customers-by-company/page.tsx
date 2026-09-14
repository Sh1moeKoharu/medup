// Efecto: traduce el vocabulario de tienda de Medusa ("Clientes") al de
// clinica ("Pacientes"). No se usa nada de este modulo; el import ES el efecto.
// Va en dos paginas a proposito, para que siga aplicandose si una desaparece.
import "../../lib/vocabulario-clinico";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Select, Table, Badge, Input } from "@medusajs/ui";
import { useState, useEffect } from "react";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

const CustomersByCompanyPage = () => {
    const [customers, setCustomers] = useState<any[]>([]);
    const [companies, setCompanies] = useState<string[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<string>("__all__");
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/admin/medical-customers`);
            if (esDenegado(res)) { setDenegado(true); return; }
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
        const company = c.medical_customer?.company_name || "Sin empresa";
        if (!acc[company]) acc[company] = [];
        acc[company].push(c);
        return acc;
    }, {});

    if (denegado) return <SinAcceso recurso="los pacientes por empresa" />;

    return (
        <Container className="p-8">
            <div className="flex flex-col gap-6">
                {/* Header */}
                <div>
                    <Heading level="h1" className="text-ui-fg-base text-2xl font-bold">
                        Pacientes por empresa
                    </Heading>
                    <Text className="text-ui-fg-subtle text-sm mt-1">
                        Visualiza y filtra los pacientes registrados por su empresa y número de empleado
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
                        <Text className="text-sm font-medium text-ui-fg-base mb-1.5">Filtrar por empresa</Text>
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
                        <Text className="text-ui-fg-subtle">Cargando pacientes...</Text>
                    </div>
                ) : filtered.length === 0 ? (
                    <Container className="p-8 text-center">
                        <Text className="text-ui-fg-muted text-lg">No se encontraron pacientes con los filtros seleccionados</Text>
                    </Container>
                ) : (
                    Object.entries(grouped).sort(([a], [b]) => {
                        if (a === "Sin empresa") return 1;
                        if (b === "Sin empresa") return -1;
                        return a.localeCompare(b);
                    }).map(([company, custs]) => (
                        <Container key={company} className="p-0 rounded-lg border border-ui-border-base overflow-hidden">
                            {/* Company header */}
                            <div className="px-6 py-4 bg-ui-bg-subtle border-b border-ui-border-base flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{company === "Sin empresa" ? "" : ""}</span>
                                    <Heading level="h2" className="text-ui-fg-base text-base font-semibold">
                                        {company}
                                    </Heading>
                                </div>
                                <Badge color={company === "Sin empresa" ? "grey" : "blue"} size="small">
                                    {(custs as any[]).length} {(custs as any[]).length === 1 ? "paciente" : "pacientes"}
                                </Badge>
                            </div>

                            {/* Customers table */}
                            <div style={{ overflowX: "auto", width: "100%" }}>
                                {/* Scroll horizontal: la tabla es mas ancha que una tableta en vertical y,
                                    sin este contenedor, las columnas de la derecha se recortan sin manera
                                    de llegar a ellas. */}
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
                            </div>
                        </Container>
                    ))
                )}
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Pacientes por empresa",
    icon: undefined,
});

export default CustomersByCompanyPage;
