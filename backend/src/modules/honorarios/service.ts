import { MedusaService } from "@medusajs/framework/utils";
import { DoctorShift } from "./models/doctor-shift";
import { DoctorCommission } from "./models/doctor-commission";

class HonorariosModuleService extends MedusaService({
    DoctorShift,
    DoctorCommission,
}) {}

export default HonorariosModuleService;
