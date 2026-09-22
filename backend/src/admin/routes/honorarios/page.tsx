import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CurrencyDollar } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Table, Tabs, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { roleLabel } from "../../../lib/roles";
import { imprimirDesde } from "../../lib/imprimir";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";
import { CuadroDeMotivo, enviar } from "../../lib/motivo";

/**
 * Honorarios y nómina de todo el personal.
 *
 *   Nómina del periodo  lo que toca pagar a cada persona, con su desglose, y
 *                       «Registrar pago» (el servidor recalcula y congela).
 *   Esquemas de pago    fijo por turno, por hora, porcentaje base y reglas por
 *                       horario de cada persona (lib/nomina.ts).
 *   Pagos realizados    con su recibo para imprimir.
 *
 * Qué se le atribuye a cada perfil está en lib/nomina-servidor.ts.
 */

const dinero = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
// Un día del periodo ("2026-09-01") tal cual, sin pasar por la zona del navegador.
const dia = (d: string | undefined, iso: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : fecha(iso));
const aDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** La quincena en curso: del 1 al 15, o del 16 a fin de mes. */
const quincena = () => {
    const hoy = new Date();
    const primera = hoy.getDate() <= 15;
    return {
        desde: aDia(new Date(hoy.getFullYear(), hoy.getMonth(), primera ? 1 : 16)),
        hasta: aDia(primera ? new Date(hoy.getFullYear(), hoy.getMonth(), 15) : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
    };
};

const DIAS = [
    ["1", "Lun"],
    ["2", "Mar"],
    ["3", "Mié"],
    ["4", "Jue"],
    ["5", "Vie"],
    ["6", "Sáb"],
    ["0", "Dom"],
];

type Regla = { label?: string | null; days: string; start_time: string; end_time: string; percent: number | string };
type Esquema = { fixed_per_shift: number | string; hourly_rate: number | string; default_percent: number | string; reglas: Regla[] };

const ESQUEMA_VACIO: Esquema = { fixed_per_shift: 0, hourly_rate: 0, default_percent: 0, reglas: [] };

const EditorDeEsquema = ({ persona, onGuardado, onCerrar }: { persona: any; onGuardado: () => void; onCerrar: () => void }) => {
    const [e, setE] = useState<Esquema>(persona.esquema ? { ...persona.esquema, reglas: persona.esquema.reglas ?? [] } : ESQUEMA_VACIO);
    const [guardando, setGuardando] = useState(false);
    const regla = (i: number, cambios: Partial<Regla>) => setE({ ...e, reglas: e.reglas.map((r, j) => (j === i ? { ...r, ...cambios } : r)) });

    const guardar = async () => {
        setGuardando(true);
        try {
            const res = await fetch("/admin/staff-compensation", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: persona.user_id, ...e }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.message || "No se pudo guardar el esquema.");
                return;
            }
            onGuardado();
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <div>
                <Heading level="h3">Esquema de {persona.nombre}</Heading>
                <Text size="small" className="text-ui-fg-subtle">{roleLabel(persona.rol)} · lo que se le atribuye depende de su perfil.</Text>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                    <Text size="small" weight="plus">Pago fijo por turno</Text>
                    <Input type="number" min="0" step="0.01" value={e.fixed_per_shift} onChange={(x) => setE({ ...e, fixed_per_shift: x.target.value })} />
                </div>
                <div>
                    <Text size="small" weight="plus">Pago por hora en turno</Text>
                    <Input type="number" min="0" step="0.01" value={e.hourly_rate} onChange={(x) => setE({ ...e, hourly_rate: x.target.value })} />
                </div>
                <div>
                    <Text size="small" weight="plus">Porcentaje base (%)</Text>
                    <Input type="number" min="0" max="100" step="0.1" value={e.default_percent} onChange={(x) => setE({ ...e, default_percent: x.target.value })} />
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Text size="small" weight="plus">Porcentaje por horario</Text>
                <Text size="xsmall" className="text-ui-fg-subtle">
                    La primera regla que coincide con el día y la hora de cada venta manda; si ninguna coincide, el porcentaje base. Una franja de 20:00 a 08:00 cruza la medianoche.
                </Text>
                {e.reglas.map((r, i) => {
                    const dias = r.days.split(",").filter(Boolean);
                    return (
                        <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-ui-border-base bg-ui-bg-base p-2">
                            <div className="min-w-[140px]">
                                <Text size="xsmall">Nombre</Text>
                                <Input value={r.label ?? ""} placeholder="Ej. Noche" onChange={(x) => regla(i, { label: x.target.value })} />
                            </div>
                            <div className="flex gap-1">
                                {DIAS.map(([v, t]) => {
                                    const activo = dias.includes(v);
                                    return (
                                        <Button
                                            key={v}
                                            size="small"
                                            variant={activo ? "primary" : "secondary"}
                                            onClick={() => regla(i, { days: (activo ? dias.filter((d) => d !== v) : [...dias, v]).join(",") })}
                                        >
                                            {t}
                                        </Button>
                                    );
                                })}
                            </div>
                            <div>
                                <Text size="xsmall">De</Text>
                                <Input type="time" value={r.start_time} onChange={(x) => regla(i, { start_time: x.target.value })} />
                            </div>
                            <div>
                                <Text size="xsmall">A</Text>
                                <Input type="time" value={r.end_time} onChange={(x) => regla(i, { end_time: x.target.value })} />
                            </div>
                            <div className="w-24">
                                <Text size="xsmall">%</Text>
                                <Input type="number" min="0" max="100" step="0.1" value={r.percent} onChange={(x) => regla(i, { percent: x.target.value })} />
                            </div>
                            <Button size="small" variant="transparent" onClick={() => setE({ ...e, reglas: e.reglas.filter((_, j) => j !== i) })}>
                                Quitar
                            </Button>
                        </div>
                    );
                })}
                <Button
                    size="small"
                    variant="secondary"
                    className="self-start"
                    onClick={() => setE({ ...e, reglas: [...e.reglas, { label: "", days: "1,2,3,4,5", start_time: "08:00", end_time: "20:00", percent: e.default_percent }] })}
                >
                    Añadir regla por horario
                </Button>
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} isLoading={guardando}>Guardar esquema</Button>
            </div>
        </div>
    );
};

