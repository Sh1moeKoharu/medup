import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useEffect } from "react";

const AuditorGuard = () => {
    useEffect(() => {
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data?.user?.metadata?.role === "auditor") {
                    // Redirect to Cortes de Caja if they are on a protected native route
                    const currentPath = window.location.pathname;
                    const protectedRoutes = ["/app/products", "/app/orders", "/app/customers", "/app/settings", "/app/staff"];
                    
                    if (protectedRoutes.some(route => currentPath.startsWith(route))) {
                        window.location.href = "/app/cash-sessions";
                    }

                    // Hide the side-menu links dynamically
                    const style = document.createElement('style');
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
                    // Assign an ID so it does not inject multiple times
                    style.id = "auditor-global-styles";
                    if (!document.getElementById("auditor-global-styles")) {
                        document.head.appendChild(style);
                    }
                }
            })
            .catch(err => console.error("Auditor check failed", err));
    }, []);

    return null;
};

// Inject this guard into all major list views to create a global protector effect
export const config = defineWidgetConfig({
    zone: [
        "product.list.before",
        "order.list.before",
        "customer.list.before",
        // add into our custom routes as well if we want, but those are custom pages.
    ],
});

export default AuditorGuard;
