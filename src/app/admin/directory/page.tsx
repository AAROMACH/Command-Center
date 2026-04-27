import { technicians } from "@/lib/data";
import { DirectoryClient } from "./components/directory-client";
import { Button } from "@/components/ui/button";
import { Users, Plus, Search, SlidersHorizontal } from "lucide-react";

export default function DirectoryPage() {

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <Users size={12} />
            Personnel Files
          </p>
          <h1 className="page-title">Team Directory</h1>
          <p className="page-subtitle">Browse, manage, and contact all personnel in the organization.</p>
        </div>
        <div className="page-header-right items-center">
            <Button variant="default" size="default">
                <Plus size={14} className="mr-2"/>
                Add Technician
            </Button>
        </div>
      </header>

       <div className="mb-6 flex items-center justify-between">
        <div className="search-wrap">
          <Search />
          <input className="search-input" placeholder="Search by name, skill, or location..." />
        </div>
        <Button variant="outline" size="default"><SlidersHorizontal size={14} className="mr-2"/> Filters</Button>
      </div>

      <DirectoryClient technicians={technicians} />
    </div>
  );
}
