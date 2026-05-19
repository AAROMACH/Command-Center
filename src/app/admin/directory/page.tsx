'use client';

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query } from 'firebase/firestore';
import { DirectoryClient } from "./components/directory-client";
import { Users } from "lucide-react";
import type { Technician, TimeOffRequest, WorkOrder, SiteRequest } from "@/lib/types";

export default function DirectoryPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);

  useEffect(() => {
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    const unsubTOR = onSnapshot(collection(db, 'timeOffRequests'), (snap) => {
      setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
    });
    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
    });
    const unsubSite = onSnapshot(collection(db, 'siteRequests'), (snap) => {
      setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
    });

    return () => {
      unsubTech();
      unsubTOR();
      unsubWO();
      unsubSite();
    };
  }, []);

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

      <DirectoryClient 
        technicians={technicians} 
        timeOffRequests={timeOffRequests} 
        workOrders={workOrders} 
        siteRequests={siteRequests}
      />
    </div>
  );
}
