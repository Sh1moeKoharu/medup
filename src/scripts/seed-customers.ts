import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function seedCustomers({ container }: { container: MedusaContainer }) {
  const customerModuleService = container.resolve(Modules.CUSTOMER);
  
  console.log("Creando 10 clientes de prueba...");

  const testCustomers = [
    { first_name: "Carlos", last_name: "Slim", email: "carlos.slim@test.com", phone: "+52 555 123 4567" },
    { first_name: "María", last_name: "García", email: "maria.garcia@test.com", phone: "+52 555 987 6543" },
    { first_name: "Juan", last_name: "Pérez", email: "juan.perez@test.com", phone: "+52 555 456 7890" },
    { first_name: "Ana", last_name: "Martínez", email: "ana.martinez@test.com", phone: "+52 555 321 0987" },
    { first_name: "Luis", last_name: "Rodríguez", email: "luis.rodriguez@test.com", phone: "+52 555 789 0123" },
    { first_name: "Laura", last_name: "López", email: "laura.lopez@test.com", phone: "+52 555 654 3210" },
    { first_name: "José", last_name: "González", email: "jose.gonzalez@test.com", phone: "+52 555 234 5678" },
    { first_name: "Carmen", last_name: "Hernández", email: "carmen.hernandez@test.com", phone: "+52 555 876 5432" },
    { first_name: "Pedro", last_name: "Gómez", email: "pedro.gomez@test.com", phone: "+52 555 345 6789" },
    { first_name: "Sofia", last_name: "Díaz", email: "sofia.diaz@test.com", phone: "+52 555 098 7654" }
  ];

  try {
    for (const customerData of testCustomers) {
      await customerModuleService.createCustomers([
        {
          first_name: customerData.first_name,
          last_name: customerData.last_name,
          email: customerData.email,
          phone: customerData.phone,
          company_name: Math.random() > 0.5 ? "Empresa de Prueba S.A." : undefined
        }
      ]);
      console.log(`Cliente creado: ${customerData.first_name} ${customerData.last_name}`);
    }
    
    console.log("¡Los 10 clientes de prueba han sido creados exitosamente!");
  } catch (error) {
    console.error("Error al crear los clientes:", error);
  }
}
