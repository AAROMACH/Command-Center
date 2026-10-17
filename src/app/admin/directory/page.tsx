'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useEffect, Suspense } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query } from 'firebase/firestore';
import { DirectoryClient } from "./components/directory-client";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/empty-state";
import type { Technician, TimeOffRequest, WorkOrder, SiteRequest } from "@/lib/types";

export default function DirectoryPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);

  useEffect(() => {
    const unsubTech = onSharedSnapshot('users', (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    const unsubTOR = onSharedSnapshot('timeOffRequests', (snap) => {
      setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
    });
    const unsubWO = onSharedSnapshot('workOrders', (snap) => {
      setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
    });
    // Dispatched jobs live in `assignments`, not `workOrders` (see lib/jobs.ts)
    // — a tech's assignment history is otherwise invisible in the directory.
    const unsubAsmt = onSharedSnapshot('assignments', (snap) => {
      setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
    });
    const unsubSite = onSharedSnapshot('siteRequests', (snap) => {
      setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
    });

    return () => {
      unsubTech();
      unsubTOR();
      unsubWO();
      unsubAsmt();
      unsubSite();
    };
  }, []);

  const pendingUsers = technicians.filter(t => t.approvalStatus === 'pending');

  return (
    <div>
      <PageHeader
        eyebrow="People"
        icon={Users}
        title="Directory"
        subtitle="Technicians, office staff and client contacts."
      />

      <Suspense fallback={<PageLoading label="Loading directory…" />}>
        <DirectoryClient
          technicians={technicians}
          timeOffRequests={timeOffRequests}
          workOrders={workOrders}
          assignments={assignments}
          siteRequests={siteRequests}
          pendingUsers={pendingUsers}
        />
      </Suspense>
    </div>
  );
}
