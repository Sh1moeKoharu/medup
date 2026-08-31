import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Table, Badge, Button, Input, Select } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ALL_ROLES, ROLES, ROLE_LABELS, normalizeRole, roleLabel } from "../../../lib/roles";

const StaffPage = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
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
    const [role, setRole] = useState<string>(ROLES.CASHIER);

    // Removed useToast

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/admin/staff", { credentials: "include" });
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
        // ROLES.CASHIER ("cashier"), no "cajero".
        //
        // "cajero" es un alias HEREDADO que normalizeRole() sabe traducir, pero
        // las opciones del desplegable se generan desde ALL_ROLES, que son los
        // valores canonicos en ingles. Con "cajero" ninguna opcion coincidia, asi
        // que el desplegable se quedaba en su texto de ayuda y parecia que no
        // habia ningun rol elegido.
        //
        // Y como handleOpenCreate() llama a resetForm() antes de abrir, esto
        // pasaba SIEMPRE al dar de alta a alguien, no en un caso raro.
        setRole(ROLES.CASHIER);
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
        setRole(normalizeRole(user.metadata?.role) ?? ROLES.CASHIER);
        setShowModal(true);
    };

    const handleSubmit = async () => {
        if (!editingUser && (!email || !password)) {
            alert("El correo y la contraseña son obligatorios para crear");
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
                        role
                    })
                });
            } else {
                // Create
                res = await fetch("/admin/staff", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email, password, first_name: firstName, last_name: lastName, role
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

    return (
        <Container>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                    <Heading level="h1">Personal y Roles</Heading>
                    <Text size="small" style={{ color: "#6b7280", marginTop: 4 }}>
                        Administra el acceso al POS y asigna el perfil médico
                    </Text>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <Button variant="secondary" onClick={fetchUsers} disabled={loading}>
                        Actualizar
                    </Button>
                    <Button variant="primary" onClick={handleOpenCreate} disabled={isAuditor}>
                        Alta de Personal
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
                            {editingUser ? "Editar Perfil" : "Nuevo Rol de Personal"}
                        </Heading>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
                            {!editingUser && (
                                <>
                                    <div>
                                        <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Correo Electrónico</Text>
                                        {/* autoComplete y un name no estandar: este formulario tiene
                                            un campo de correo y otro de contrasena dentro de una sesion
                                            ya iniciada, que es justo el patron que el navegador reconoce
                                            como "inicio de sesion". Sin esto, Chrome rellenaba solo el
                                            correo y la contrasena DEL ADMINISTRADOR que esta dando de
                                            alta, y al borrarlos los volvia a poner. */}
                                        <Input
                                            type="email"
                                            name="alta-correo-personal"
                                            autoComplete="off"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="usuario@pos.com"
                                        />
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
                                        <Text size="small" style={{ color: "#9ca3af", marginTop: 4 }}>Debe tener un buen nivel de seguridad o el sistema la rechazará.</Text>
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
                                {editingUser ? "Guardar Cambios" : "Crear Acceso"}
                            </Button>
                        </div>
                    </Container>
                </div>
            )}

            <Table>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell>Email</Table.HeaderCell>
                        <Table.HeaderCell>Nombre</Table.HeaderCell>
                        <Table.HeaderCell>Rol en Sistema</Table.HeaderCell>
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
                                    <Text weight="plus">{user.email}</Text>
                                </Table.Cell>
                                <Table.Cell>
                                    <Text>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</Text>
                                </Table.Cell>
                                <Table.Cell>
                                    <Badge color={badgeColor} style={{ textTransform: "capitalize" }}>
                                        {userRole}
                                    </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <Button variant="secondary" size="small" onClick={() => handleOpenEdit(user)} disabled={isAuditor}>
                                            Editar
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
                            <Table.Cell colSpan={4}>
                                <Text style={{ textAlign: "center", color: "#9ca3af", padding: 20 }}>
                                    No hay personal registrado
                                </Text>
                            </Table.Cell>
                        </Table.Row>
                    )}
                </Table.Body>
            </Table>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Personal",
});

export default StaffPage;
