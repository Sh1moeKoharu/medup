import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Table, Badge, Button, Input, Select } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ALL_ROLES, ROLES, ROLE_LABELS, normalizeRole, roleLabel } from "../../../lib/roles";
import { aUsuario } from "../../../lib/usuarios";
import { CLAVE_CORREO_AVISO, estaBloqueado, numeroDeEmpleado } from "../../../lib/personal";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

const StaffPage = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isAuditor, setIsAuditor] = useState(false);
    
    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);

    // Form states
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [employeeNumber, setEmployeeNumber] = useState("");
    const [notificationEmail, setNotificationEmail] = useState("");
    // Vacio a proposito: el rol se ELIGE, no se hereda. Ver resetForm().
    const [role, setRole] = useState<string>("");

    // Removed useToast

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/admin/staff", { credentials: "include" });
            if (esDenegado(res)) { setDenegado(true); return; }
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            }
        } catch (err) {
            console.error("Error fetching staff:", err);
            alert("Error al cargar la lista de personal.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (normalizeRole(data?.user?.metadata?.role) === ROLES.AUDITOR) {
                    setIsAuditor(true);
                }
            })
            .catch(err => console.error("Failed to fetch current user", err));
    }, []);

    const resetForm = () => {
        setEmail("");
        setPassword("");
        setFirstName("");
        setLastName("");
        setEmployeeNumber("");
        setNotificationEmail("");
        // ── EL ROL NO TIENE VALOR POR OMISIÓN ────────────────────────────
        //
        // Antes esto era `setRole(ROLES.CASHIER)`, y como handleOpenCreate()
        // llama a resetForm() antes de abrir, el diálogo aparecía SIEMPRE con
        // "Caja / Recepción" ya seleccionado. Quien rellenaba correo, contraseña
        // y nombre sin bajar la vista a ese campo daba de alta un cajero
        // creyendo que creaba un médico — y el sistema no avisaba, porque el
        // campo técnicamente sí traía valor.
        //
        // El tester lo reportó como "todos los usuarios entran a la vista del
        // POS": era cierto, todos quedaban como caja.
        //
        // Ojo con la historia, porque explica por qué se llegó aquí: el valor
        // original era "cajero", un alias heredado que no coincide con ninguna
        // opción del desplegable (se generan desde ALL_ROLES, en inglés), así
        // que el control se quedaba en su texto de ayuda. Eso ERA un bug, pero
        // disimulaba éste. Al canonizarlo a "cashier" el desplegable empezó a
        // mostrar una elección que nadie había hecho.
        //
        // Vacío + validación en handleSubmit: hay que elegirlo a propósito.
        setRole("");
        setEditingUser(null);
    };

    const handleOpenCreate = () => {
        resetForm();
        setShowModal(true);
    };

    const handleOpenEdit = (user: any) => {
        resetForm();
        setEditingUser(user);
        setFirstName(user.first_name || "");
        setLastName(user.last_name || "");
        setEmployeeNumber(numeroDeEmpleado(user) ?? "");
        setNotificationEmail(String(user.metadata?.[CLAVE_CORREO_AVISO] ?? ""));
        // Su rol ACTUAL, o vacío si no tiene ninguno reconocible. Antes caía en
        // ROLES.CASHIER, así que abrir a un usuario sin rol para corregirle el
        // apellido lo convertía en cajero de paso.
        setRole(normalizeRole(user.metadata?.role) ?? "");
        setShowModal(true);
    };

    const handleSubmit = async () => {
        if (!editingUser && (!email || !password)) {
            alert("El correo y la contraseña son obligatorios para crear");
            return;
        }

        // El rol se exige TAMBIÉN al editar: el desplegable llega vacío cuando la
        // cuenta no tenía ninguno reconocible, y guardar así lo enviaría vacío,
        // que el servidor rechaza con un 400 poco claro. Mejor pedirlo aquí, con
        // el campo delante.
        if (!role) {
            alert("Elige un rol antes de guardar. Determina a qué pantallas entra la persona y qué puede hacer.");
            return;
        }

        setIsCreating(true);

        try {
            let res;
            if (editingUser) {
                // Update
                res = await fetch(`/admin/staff/${editingUser.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        first_name: firstName,
                        last_name: lastName,
                        role,
                        employee_number: employeeNumber,
                        notification_email: notificationEmail,
                    })
                });
            } else {
                // Create
                res = await fetch("/admin/staff", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: email, password, first_name: firstName, last_name: lastName, role,
                        employee_number: employeeNumber,
                        notification_email: notificationEmail,
                    })
                });
            }

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Error al procesar la solicitud");
            }

            alert(editingUser ? "Usuario actualizado" : "Usuario creado exitosamente");
            setShowModal(false);
            fetchUsers();
        } catch (ex: any) {
            alert(ex.message);
        } finally {
            setIsCreating(false);
        }
    };

    // Cambio de contraseña por Administración: no hace falta dar de baja y de
    // alta a quien la olvidó.
    const handlePassword = async (user: any) => {
        const nueva = window.prompt(`Contraseña nueva para ${aUsuario(user.email)} (mínimo 8 caracteres):`);
        if (nueva === null) return;
        try {
            const res = await fetch(`/admin/staff/${user.id}/password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: nueva }),
            });
            const data = await res.json().catch(() => ({}));
            alert(res.ok ? "Contraseña cambiada. La anterior ya no sirve." : (data.message || "No se pudo cambiar la contraseña."));
        } catch {
            alert("Error de conexión");
        }
    };

    // Bloqueo reversible: cierra la puerta sin destruir la llave. Para quien
    // se va, sigue estando Deshabilitar.
    const handleBlock = async (user: any) => {
        const bloqueada = estaBloqueado(user);
        if (!bloqueada) {
            const motivo = window.prompt(`¿Bloquear a ${aUsuario(user.email)}? No podrá entrar hasta que se reactive. Motivo (opcional):`);
            if (motivo === null) return;
            const res = await fetch(`/admin/staff/${user.id}/block`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: motivo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) alert(data.message || "No se pudo bloquear.");
        } else {
            if (!window.confirm(`¿Reactivar a ${aUsuario(user.email)}? Entrará con su misma contraseña.`)) return;
            const res = await fetch(`/admin/staff/${user.id}/unblock`, { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) alert(data.message || "No se pudo reactivar.");
        }
        fetchUsers();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Estás seguro de que quieres deshabilitar este usuario?")) return;
        
        try {
            const res = await fetch(`/admin/staff/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" }
            });
            if (res.ok) {
                alert("Usuario deshabilitado");
                fetchUsers();
            }
        } catch (ex: any) {
            alert("Error al deshabilitar usuario");
        }
    }

    if (denegado) return <SinAcceso recurso="el personal" />;

    return (
        <Container>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                    <Heading level="h1">Personal y roles</Heading>
                    <Text size="small" style={{ color: "var(--fg-muted)", marginTop: 4 }}>
                        Administra el acceso al POS y asigna el perfil médico
                    </Text>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <Button variant="secondary" onClick={fetchUsers} disabled={loading}>
                        Actualizar
                    </Button>
                    <Button variant="primary" onClick={handleOpenCreate} disabled={isAuditor}>
                        Alta de personal
                    </Button>
                </div>
            </div>

            {/* Simple Inline Table Overlay for Modal instead of complex MedusaUI FocusModal nesting */}
            {showModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
                    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 40,
                    display: "flex", justifyContent: "center", alignItems: "center"
                }}>
                    <Container style={{ width: "400px", padding: "24px", borderRadius: "12px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
                        <Heading level="h2" style={{ marginBottom: 16 }}>
                            {editingUser ? "Editar perfil" : "Nuevo acceso de personal"}
                        </Heading>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
                            {!editingUser && (
                                <>
                                    <div>
                                        <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Usuario</Text>
                                        {/* autoComplete y un name no estandar: este formulario tiene
                                            un campo de correo y otro de contrasena dentro de una sesion
                                            ya iniciada, que es justo el patron que el navegador reconoce
                                            como "inicio de sesion". Sin esto, Chrome rellenaba solo el
                                            correo y la contrasena DEL ADMINISTRADOR que esta dando de
                                            alta, y al borrarlos los volvia a poner. */}
                                        <Input
                                            type="text"
                                            name="alta-usuario-personal"
                                            autoComplete="off"
                                            value={email}
                                            onChange={e => setEmail(e.target.value.toLowerCase())}
                                            placeholder="jperez"
                                        />
                                        <Text size="xsmall" className="text-ui-fg-subtle" style={{ marginTop: 4 }}>
                                            Sin arroba. Minúsculas, números, punto, guion y guion bajo.
                                            Entrará escribiendo sólo esto.
                                        </Text>
                                    </div>
                                    <div>
                                        <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Contraseña</Text>
                                        {/* "new-password" y no "off": Chrome ignora "off" en campos de
                                            contrasena, pero si respeta "new-password", que es la senal de
                                            "esto es una clave nueva, no la guardada". */}
                                        <Input
                                            type="password"
                                            name="alta-clave-personal"
                                            autoComplete="new-password"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="Contraseña segura"
                                        />
                                        <Text size="small" style={{ color: "var(--fg-subtle)", marginTop: 4 }}>Debe tener un buen nivel de seguridad o el sistema la rechazará.</Text>
                                    </div>
                                </>
                            )}
                            <div>
                                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Nombre</Text>
                                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ej. Juan" />
                            </div>
                            <div>
                                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Apellido</Text>
                                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ej. Pérez" />
                            </div>
                            <div>
                                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Número de empleado</Text>
                                <Input
                                    value={employeeNumber}
                                    onChange={e => setEmployeeNumber(e.target.value.toUpperCase())}
                                    placeholder="Ej. 0007"
                                />
                                <Text size="xsmall" className="text-ui-fg-subtle" style={{ marginTop: 4 }}>
                                    El de nómina o credencial. Sale en la bitácora junto al usuario. Único: no se
                                    reutiliza el de alguien que se fue.
                                </Text>
                            </div>
                            <div>
                                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Correo de aviso</Text>
                                <Input
                                    type="email"
                                    name="correo-aviso-personal"
                                    autoComplete="off"
                                    value={notificationEmail}
                                    onChange={e => setNotificationEmail(e.target.value)}
                                    placeholder="persona@clinica.mx"
                                />
                                <Text size="xsmall" className="text-ui-fg-subtle" style={{ marginTop: 4 }}>
                                    A dónde le llegan los avisos del sistema (caducidades, bajas). Opcional: el
                                    usuario con el que entra no es un buzón.
                                </Text>
                            </div>
                            <div>
                                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Rol a asignar</Text>
                                <Select value={role} onValueChange={setRole}>
                                    <Select.Trigger>
                                        <Select.Value placeholder="Selecciona un rol" />
                                    </Select.Trigger>
                                    <Select.Content style={{ zIndex: 9999 }}>
                                        {/* Opciones derivadas del vocabulario canónico (lib/roles.ts).
                                            Antes estaban escritas a mano y enviaban "cajero"/"enfermero",
                                            valores que el POS nunca reconocía. */}
                                        {ALL_ROLES.map((r) => (
                                            <Select.Item key={r} value={r}>{ROLE_LABELS[r]}</Select.Item>
                                        ))}
                                    </Select.Content>
                                </Select>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={isCreating}>Cancelar</Button>
                            <Button variant="primary" onClick={handleSubmit} isLoading={isCreating}>
                                {editingUser ? "Guardar cambios" : "Crear acceso"}
                            </Button>
                        </div>
                    </Container>
                </div>
            )}

            <div style={{ overflowX: "auto", width: "100%" }}>
                {/* Scroll horizontal: la tabla es mas ancha que una tableta en vertical y,
                    sin este contenedor, las columnas de la derecha se recortan sin manera
                    de llegar a ellas. */}
            <Table>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell>Usuario</Table.HeaderCell>
                        <Table.HeaderCell>Nombre</Table.HeaderCell>
                        <Table.HeaderCell>Nº empleado</Table.HeaderCell>
                        <Table.HeaderCell>Rol en el sistema</Table.HeaderCell>
                        <Table.HeaderCell>Acciones</Table.HeaderCell>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {users.map((user) => {
                        const canonicalRole = normalizeRole(user.metadata?.role);
                        const userRole = canonicalRole ? roleLabel(canonicalRole) : "Admin nativo (sin rol)";
                        const BADGE_COLORS: Record<string, "blue" | "green" | "grey" | "orange" | "purple"> = {
                            [ROLES.DOCTOR]: "green",
                            [ROLES.NURSE]: "orange",
                            [ROLES.CASHIER]: "blue",
                            [ROLES.AUDITOR]: "purple",
                            [ROLES.PHARMACY]: "green",
                            [ROLES.ADMIN]: "grey",
                        };
                        const badgeColor = canonicalRole ? BADGE_COLORS[canonicalRole] : "grey";
                        
                        return (
                            <Table.Row key={user.id}>
                                <Table.Cell>
                                    <Text weight="plus">{aUsuario(user.email)}</Text>
                                </Table.Cell>
                                <Table.Cell>
                                    <Text>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</Text>
                                </Table.Cell>
                                <Table.Cell>
                                    <Text>{numeroDeEmpleado(user) ?? "—"}</Text>
                                    {!!user.metadata?.[CLAVE_CORREO_AVISO] && (
                                        <Text size="xsmall" className="text-ui-fg-subtle">
                                            {String(user.metadata[CLAVE_CORREO_AVISO])}
                                        </Text>
                                    )}
                                </Table.Cell>
                                <Table.Cell>
                                    <Badge color={badgeColor} style={{ textTransform: "capitalize" }}>
                                        {userRole}
                                    </Badge>
                                    {estaBloqueado(user) && (
                                        <Badge color="red" style={{ marginLeft: 6 }}>Bloqueada</Badge>
                                    )}
                                </Table.Cell>
                                <Table.Cell>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <Button variant="secondary" size="small" onClick={() => handleOpenEdit(user)} disabled={isAuditor}>
                                            Editar
                                        </Button>
                                        <Button variant="secondary" size="small" onClick={() => handlePassword(user)} disabled={isAuditor}>
                                            Contraseña
                                        </Button>
                                        <Button variant="secondary" size="small" onClick={() => handleBlock(user)} disabled={isAuditor}>
                                            {estaBloqueado(user) ? "Reactivar" : "Bloquear"}
                                        </Button>
                                        <Button variant="danger" size="small" onClick={() => handleDelete(user.id)} disabled={isAuditor}>
                                            Deshabilitar
                                        </Button>
                                    </div>
                                </Table.Cell>
                            </Table.Row>
                        );
                    })}
                    {users.length === 0 && !loading && (
                        <Table.Row>
                            {/* @ts-ignore */}
                            <Table.Cell colSpan={5}>
                                <Text style={{ textAlign: "center", color: "var(--fg-subtle)", padding: 20 }}>
                                    No hay personal registrado
                                </Text>
                            </Table.Cell>
                        </Table.Row>
                    )}
                </Table.Body>
            </Table>
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Personal",
});

export default StaffPage;