/** "2026-09-14T08:00" para <input type="datetime-local">, en la hora del navegador. */
const aLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const horas = (a: string, b: string | null) => (((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 3_600_000).toFixed(2);

/**
 * Los turnos que cuentan para la nómina. Un turno que se quedó abierto suma
 * horas hasta el momento del reporte: aquí se cierra o se corrige con motivo.
 */
const TurnosDelPersonal = ({ desde, hasta }: { desde: string; hasta: string }) => {
    const [turnos, setTurnos] = useState<any[]>([]);
    const [soloAbiertos, setSoloAbiertos] = useState(true);
    const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
    const [horario, setHorario] = useState({ inicio: "", fin: "" });
    const [enviando, setEnviando] = useState(false);

    const cargar = async () => {
        const q = soloAbiertos ? "status=open" : `from=${desde}T00:00:00&to=${hasta}T23:59:59`;
        const res = await fetch(`/admin/doctor-shifts?${q}`, { credentials: "include" });
        if (res.ok) setTurnos((await res.json()).doctor_shifts ?? []);
    };
    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desde, hasta, soloAbiertos]);

    const cerrar = async (t: any) => {
        if (!window.confirm(`¿Cerrar ahora el turno de ${t.doctor_name}? Contará hasta este momento.`)) return;
        const { error } = await enviar(`/admin/doctor-shifts/${t.id}/close`, { notes: "Cerrado desde el panel" });
        if (error) return alert(error);
        cargar();
    };
    const corregir = async (t: any, motivo: string) => {
        setEnviando(true);
        const { error } = await enviar(`/admin/doctor-shifts/${t.id}`, {
            opened_at: horario.inicio ? new Date(horario.inicio).toISOString() : undefined,
            closed_at: horario.fin ? new Date(horario.fin).toISOString() : null,
            motivo,
        });
        setEnviando(false);
        if (error) return alert(error);
        setCorrigiendo(null);
        cargar();
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="small" variant={soloAbiertos ? "primary" : "secondary"} onClick={() => setSoloAbiertos(true)}>Abiertos ahora</Button>
                <Button size="small" variant={!soloAbiertos ? "primary" : "secondary"} onClick={() => setSoloAbiertos(false)}>Del periodo</Button>
                <Text size="small" className="text-ui-fg-subtle">Un turno abierto cuenta horas hasta el momento de la consulta; ciérralo o corrige sus horas con motivo.</Text>
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Persona</Table.HeaderCell>
                            <Table.HeaderCell>Perfil</Table.HeaderCell>
                            <Table.HeaderCell>Abrió</Table.HeaderCell>
                            <Table.HeaderCell>Cerró</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Horas</Table.HeaderCell>
                            <Table.HeaderCell></Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {turnos.map((t) => (
                            <>
                                <Table.Row key={t.id}>
                                    <Table.Cell>{t.doctor_name}</Table.Cell>
                                    <Table.Cell>{t.role ? roleLabel(t.role) : "Médico"}</Table.Cell>
                                    <Table.Cell>{new Date(t.opened_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Table.Cell>
                                    <Table.Cell>{t.closed_at ? new Date(t.closed_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : <Badge color="green">Abierto</Badge>}</Table.Cell>
                                    <Table.Cell className="text-right tabular-nums">{horas(t.opened_at, t.closed_at)}</Table.Cell>
                                    <Table.Cell className="text-right">
                                        {corrigiendo !== t.id && (
                                            <div className="flex justify-end gap-1">
                                                {!t.closed_at && <Button size="small" variant="secondary" onClick={() => cerrar(t)}>Cerrar ahora</Button>}
                                                <Button size="small" variant="secondary" onClick={() => { setCorrigiendo(t.id); setHorario({ inicio: aLocal(t.opened_at), fin: aLocal(t.closed_at) }); }}>Corregir horas</Button>
                                            </div>
                                        )}
                                    </Table.Cell>
                                </Table.Row>
                                {corrigiendo === t.id && (
                                    <Table.Row key={`${t.id}-c`}>
                                        {/* @ts-ignore */}
                                        <Table.Cell colSpan={6}>
                                            <CuadroDeMotivo
                                                titulo={`Corregir el turno de ${t.doctor_name}`}
                                                descripcion="Las horas van en la hora de este equipo. El motivo queda en el turno y en la bitácora."
                                                etiqueta="Guardar horas"
                                                enviando={enviando}
                                                onCancelar={() => setCorrigiendo(null)}
                                                onConfirmar={(m) => corregir(t, m)}
                                            >
                                                <div className="flex flex-wrap gap-3">
                                                    <div><Text size="xsmall">Abrió</Text><Input type="datetime-local" value={horario.inicio} onChange={(e) => setHorario({ ...horario, inicio: e.target.value })} /></div>
                                                    <div><Text size="xsmall">Cerró</Text><Input type="datetime-local" value={horario.fin} onChange={(e) => setHorario({ ...horario, fin: e.target.value })} /></div>
                                                </div>
                                            </CuadroDeMotivo>
                                        </Table.Cell>
                                    </Table.Row>
                                )}
                            </>
                        ))}
                    </Table.Body>
                </Table>
            </div>
            {!turnos.length && <Text className="text-ui-fg-subtle">{soloAbiertos ? "Nadie tiene un turno abierto." : "Sin turnos en el periodo."}</Text>}
        </div>
    );
};

const HonorariosPage = () => {
    const [denegado, setDenegado] = useState(false);
    const [periodo, setPeriodo] = useState(quincena());
    const [nomina, setNomina] = useState<any>(null);
    const [personal, setPersonal] = useState<any[]>([]);
    const [pagos, setPagos] = useState<any[]>([]);
    const [editando, setEditando] = useState<string | null>(null);
    const [pagando, setPagando] = useState<string | null>(null);
    const [referencia, setReferencia] = useState("");
    const [anulando, setAnulando] = useState<string | null>(null);
    const [enviandoAnulacion, setEnviandoAnulacion] = useState(false);
    const anular = async (id: string, motivo: string) => {
        setEnviandoAnulacion(true);
        const { error } = await enviar(`/admin/payroll/payments/${id}/anular`, { motivo });
        setEnviandoAnulacion(false);
        if (error) return alert(error);
        setAnulando(null);
        await Promise.all([cargarNomina(), cargarPagos()]);
    };

    const cargarNomina = async () => {
        const res = await fetch(`/admin/payroll?desde=${periodo.desde}&hasta=${periodo.hasta}`, { credentials: "include" });
        if (esDenegado(res)) return setDenegado(true);
        setNomina(await res.json());
    };
    const cargarPersonal = async () => {
        const res = await fetch("/admin/staff-compensation", { credentials: "include" });
        if (res.ok) setPersonal((await res.json()).personal ?? []);
    };
    const cargarPagos = async () => {
        const res = await fetch("/admin/payroll/payments", { credentials: "include" });
        if (res.ok) setPagos((await res.json()).pagos ?? []);
    };

    useEffect(() => {
        cargarPersonal();
        cargarPagos();
    }, []);
    useEffect(() => {
        if (periodo.desde && periodo.hasta) cargarNomina();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodo.desde, periodo.hasta]);

    const pagar = async (fila: any) => {
        const res = await fetch("/admin/payroll/pay", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: fila.user_id, desde: periodo.desde, hasta: periodo.hasta, reference: referencia }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.message || "No se pudo registrar el pago.");
            return;
        }
        setPagando(null);
        setReferencia("");
        await Promise.all([cargarNomina(), cargarPagos()]);
        const e = await imprimirDesde(`/admin/documents/pago/${data.pago.id}`);
        if (e) alert(e);
    };

    if (denegado) return <SinAcceso recurso="los honorarios y la nómina" />;

    return (
        <Container className="flex flex-col gap-4 p-6">
            <div>
                <Heading level="h1">Honorarios y nómina</Heading>
                <Text className="text-ui-fg-subtle">
                    Lo que toca pagar a cada persona según su esquema: fijo por turno, por hora y comisión por horario sobre lo que se le atribuye.
                </Text>
            </div>

            <Tabs defaultValue="nomina">
                <Tabs.List>
                    <Tabs.Trigger value="nomina">Nómina del periodo</Tabs.Trigger>
                    <Tabs.Trigger value="esquemas">Esquemas de pago</Tabs.Trigger>
                    <Tabs.Trigger value="pagos">Pagos realizados</Tabs.Trigger>
                    <Tabs.Trigger value="turnos">Turnos</Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="turnos" className="mt-4">
                    <TurnosDelPersonal desde={periodo.desde} hasta={periodo.hasta} />
                </Tabs.Content>

                <Tabs.Content value="nomina" className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <Text size="small" className="text-ui-fg-subtle">Desde</Text>
                            <Input type="date" value={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} />
                        </div>
                        <div>
                            <Text size="small" className="text-ui-fg-subtle">Hasta</Text>
                            <Input type="date" value={periodo.hasta} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} />
                        </div>
                        <Button variant="secondary" onClick={() => setPeriodo(quincena())}>Quincena en curso</Button>
                        {nomina && <Text className="ml-auto">Total del periodo: <b>{dinero(nomina.total)}</b></Text>}
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Persona</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Turnos</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Horas</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Fijo</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Por hora</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Base comisionable</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Comisión</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
                                    <Table.HeaderCell></Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {(nomina?.nomina ?? []).map((f: any) => (
                                    <Table.Row key={f.user_id}>
                                        <Table.Cell>
                                            <Text size="small" weight="plus">{f.nombre}</Text>
                                            <Text size="xsmall" className="text-ui-fg-subtle">
                                                {roleLabel(f.rol)}
                                                {f.desglose.por_regla.length ? ` · ${f.desglose.por_regla.map((r: any) => `${r.percent}% de ${dinero(r.base)}`).join(", ")}` : ""}
                                            </Text>
                                            {!f.esquema && <Text size="xsmall" className="text-ui-fg-error">Sin esquema de pago</Text>}
                                        </Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{f.desglose.turnos}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{f.desglose.horas.toFixed(2)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{dinero(f.desglose.fijo)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{dinero(f.desglose.por_hora)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{dinero(f.desglose.base_comisionable)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{dinero(f.desglose.comision)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums"><b>{dinero(f.desglose.total)}</b></Table.Cell>
                                        <Table.Cell className="text-right">
                                            {f.pagos.length ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge size="2xsmall" color="green">Pagado</Badge>
                                                    {f.pagos.map((p: any) => (
                                                        <Text key={p.id} size="xsmall" className="text-ui-fg-subtle">
                                                            {dinero(p.amount)} · {dia(p.dia_desde, p.period_from)} al {dia(p.dia_hasta, p.period_to)}
                                                        </Text>
                                                    ))}
                                                </div>
                                            ) : pagando === f.user_id ? (
                                                <div className="flex items-center gap-2">
                                                    <Input placeholder="Referencia (opcional)" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                                                    <Button size="small" onClick={() => pagar(f)}>Confirmar</Button>
                                                    <Button size="small" variant="transparent" onClick={() => setPagando(null)}>Cancelar</Button>
                                                </div>
                                            ) : (
                                                <Button size="small" variant="secondary" disabled={f.desglose.total <= 0} onClick={() => setPagando(f.user_id)}>
                                                    Registrar pago
                                                </Button>
                                            )}
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                    {nomina && !nomina.nomina?.length && <Text className="text-ui-fg-subtle">Nadie tiene turnos, atribuciones ni esquema en este periodo.</Text>}
                </Tabs.Content>

                <Tabs.Content value="esquemas" className="mt-4 flex flex-col gap-3">
                    {editando && (
                        <EditorDeEsquema
                            persona={personal.find((p) => p.user_id === editando)}
                            onCerrar={() => setEditando(null)}
                            onGuardado={async () => {
                                setEditando(null);
                                await Promise.all([cargarPersonal(), cargarNomina()]);
                            }}
                        />
                    )}
                    <div className="overflow-x-auto">
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Persona</Table.HeaderCell>
                                    <Table.HeaderCell>Perfil</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Fijo por turno</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Por hora</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">% base</Table.HeaderCell>
                                    <Table.HeaderCell>Reglas por horario</Table.HeaderCell>
                                    <Table.HeaderCell></Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {personal.map((p) => (
                                    <Table.Row key={p.user_id}>
                                        <Table.Cell>{p.nombre}</Table.Cell>
                                        <Table.Cell>{roleLabel(p.rol)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{p.esquema ? dinero(p.esquema.fixed_per_shift) : "—"}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{p.esquema ? dinero(p.esquema.hourly_rate) : "—"}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{p.esquema ? `${p.esquema.default_percent}%` : "—"}</Table.Cell>
                                        <Table.Cell>
                                            {p.esquema?.reglas?.length
                                                ? p.esquema.reglas.map((r: any) => `${r.label || "Regla"}: ${r.percent}% ${r.start_time}–${r.end_time}`).join(" · ")
                                                : "—"}
                                        </Table.Cell>
                                        <Table.Cell className="text-right">
                                            <Button size="small" variant="secondary" onClick={() => setEditando(p.user_id)}>
                                                {p.esquema ? "Editar" : "Definir"}
                                            </Button>
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="pagos" className="mt-4">
                    <div className="overflow-x-auto">
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Pagado</Table.HeaderCell>
                                    <Table.HeaderCell>Persona</Table.HeaderCell>
                                    <Table.HeaderCell>Periodo</Table.HeaderCell>
                                    <Table.HeaderCell className="text-right">Monto</Table.HeaderCell>
                                    <Table.HeaderCell>Referencia</Table.HeaderCell>
                                    <Table.HeaderCell>Registró</Table.HeaderCell>
                                    <Table.HeaderCell></Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {pagos.map((p) => (
                                    <Table.Row key={p.id}>
                                        <Table.Cell>{fecha(p.paid_at)}</Table.Cell>
                                        <Table.Cell>{p.user_name}</Table.Cell>
                                        <Table.Cell>{dia(p.dia_desde, p.period_from)} al {dia(p.dia_hasta, p.period_to)}</Table.Cell>
                                        <Table.Cell className="text-right tabular-nums">{dinero(p.amount)}</Table.Cell>
                                        <Table.Cell>{p.reference ?? "—"}</Table.Cell>
                                        <Table.Cell>{p.paid_by_name ?? "—"}</Table.Cell>
                                        <Table.Cell className="text-right">
                                            <Button
                                                size="small"
                                                variant="secondary"
                                                onClick={async () => {
                                                    const e = await imprimirDesde(`/admin/documents/pago/${p.id}`);
                                                    if (e) alert(e);
                                                }}
                                            >
                                                Imprimir recibo
                                            </Button>
                                            {anulando !== p.id && (
                                                <Button size="small" variant="danger" className="ml-1" onClick={() => setAnulando(p.id)}>Anular</Button>
                                            )}
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                                {anulando && (
                                    <Table.Row>
                                        {/* @ts-ignore */}
                                        <Table.Cell colSpan={7}>
                                            <CuadroDeMotivo
                                                titulo="Anular este pago"
                                                descripcion="El pago sale de la lista y el periodo vuelve a quedar pendiente para registrar el correcto. El motivo y quién lo anuló quedan guardados."
                                                etiqueta="Anular pago"
                                                enviando={enviandoAnulacion}
                                                onCancelar={() => setAnulando(null)}
                                                onConfirmar={(m) => anular(anulando, m)}
                                            />
                                        </Table.Cell>
                                    </Table.Row>
                                )}
                            </Table.Body>
                        </Table>
                    </div>
                    {!pagos.length && <Text className="text-ui-fg-subtle">Todavía no hay pagos registrados.</Text>}
                </Tabs.Content>
            </Tabs>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Honorarios y nómina",
    icon: CurrencyDollar,
});

export default HonorariosPage;
