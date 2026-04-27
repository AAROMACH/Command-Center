import { technicians, timeOffRequests, workOrders } from "@/lib/data";
import { DirectoryClient } from "./components/directory-client";
import { Users } from "lucide-react";

export default function DirectoryPage() {

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2 !text-brand-red">
            <Users size={12} />
            OPERATIONS DIRECTORY
          </p>
          <h1 className="page-title">PERSONNEL</h1>
          <p className="page-subtitle">Manage technical staff, command personnel, and client stakeholders.</p>
        </div>
      </header>

      <DirectoryClient technicians={technicians} timeOffRequests={timeOffRequests} workOrders={workOrders} />
    </div>
  );
}
