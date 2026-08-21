import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useEffect } from "react";
import { ROLES, normalizeRole } from "../../lib/roles";

/**
 * ⚠️ ESTO NO ES UN CONTROL DE SEGURIDAD. ES UNA AYUDA VISUAL.
 *
 * Inyectar CSS y hacer `window.location.href` se salta con F12, con el botón
 * de atrás o llamando la API directamente con curl. Este widget existe sólo
 * para que el auditor no navegue hacia pantallas donde todo le va a fallar.
 *
 * El control real vive en el servidor: `denyReadOnlyMutations()` en
 * `src/api/middlewares.ts` rechaza con 403 cualquier verbo que mute estado
 * cuando el rol es de solo lectura. Si esta capa desapareciera, el sistema
 * seguiría siendo seguro; si desapareciera la del servidor, no.
 *
 * NO agregar aquí reglas de las que dependa la seguridad.
 */
const AuditorGuard = () => {
    useEffect(() => {
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (normalizeRole(data?.user?.metadata?.role) !== ROLES.AUDITOR) {
                    return;
                }

                // Redirige fuera de pantallas donde el auditor no puede operar.
                const currentPath = window.location.pathname;
                const protectedRoutes = ["/app/products", "/app/orders", "/app/customers", "/app/settings", "/app/staff"];

                if (protectedRoutes.some(route => currentPath.startsWith(route))) {
                    window.location.href = "/app/cash-sessions";
                }

                // Atenúa los enlaces del menú lateral.
                if (!document.getElementById("auditor-global-styles")) {
                    const style = document.createElement('style');
                    style.id = "auditor-global-styles";
                    style.innerHTML = `
                        a[href^="/app/products"],
                        a[href^="/app/orders"],
                        a[href^="/app/customers"],
                        a[href^="/app/settings"],
                        a[href^="/app/staff"],
                        a[href^="/app/promotions"],
                        a[href^="/app/price-lists"],
                        a[href^="/app/inventory"] {
                            pointer-events: none !important;
                            opacity: 0.4 !important;
                            cursor: not-allowed !important;
                            filter: grayscale(100%) !important;
                        }
                    `;
                    document.head.appendChild(style);
                }
            })
            .catch(err => console.error("Auditor check failed", err));
    }, []);

    return null;
};

export const config = defineWidgetConfig({
    zone: [
        "product.list.before",
        "order.list.before",
        "customer.list.before",
    ],
});

export default AuditorGuard;
