import { ExecArgs } from "@medusajs/framework/types"
import { AUDIT_LOGS_MODULE } from "../modules/audit-logs"
import { GENESIS, calcularHuella } from "../lib/audit-chain"

/**
 * Comprueba que la bitácora no ha sido alterada.
 *
 *   npx medusa exec ./src/scripts/verificar-bitacora.ts
 *   npx medusa exec ./src/scripts/verificar-bitacora.ts detalle
 *
 * Recorre los asientos en orden y recalcula la huella de cada uno a partir de
 * su contenido y de la huella del anterior. Si alguien modificó, borró o
 * reordenó un asiento, la cadena deja de cuadrar y aquí se ve dónde.
 *
 * ── PARA QUÉ SIRVE EN LA PRÁCTICA ───────────────────────────────────────────
 * Una bitácora sólo vale ante una inspección si se puede demostrar que no se
 * tocó. Esto es lo que se ejecuta delante del inspector, o de forma periódica
 * para detectar el problema el día que ocurre y no seis meses después.
 *
 * Conviene dejarlo corriendo a diario y guardar la salida.
 *
 * ── QUÉ SIGNIFICA CADA RESULTADO ────────────────────────────────────────────
 * SIN HUELLA    asientos anteriores al encadenamiento. No es un fallo: la
 *               cadena empieza después de ellos.
 * ROTA          el contenido no corresponde a su huella, o el enlace con el
 *               asiento anterior no cuadra. Alguien tocó la base.
 * BIFURCADA     dos asientos apuntan al mismo anterior. Con una sola instancia
 *               del backend no debería ocurrir; ver la nota sobre el cerrojo en
 *               lib/audit-chain.ts.
 */

export default async function verificarBitacora({ container, args }: ExecArgs) {
  const detalle = (args ?? []).includes("detalle")
  const auditService: any = container.resolve(AUDIT_LOGS_MODULE)

  const asientos = await auditService.listAuditLogs(
    {},
    { order: { created_at: "ASC" }, take: 100000 }
  )

  console.log("")
  console.log("=== VERIFICACION DE LA BITACORA ===")
  console.log("")

  if (!asientos?.length) {
    console.log("   La bitácora está vacía.")
    console.log("")
    return
  }

  const sinHuella = asientos.filter((a: any) => !a.hash)
  const encadenados = asientos.filter((a: any) => a.hash)

  console.log(`   Asientos totales      : ${asientos.length}`)
  console.log(`   Anteriores a la cadena: ${sinHuella.length}`)
  console.log(`   Encadenados           : ${encadenados.length}`)
  console.log("")

  if (!encadenados.length) {
    console.log("   Todavía no hay ningún asiento encadenado.")
    console.log("   La cadena empezará con la próxima acción que se registre.")
    console.log("")
    return
  }

  // ── Recorrido ─────────────────────────────────────────────────────────────
  const rotos: { asiento: any; motivo: string }[] = []
  const vistas = new Map<string, string>() // prev_hash -> id, para detectar bifurcaciones
  let esperada = GENESIS
  let primera = true

  for (const a of encadenados) {
    // El primer asiento encadenado enlaza con GENESIS o con el punto donde
    // arrancó la cadena; se toma su prev_hash como origen legítimo.
    if (primera) {
      esperada = a.prev_hash ?? GENESIS
      primera = false
    }

    if (a.prev_hash !== esperada) {
      rotos.push({
        asiento: a,
        motivo: `enlaza con ${String(a.prev_hash).slice(0, 12)}… pero el anterior termina en ${String(esperada).slice(0, 12)}…`,
      })
      // Se continúa desde lo que dice este asiento, para no reportar como rota
      // toda la cola por culpa de un único hueco.
      esperada = a.hash
      continue
    }

    const recalculada = calcularHuella(
      {
        user_id: a.user_id ?? null,
        user_email: a.user_email ?? null,
        user_role: a.user_role ?? null,
        method: a.method,
        endpoint: a.endpoint,
        ip_address: a.ip_address ?? null,
        payload: a.payload ?? null,
      },
      a.prev_hash ?? GENESIS
    )

    if (recalculada !== a.hash) {
      rotos.push({
        asiento: a,
        motivo: "el contenido no corresponde a su huella: fue modificado",
      })
    }

    const anterior = vistas.get(a.prev_hash)
    if (anterior) {
      rotos.push({
        asiento: a,
        motivo: `bifurcación: el asiento ${anterior} enlaza con el mismo punto`,
      })
    }
    vistas.set(a.prev_hash, a.id)

    esperada = a.hash
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  if (detalle) {
    console.log("   Primeros asientos de la cadena:")
    for (const a of encadenados.slice(0, 5)) {
      console.log(
        `      ${new Date(a.created_at).toISOString()}  ${String(a.method).padEnd(6)} ${String(a.endpoint).slice(0, 40).padEnd(42)} ${String(a.hash).slice(0, 12)}…`
      )
    }
    console.log("")
  }

  if (rotos.length === 0) {
    console.log("   ═══════════════════════════════════════════════════════")
    console.log("   CADENA INTACTA")
    console.log("")
    console.log(`   Los ${encadenados.length} asientos encadenados están enlazados`)
    console.log("   correctamente. Ninguno fue modificado, borrado ni reordenado")
    console.log("   desde que se escribió.")
    console.log("   ═══════════════════════════════════════════════════════")
  } else {
    console.log("   ═══════════════════════════════════════════════════════")
    console.log(`   CADENA ROTA EN ${rotos.length} PUNTO(S)`)
    console.log("   ═══════════════════════════════════════════════════════")
    console.log("")
    for (const r of rotos.slice(0, 20)) {
      console.log(`   asiento ${r.asiento.id}`)
      console.log(`      fecha   ${new Date(r.asiento.created_at).toISOString()}`)
      console.log(`      acción  ${r.asiento.method} ${r.asiento.endpoint}`)
      console.log(`      usuario ${r.asiento.user_email ?? "desconocido"}`)
      console.log(`      motivo  ${r.motivo}`)
      console.log("")
    }
    if (rotos.length > 20) {
      console.log(`   … y ${rotos.length - 20} más`)
      console.log("")
    }
    console.log("   Alguien con acceso a la base de datos modificó la bitácora.")
    console.log("   Conserva este reporte y revisa quién tiene acceso al servidor.")
  }

  console.log("")

  if (sinHuella.length) {
    console.log(
      `   Nota: ${sinHuella.length} asiento(s) son anteriores al encadenamiento y no se`
    )
    console.log("   pueden verificar. No es un fallo; simplemente se escribieron antes.")
    console.log("")
  }
}
