import { MedusaService } from "@medusajs/framework/utils";
import { DoctorShift } from "./models/doctor-shift";
import { DoctorCommission } from "./models/doctor-commission";
import { StaffCompensation } from "./models/staff-compensation";
import { StaffCommissionRule } from "./models/staff-commission-rule";
import { StaffPayment } from "./models/staff-payment";

class HonorariosModuleService extends MedusaService({
    DoctorShift,
    DoctorCommission,
    StaffCompensation,
    StaffCommissionRule,
    StaffPayment,
}) {}

export default HonorariosModuleService;
