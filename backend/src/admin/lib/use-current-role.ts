import { useEffect, useState } from "react"
import { Role, normalizeRole } from "../../lib/roles"

/**
 * Rol del usuario en sesión, para decidir QUÉ SE MUESTRA en el panel.
 *
 * ⚠️ Esto NO es control de acceso. Lo que protege de verdad son los guards del
 * servidor en `src/api/middlewares.ts`: cualquiera puede editar el DOM o llamar
 * la API directamente. Aquí sólo se evita mostrarle a alguien puertas que no
 * puede abrir.
 *
 * La consulta se cachea a nivel de módulo: varios widgets y rutas piden el rol
 * en la misma carga, y sin esto cada uno dispararía su propio fetch.
 */

let cached: Promise<Role | null> | null = null

function fetchRole(): Promise<Role | null> {
  if (!cached) {
    cached = fetch("/admin/users/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => normalizeRole(data?.user?.metadata?.role))
      .catch(() => null)
  }
  return cached
}

export function useCurrentRole(): { role: Role | null; loading: boolean } {
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchRole().then((r) => {
      if (active) {
        setRole(r)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  return { role, loading }
}
