import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import MedicalCustomerModule from "../modules/medical-customer";

export default defineLink(
    CustomerModule.linkable.customer,
    MedicalCustomerModule.linkable.medicalCustomer
);
