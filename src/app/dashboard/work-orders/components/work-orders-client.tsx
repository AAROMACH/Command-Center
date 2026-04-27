"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { WorkOrder, Technician, Recommendation } from "@/lib/types";
import { getRecommendation } from "../actions";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Rocket, User, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
      description: `${selectedOrder.id.toUpperCase()} has been assigned to ${assignedTechnician?.name}.`,
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
      <Card>
        <CardHeader>
          <CardTitle>All Work Orders</CardTitle>
          <CardDescription>
            View, manage, and assign all active and pending work orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrders.map((order) => {
                const technician = technicians.find(
                  (t) => t.id === order.assignedTechnicianId
                );
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.id.toUpperCase()}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">{order.description}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === "unassigned" ? "destructive" : "secondary"
                        }
                        className="capitalize"
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.priority === "critical" ||
                          order.priority === "high"
                            ? "destructive"
                            : "default"
                        }
                        className="capitalize"
                      >
                        {order.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {technician ? technician.name : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      {order.status === "unassigned" && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenDialog(order)}
                        >
                          <Sparkles className="mr-2 h-4 w-4" /> Recommend
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">
              AI Assignment Recommendation
            </DialogTitle>
            <DialogDescription>
              For Work Order: {selectedOrder?.id.toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {!recommendation && !isLoading && (
              <div className="text-center space-y-4">
                 <div className="flex justify-center">
                    <Wand2 size={48} className="text-accent"/>
                 </div>
                 <p className="text-muted-foreground">Get an AI-powered technician recommendation based on skills, location, and workload.</p>
                 <Button onClick={handleGetRecommendation}>
                    <Sparkles className="mr-2 h-4 w-4" /> Get Recommendation
                </Button>
              </div>
            )}
            {isLoading && (
              <div className="flex items-center justify-center p-8 space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Analyzing technicians...</p>
              </div>
            )}
            {recommendation && recommendedTechnician && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-accent mb-2">Top Recommendation</h3>
                  <Card>
                    <CardHeader className="flex flex-row items-center gap-4">
                       <Avatar className="h-12 w-12">
                         <AvatarImage asChild src={recommendedTechnician.avatarUrl} alt={recommendedTechnician.name}>
                           <Image src={recommendedTechnician.avatarUrl} alt={recommendedTechnician.name} width={48} height={48} />
                          </AvatarImage>
                          <AvatarFallback>{recommendedTechnician.name.charAt(0)}</AvatarFallback>
                       </Avatar>
                       <div className="flex-1">
                         <CardTitle>{recommendedTechnician.name}</CardTitle>
                         <CardDescription>Reliability: {recommendedTechnician.reliabilityScore}% | Workload: {recommendedTechnician.currentWorkload}</CardDescription>
                       </div>
                       <Button onClick={() => handleAssign(recommendedTechnician.id)}>
                         <Rocket className="mr-2 h-4 w-4" /> Assign
                       </Button>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-semibold mb-1">Reasoning:</p>
                      <p className="text-sm text-muted-foreground">{recommendation.reasoning}</p>
                    </CardContent>
                  </Card>
                </div>

                {alternativeTechnicians.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Alternatives</h3>
                    <div className="space-y-2">
                      {alternativeTechnicians.map(tech => (
                        <Card key={tech.id} className="bg-card/50">
                          <CardHeader className="flex flex-row items-center gap-4 p-4">
                            <Avatar className="h-10 w-10">
                              <AvatarImage asChild src={tech.avatarUrl} alt={tech.name}>
                                 <Image src={tech.avatarUrl} alt={tech.name} width={40} height={40} />
                              </AvatarImage>
                              <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-semibold">{tech.name}</p>
                              <p className="text-xs text-muted-foreground">Reliability: {tech.reliabilityScore}% | Workload: {tech.currentWorkload}</p>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => handleAssign(tech.id)}>Assign</Button>
                          </CardHeader>
                        </Card>
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
