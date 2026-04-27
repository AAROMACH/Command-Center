"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { WorkOrder, Technician, Recommendation } from "@/lib/types";
import { getRecommendation } from "../actions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Rocket,
  User,
  Loader2,
  Sparkles,
  Wand2,
  MapPin,
  Briefcase,
  Calendar,
  Clock,
  DollarSign,
  Trash2,
  UserPlus
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

type WorkOrdersClientProps = {
  workOrders: WorkOrder[];
  technicians: Technician[];
};

export function WorkOrdersClient({
  workOrders: initialWorkOrders,
  technicians,
}: WorkOrdersClientProps) {
  const [workOrders, setWorkOrders] = useState(initialWorkOrders);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null
  );
  const { toast } = useToast();

  const handleOpenDialog = (order: WorkOrder) => {
    setSelectedOrder(order);
    setRecommendation(null);
    setIsDialogOpen(true);
  };

  const handleGetRecommendation = async () => {
    if (!selectedOrder) return;
    setIsLoading(true);
    try {
      const result = await getRecommendation({
        workOrder: {
          id: selectedOrder.id,
          description: selectedOrder.description,
          location: selectedOrder.location,
          requiredSkills: selectedOrder.requiredSkills,
          priority: selectedOrder.priority,
        },
        availableTechnicians: technicians.map((t) => ({
          id: t.id,
          name: t.name,
          currentLocation: t.currentLocation,
          reliabilityScore: t.reliabilityScore,
          currentWorkload: t.currentWorkload,
          skills: t.skills,
        })),
      });
      setRecommendation(result);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Recommendation Failed",
        description: "Could not get an AI recommendation. Please try again.",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = (technicianId: string) => {
    if (!selectedOrder) return;

    setWorkOrders(currentOrders =>
      currentOrders.map(order =>
        order.id === selectedOrder.id
          ? { ...order, status: 'assigned', assignedTechnicianId: technicianId }
          : order
      )
    );

    setIsDialogOpen(false);

    const assignedTechnician = technicians.find(t => t.id === technicianId);

    toast({
      title: "Work Order Assigned!",
      description: `${selectedOrder.id.toUpperCase()} has been assigned to ${
        assignedTechnician?.name
      }.`,
    });
  }

  const handleDelete = (orderId: string) => {
    setWorkOrders(currentOrders =>
      currentOrders.filter(order => order.id !== orderId)
    );
    toast({
      title: "Work Order Deleted",
      description: `Work Order ${orderId.toUpperCase()} has been removed.`,
    });
  }


  const recommendedTechnician = useMemo(() => {
    if (!recommendation) return null;
    return technicians.find(
      (t) => t.id === recommendation.recommendedTechnicianId
    );
  }, [recommendation, technicians]);

  const alternativeTechnicians = useMemo(() => {
    if (!recommendation?.alternativeTechnicianIds) return [];
    return recommendation.alternativeTechnicianIds
      .map((id) => technicians.find((t) => t.id === id))
      .filter((t): t is Technician => t !== undefined);
  }, [recommendation, technicians]);


  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "140px" }}>ID / Status</th>
              <th>Description & Client</th>
              <th style={{ width: "160px" }}>Schedule</th>
              <th style={{ width: "110px" }}>Pay ($)</th>
              <th style={{ width: "180px" }}>Site Location</th>
              <th style={{ width: "160px" }}>Assigned Technician</th>
              <th style={{ width: "110px" }}></th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((order) => {
              const technician = technicians.find(
                (t) => t.id === order.assignedTechnicianId
              );
              return (
                <tr key={order.id}>
                  <td>
                    <div className="cell-id">{order.id.toUpperCase()}</div>
                    <div className="cell-status-stack">
                       <Badge variant={order.priority === 'critical' || order.priority === 'high' ? 'high' : order.priority === 'medium' ? 'medium' : 'low'} className="normal-case">{order.priority}</Badge>
                       <Badge variant={order.status === 'unassigned' ? 'pending' : order.status === 'in-progress' ? 'inprogress' : order.status} className="capitalize">{order.status}</Badge>
                    </div>
                  </td>
                  <td>
                    <div className="cell-desc-title">{order.description}</div>
                    <div className="cell-desc-client">
                      <Briefcase />
                      <span>{order.projectType} - {order.clientName}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell-sched">
                      <div className="cell-sched-date">
                        <Calendar />
                        <span>{order.scheduleDate}</span>
                      </div>
                      <div className="cell-sched-time">
                        <Clock />
                        <span>{order.scheduleTime}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-pay">
                      <DollarSign />
                      <span className="cell-pay-val">{order.pay.toFixed(2)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell-loc">
                      <MapPin />
                      <span>{order.location}</span>
                    </div>
                  </td>
                  <td>
                    {technician ? (
                      <div className="cell-tech-assigned">
                         <Avatar className="h-8 w-8">
                           <AvatarImage asChild src={technician.avatarUrl} alt={technician.name}>
                             <Image src={technician.avatarUrl} alt={technician.name} width={32} height={32} />
                            </AvatarImage>
                            <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                         </Avatar>
                         <span className="text-sm font-semibold text-text-primary">{technician.name}</span>
                      </div>
                    ) : (
                      <div className="cell-tech-awaiting">
                        <User />
                        Awaiting Staff
                      </div>
                    )}
                  </td>
                  <td>
                     <div className="cell-actions">
                      {order.status === "unassigned" && (
                         <button className="btn-assign" onClick={() => handleOpenDialog(order)}>
                           <UserPlus />
                           Assign
                         </button>
                      )}
                       <button className="btn-delete" onClick={() => handleDelete(order.id)}>
                         <Trash2 />
                       </button>
                     </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[625px] bg-bg-elevated border-border-default">
          <DialogHeader>
            <DialogTitle className="page-title text-xl">
              AI Assignment
            </DialogTitle>
            <DialogDescription className="page-subtitle">
              For Work Order: {selectedOrder?.id.toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {!recommendation && !isLoading && (
              <div className="text-center space-y-4">
                 <div className="flex justify-center">
                    <Wand2 size={48} className="text-accent-gold"/>
                 </div>
                 <p className="text-text-secondary">Get an AI-powered technician recommendation based on skills, location, and workload.</p>
                 <Button onClick={handleGetRecommendation} variant="secondary">
                    <Sparkles className="mr-2 h-4 w-4" /> Get Recommendation
                </Button>
              </div>
            )}
            {isLoading && (
              <div className="flex items-center justify-center p-8 space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
                <p className="text-text-secondary">Analyzing technicians...</p>
              </div>
            )}
            {recommendation && recommendedTechnician && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-accent-gold mb-2">Top Recommendation</h3>
                  <div className="rounded-lg border border-border-default bg-bg-secondary">
                    <div className="flex flex-row items-center gap-4 p-4">
                       <Avatar className="h-12 w-12">
                         <AvatarImage asChild src={recommendedTechnician.avatarUrl} alt={recommendedTechnician.name}>
                           <Image src={recommendedTechnician.avatarUrl} alt={recommendedTechnician.name} width={48} height={48} />
                          </AvatarImage>
                          <AvatarFallback>{recommendedTechnician.name.charAt(0)}</AvatarFallback>
                       </Avatar>
                       <div className="flex-1">
                         <div className="text-base font-bold tracking-normal text-text-primary">{recommendedTechnician.name}</div>
                         <div className="text-sm text-text-secondary">Reliability: {recommendedTechnician.reliabilityScore}% | Workload: {recommendedTechnician.currentWorkload}</div>
                       </div>
                       <Button onClick={() => handleAssign(recommendedTechnician.id)}>
                         <Rocket className="mr-2 h-4 w-4" /> Assign
                       </Button>
                    </div>
                    <div className="p-4 border-t border-border-default">
                      <p className="text-sm font-semibold mb-1 text-text-primary">Reasoning:</p>
                      <p className="text-sm text-text-secondary">{recommendation.reasoning}</p>
                    </div>
                  </div>
                </div>

                {alternativeTechnicians.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-text-primary">Alternatives</h3>
                    <div className="space-y-2">
                      {alternativeTechnicians.map(tech => (
                        <div key={tech.id} className="rounded-lg border border-border-default bg-bg-tertiary">
                          <div className="flex flex-row items-center gap-4 p-4">
                            <Avatar className="h-10 w-10">
                              <AvatarImage asChild src={tech.avatarUrl} alt={tech.name}>
                                 <Image src={tech.avatarUrl} alt={tech.name} width={40} height={40} />
                              </AvatarImage>
                              <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-semibold text-text-primary">{tech.name}</p>
                              <p className="text-xs text-text-secondary">Reliability: {tech.reliabilityScore}% | Workload: {tech.currentWorkload}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleAssign(tech.id)}>Assign</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
