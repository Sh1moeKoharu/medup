import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { ROLES, normalizeRole } from "../../lib/roles";
import { Container, Heading, Text, Button, Input, Select, Badge, Label } from "@medusajs/ui";
import { useState, useEffect } from "react";

const CUSTOMER_TYPES = [
    { value: "b2c", label: "B2C — Cliente Individual" },
    { value: "b2b", label: "B2B — Empresa / Corporativo" },
];

const CustomerMedicalWidget = ({ data: customer }: { data: any }) => {
    const [medicalData, setMedicalData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [companies, setCompanies] = useState<string[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Form state
    const [employeeNumber, setEmployeeNumber] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [customerType, setCustomerType] = useState("b2c");
    const [insurancePolicy, setInsurancePolicy] = useState("");
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Password protection state
    const [password, setPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    // Track original values to detect changes in protected fields
    const [originalEmployeeNumber, setOriginalEmployeeNumber] = useState("");
    const [originalInsurancePolicy, setOriginalInsurancePolicy] = useState("");
    const [isAuditor, setIsAuditor] = useState(false);

    useEffect(() => {
        if (!customer?.id) return;
        loadData();

        // Fetch current logged in admin user
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.user) {
                    setCurrentUser(data.user);
                    if (normalizeRole(data.user.metadata?.role) === ROLES.AUDITOR) {
                        setIsAuditor(true);
                    }
                }
            })
            .catch(err => console.error("Error fetching admin user", err));
    }, [customer?.id]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load medical data for this customer
            const res = await fetch(`/admin/medical-customers/${customer.id}`);
            if (res.ok) {
                const data = await res.json();
                const mc = data.medical_customer;
                if (mc) {
                    setMedicalData(mc);
                    setEmployeeNumber(mc.employee_number || "");
                    setCompanyName(mc.company_name || customer?.company_name || "");
                    setCustomerType(mc.customer_type || "b2c");
                    setInsurancePolicy(mc.insurance_policy || "");
                    // Store originals for comparison
                    setOriginalEmployeeNumber(mc.employee_number || "");
                    setOriginalInsurancePolicy(mc.insurance_policy || "");
                } else {
                    // No medical data yet — sync company from native customer field
                    setCompanyName(customer?.company_name || "");
                }
            } else {
                // Fallback: sync company from native customer field
                setCompanyName(customer?.company_name || "");
            }

            // Load companies list for suggestions
            const compRes = await fetch(`/admin/medical-customers`);
            if (compRes.ok) {
                const compData = await compRes.json();
                setCompanies(compData.companies || []);
            }
        } catch (err) {
            console.error("Error loading medical customer data:", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Check if protected fields have changed
    const protectedFieldsChanged = () => {
        const empChanged = (employeeNumber || "") !== (originalEmployeeNumber || "");
        const polChanged = (insurancePolicy || "") !== (originalInsurancePolicy || "");
        return empChanged || polChanged;
    };

    const handleAuthenticate = async () => {
        if (!currentUser) {
            setPasswordError("No se pudo identificar al usuario. Refresca la página.");
            return;
        }
        setIsAuthenticating(true);
        setPasswordError("");

        try {
            const authRes = await fetch(`/auth/user/emailpass`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: currentUser.email,
                    password: password,
                }),
            });

            if (!authRes.ok) {
                setPasswordError("Contraseña incorrecta. Inténtalo de nuevo.");
                setIsAuthenticating(false);
                return;
            }

            setIsAuthenticated(true);
            setPasswordError("");
        } catch (err) {
            setPasswordError("Error de conexión al verificar contraseña.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleSave = async () => {
        // If protected fields changed and not authenticated, block save
        if (protectedFieldsChanged() && !isAuthenticated) {
            setPasswordError("Debes autenticarte para modificar Número de Empleado o Póliza.");
            return;
        }

        setIsSaving(true);
        setSaveSuccess(false);
        try {
            // Save medical customer data
            const res = await fetch(`/admin/medical-customers/${customer.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employee_number: employeeNumber || null,
                    company_name: companyName || null,
                    customer_type: customerType,
                    insurance_policy: insurancePolicy || null,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMedicalData(data.medical_customer);
                setOriginalEmployeeNumber(employeeNumber);
                setOriginalInsurancePolicy(insurancePolicy);

                // Sync company_name to the native Medusa customer field
                try {
                    await fetch(`/admin/customers/${customer.id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            company_name: companyName || "",
                        }),
                    });
                } catch (syncErr) {
                    console.warn("Could not sync company_name to customer:", syncErr);
                }

                setIsEditing(false);
                setIsAuthenticated(false);
                setPassword("");
                setSaveSuccess(true);
                // Reload companies list
                const compRes = await fetch(`/admin/medical-customers`);
                if (compRes.ok) {
                    const compData = await compRes.json();
                    setCompanies(compData.companies || []);
                }
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                const errData = await res.json();
                alert("Error al guardar: " + (errData.error || "Error desconocido"));
            }
        } catch (err) {
            console.error("Error saving medical customer:", err);
            alert("Error de conexión al guardar datos del cliente.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEditing = () => {
        setIsEditing(true);
        setIsAuthenticated(false);
        setPassword("");
        setPasswordError("");
    };

    const handleCancelEditing = () => {
        setIsEditing(false);
        setIsAuthenticated(false);
        setPassword("");
        setPasswordError("");
        // Reset to saved values
        if (medicalData) {
            setEmployeeNumber(medicalData.employee_number || "");
            setCompanyName(medicalData.company_name || customer?.company_name || "");
            setCustomerType(medicalData.customer_type || "b2c");
            setInsurancePolicy(medicalData.insurance_policy || "");
        }
    };

    if (isLoading) {
        return (
            <Container className="p-6 mb-4 mt-4">
                <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-ui-fg-base"></div>
                    <Text className="text-ui-fg-subtle text-sm">Cargando datos del cliente...</Text>
                </div>
            </Container>
        );
    }

    const isB2B = customerType === "b2b";

    // Whether the employee number or insurance_policy fields should be locked
    const protectedFieldsLocked = !isAuthenticated;

    return (
        <Container className="p-6 mb-4 mt-4 bg-ui-bg-subtle rounded-lg border border-ui-border-strong shadow-sm">
            <div className="flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div>
                            <Heading level="h2" className="text-ui-fg-base text-lg font-bold">
                                Datos Corporativos del Cliente
                            </Heading>
                            <Text className="text-ui-fg-subtle text-sm mt-0.5">
                                Número de empleado, empresa y tipo de cliente
                            </Text>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {medicalData && !isEditing && (
                            <Badge
                                color={customerType === "b2b" ? "blue" : "green"}
                                size="small"
                            >
                                {customerType === "b2b" ? "Empresa" : "Individual"}
                            </Badge>
                        )}
                        {!isEditing && !isAuditor ? (
                            <Button variant="secondary" size="small" onClick={handleStartEditing}>
                                {medicalData ? "Editar" : "Agregar Datos"}
                            </Button>
                        ) : isEditing ? (
                            <Button variant="secondary" size="small" onClick={handleCancelEditing}>
                                Cancelar
                            </Button>
                        ) : null}
                    </div>
                </div>

                {saveSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-ui-tag-green-bg rounded-md border border-ui-tag-green-border">
                        <Text className="text-ui-tag-green-text text-sm font-medium">
                            Datos guardados correctamente
                        </Text>
                    </div>
                )}

                {/* Display mode */}
                {!isEditing && medicalData && (
                    <div className="grid grid-cols-2 gap-4 border-t border-ui-border-base pt-4">
                        <div>
                            <Text className="text-ui-fg-muted text-xs uppercase tracking-wider font-semibold mb-1">
                                Número de Empleado
                            </Text>
                            <Text className="text-ui-fg-base text-sm font-medium">
                                {medicalData.employee_number || "—"}
                            </Text>
                        </div>
                        <div>
                            <Text className="text-ui-fg-muted text-xs uppercase tracking-wider font-semibold mb-1">
                                Empresa
                            </Text>
                            <Text className="text-ui-fg-base text-sm font-medium">
                                {medicalData.company_name || "—"}
                            </Text>
                        </div>
                        <div>
                            <Text className="text-ui-fg-muted text-xs uppercase tracking-wider font-semibold mb-1">
                                Tipo de Cliente
                            </Text>
                            <Text className="text-ui-fg-base text-sm font-medium">
                                {customerType === "b2b" ? "B2B — Empresa" : "B2C — Individual"}
                            </Text>
                        </div>
                        <div>
                            <Text className="text-ui-fg-muted text-xs uppercase tracking-wider font-semibold mb-1">
                                Póliza / Convenio
                            </Text>
                            <Text className="text-ui-fg-base text-sm font-medium">
                                {medicalData.insurance_policy || "—"}
                            </Text>
                        </div>
                    </div>
                )}

                {/* Display mode — no data yet */}
                {!isEditing && !medicalData && (
                    <div className="border-t border-ui-border-base pt-4">
                        <Text className="text-ui-fg-muted text-sm italic">
                            Este cliente no tiene datos corporativos registrados. Haz clic en "Agregar Datos" para configurarlos.
                        </Text>
                    </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                    <div className="flex flex-col gap-4 border-t border-ui-border-base pt-4">
                        {/* Customer type selector */}
                        <div>
                            <Label className="text-sm font-medium text-ui-fg-base mb-1.5" htmlFor="customer-type">
                                Tipo de Cliente
                            </Label>
                            <Select value={customerType} onValueChange={setCustomerType}>
                                <Select.Trigger id="customer-type">
                                    <Select.Value placeholder="Selecciona tipo de cliente" />
                                </Select.Trigger>
                                <Select.Content>
                                    {CUSTOMER_TYPES.map((ct) => (
                                        <Select.Item key={ct.value} value={ct.value}>
                                            {ct.label}
                                        </Select.Item>
                                    ))}
                                </Select.Content>
                            </Select>
                        </div>

                        {/* Company Name — no password required */}
                        <div>
                            <Label className="text-sm font-medium text-ui-fg-base mb-1.5" htmlFor="company-name">
                                Empresa
                            </Label>
                            <Input
                                id="company-name"
                                placeholder="Ej: Hospital Ángeles"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                list="company-suggestions"
                            />
                            {/* HTML datalist for company suggestions */}
                            <datalist id="company-suggestions">
                                {companies.map((c) => (
                                    <option key={c} value={c} />
                                ))}
                            </datalist>
                            <Text className="text-ui-fg-muted text-xs mt-1">
                                Sincronizado con el campo Compañía del cliente. Se actualiza en ambos lugares al guardar.
                            </Text>
                        </div>

                        {/* Protected fields section */}
                        <div className="flex flex-col gap-3 p-4 rounded-lg border border-ui-border-strong bg-ui-bg-base">
                            <div className="flex items-center gap-2 mb-1">
                                <Text className="text-sm font-semibold text-ui-fg-base">
                                    Campos Protegidos
                                </Text>
                                {isAuthenticated && (
                                    <Badge color="green" size="small">Desbloqueado</Badge>
                                )}
                            </div>
                            <Text className="text-ui-fg-muted text-xs">
                                Los campos de Número de Empleado y Póliza requieren autenticación con contraseña para ser modificados.
                            </Text>

                            {/* Password authentication for protected fields */}
                            {!isAuthenticated && (
                                <div className="flex flex-col gap-2 p-3 rounded-md border border-ui-border-base bg-ui-bg-subtle">
                                    <Text className="text-sm text-ui-fg-subtle">
                                        Ingresa tu contraseña de administrador ({currentUser?.email || "Cargando..."}) para desbloquear estos campos:
                                    </Text>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 max-w-[300px]">
                                            <Input
                                                type="password"
                                                placeholder="Contraseña de administrador"
                                                value={password}
                                                onChange={(e) => {
                                                    setPassword(e.target.value);
                                                    if (passwordError) setPasswordError("");
                                                }}
                                                disabled={!currentUser || isAuthenticating}
                                            />
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="small"
                                            onClick={handleAuthenticate}
                                            isLoading={isAuthenticating}
                                            disabled={!currentUser || !password}
                                        >
                                            Desbloquear
                                        </Button>
                                    </div>
                                    {passwordError && (
                                        <Text className="text-ui-fg-error text-xs">{passwordError}</Text>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {/* Employee Number — protected */}
                                <div>
                                    <Label className="text-sm font-medium text-ui-fg-base mb-1.5" htmlFor="employee-number">
                                        Número de Empleado
                                    </Label>
                                    <Input
                                        id="employee-number"
                                        placeholder="Ej: EMP-12345"
                                        value={employeeNumber}
                                        onChange={(e) => setEmployeeNumber(e.target.value)}
                                        disabled={protectedFieldsLocked}
                                    />
                                    <Text className="text-ui-fg-muted text-xs mt-1">
                                        Identificador del empleado en su empresa
                                    </Text>
                                </div>

                                {/* Insurance / Policy — protected */}
                                <div>
                                    <Label className="text-sm font-medium text-ui-fg-base mb-1.5" htmlFor="insurance-policy">
                                        Póliza / Convenio
                                    </Label>
                                    <Input
                                        id="insurance-policy"
                                        placeholder="Ej: HOSP-CORP-998"
                                        value={insurancePolicy}
                                        onChange={(e) => setInsurancePolicy(e.target.value)}
                                        disabled={protectedFieldsLocked}
                                    />
                                    <Text className="text-ui-fg-muted text-xs mt-1">
                                        Número de póliza o convenio corporativo
                                    </Text>
                                </div>
                            </div>
                        </div>

                        {/* Save */}
                        <div className="flex justify-end pt-2">
                            <Button
                                variant="primary"
                                size="base"
                                onClick={handleSave}
                                isLoading={isSaving}
                                disabled={isSaving}
                            >
                                {medicalData ? "Guardar Cambios" : "Registrar Datos"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Container>
    );
};

export const config = defineWidgetConfig({
    zone: "customer.details.after",
});

export default CustomerMedicalWidget;
