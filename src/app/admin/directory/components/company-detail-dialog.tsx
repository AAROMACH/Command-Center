'use client';

import { useState, useMemo } from 'react';
import type { Technician, Invoice, Project, WorkOrder } from '@/lib/types';
import { invoices, projects, workOrders } from '@/lib/data';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Building2, 
  Users, 
  Banknote, 
  FileText, 
  MapPin, 
  StickyNote, 
  Mail, 
  Phone, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  FolderOpen,
  Plus,
  Check,
  X
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type CompanyDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  companyName: string;
  personnel: Technician[];
};

export function CompanyDetailDialog({ isOpen, setIsOpen, companyName, personnel }: CompanyDetailDialogProps) {
  const [notes, setNotes] = useState("");
  const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
  const [newSiteData, setNewSiteData] = useState({ name: '', location: '' });
  const { toast } = useToast();

  const companyContacts = useMemo(() => 
    personnel.filter(p => p.clientCompany === companyName),
  [personnel, companyName]);

  const primaryContact = companyContacts[0];

  const companyInvoices = useMemo(() => 
    invoices.filter(inv => inv.clientName === companyName),
  [companyName]);

  const companyProjects = useMemo(() => 
    projects.filter(p => p.client === companyName),
  [companyName]);

  const companySites = useMemo(() => {
    const sites = new Set<string>();
    companyContacts.forEach(c => {
        c.managedSites?.forEach(s => sites.add(JSON.stringify(s)));
    });
    // Also check work orders
    workOrders.filter(wo => wo.clientName === companyName).forEach(wo => {
        sites.add(JSON.stringify({ id: `wo-${wo.id}`, name: wo.location.split(',')[0], location: wo.location }));
    });
    return Array.from(sites).map(s => JSON.parse(s));
  }, [companyContacts, companyName]);

  const totalOutstanding = useMemo(() => 
    companyInvoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
      .reduce((acc, inv) => acc + inv.total, 0)
  , [companyInvoices]);

  const handleAddSite = () => {
      if (!newSiteData.name || !newSiteData.location) return;
      toast({
          title: "Site Coordinate Authorized",
          description: `${newSiteData.name} has been added to the ${companyName} registry.`,
      });
      setIsAddSiteOpen(false);
      setNewSiteData({ name: '', location: '' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[1000px] bg-bg-elevated border-border-default max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-bg-secondary rounded-lg border border-border-sub">
                <Building2 size={32} className="text-brand-red" />
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <DialogTitle className="text-2xl font-bold uppercase tracking-wide">{companyName}</DialogTitle>
                    <Badge variant="active" className="text-[10px] uppercase h-5 tracking-widest">Client Account</Badge>
                </div>
                <DialogDescription className="text-xs uppercase font-bold text-text-muted tracking-[0.2em] flex items-center gap-2">
                    {primaryContact?.businessType || 'Enterprise Services'} • {companySites.length} Active Sites
                </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
            <div className="px-6 border-b border-border-sub bg-bg-secondary/20">
                <TabsList className="h-12 bg-transparent p-0 gap-8 justify-start">
                    <TabsTrigger value="overview" className="tab-trigger">Overview</TabsTrigger>
                    <TabsTrigger value="financial" className="tab-trigger">Financial</TabsTrigger>
                    <TabsTrigger value="sites" className="tab-trigger">Sites</TabsTrigger>
                    <TabsTrigger value="contacts" className="tab-trigger">Contacts</TabsTrigger>
                    <TabsTrigger value="documents" className="tab-trigger">Documents</TabsTrigger>
                    <TabsTrigger value="notes" className="tab-trigger">Notes</TabsTrigger>
                </TabsList>
            </div>

            <ScrollArea className="flex-1 p-6">
                {/* OVERVIEW */}
                <TabsContent value="overview" className="m-0 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-1">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total Lifecycle Value</p>
                            <p className="text-2xl font-mono font-bold text-text-green">${companyInvoices.reduce((acc, inv) => acc + inv.total, 0).toLocaleString()}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-1">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Outstanding Balance</p>
                            <p className="text-2xl font-mono font-bold text-brand-red">${totalOutstanding.toLocaleString()}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-1">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Active Projects</p>
                            <p className="text-2xl font-bold text-text-primary">{companyProjects.filter(p => p.status === 'active').length}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                            <ShieldCheck size={14}/> Operational Identity
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 rounded-lg border border-border-sub bg-bg-secondary/50">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Account Structure</p>
                                    <p className="text-sm font-bold text-text-primary uppercase">Tier 1 Strategic Partner</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Primary Site</p>
                                    <p className="text-sm text-text-secondary">{companySites[0]?.location || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Billing Cycle</p>
                                    <p className="text-sm text-text-secondary">Standard Net-30 Settlement</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Service Level Agreement</p>
                                    <Badge variant="active" className="text-[9px]">4-Hour Response Guarantee</Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* FINANCIAL */}
                <TabsContent value="financial" className="m-0 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-primary">Invoice Ledger</h3>
                        <Button variant="outline" size="sm" className="h-8 !text-[10px]">
                            <ExternalLink size={12} className="mr-2" /> View Billing Portal
                        </Button>
                    </div>
                    <div className="table-wrap p-0">
                        <Table>
                            <TableHeader className="bg-bg-tertiary">
                                <TableRow className="hover:bg-transparent border-border-sub">
                                    <TableHead className="text-[10px] tracking-widest">Invoice #</TableHead>
                                    <TableHead className="text-[10px] tracking-widest">Date</TableHead>
                                    <TableHead className="text-[10px] tracking-widest">Status</TableHead>
                                    <TableHead className="text-right text-[10px] tracking-widest">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {companyInvoices.map(inv => (
                                    <TableRow key={inv.id} className="border-border-sub">
                                        <TableCell className="font-mono text-xs font-bold">INV-{inv.invoiceNumber}</TableCell>
                                        <TableCell className="text-xs text-text-muted">{inv.issueDate}</TableCell>
                                        <TableCell>
                                            <Badge variant={inv.status === 'paid' ? 'active' : 'onhold'} className="text-[8px] uppercase">
                                                {inv.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-text-primary">${inv.total.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                                {companyInvoices.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-text-muted italic text-xs">No financial records found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* SITES */}
                <TabsContent value="sites" className="m-0 space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{companySites.length} Authorized Locations</p>
                        <Button variant="default" size="sm" className="h-8 !text-[10px]" onClick={() => setIsAddSiteOpen(true)}>
                            <Plus size={14} className="mr-1.5"/> Add Verified Site
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {companySites.map((site, idx) => (
                            <div key={idx} className="p-4 rounded-lg border border-border-sub bg-bg-primary hover:border-text-muted transition-colors flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-bg-tertiary rounded border border-border-sub group-hover:text-brand-red transition-colors">
                                        <MapPin size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{site.name}</p>
                                        <p className="text-[10px] text-text-muted">{site.location}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-primary">
                                    <ExternalLink size={14} />
                                </Button>
                            </div>
                        ))}
                    </div>

                    {isAddSiteOpen && (
                        <div className="p-4 rounded-lg bg-bg-secondary border border-brand-red/30 animate-in fade-in slide-in-from-top-2 duration-300">
                             <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[10px] font-black uppercase text-brand-red tracking-widest">New Site Enrollment</h4>
                                <button onClick={() => setIsAddSiteOpen(false)} className="text-text-muted hover:text-text-primary"><X size={14}/></button>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[9px] uppercase font-bold text-text-muted">Site Identifier</Label>
                                    <Input 
                                        placeholder="e.g. Data Center West" 
                                        className="h-9 text-xs bg-bg-primary"
                                        value={newSiteData.name}
                                        onChange={e => setNewSiteData({...newSiteData, name: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[9px] uppercase font-bold text-text-muted">Operational Coordinates (Address)</Label>
                                    <Input 
                                        placeholder="Full address..." 
                                        className="h-9 text-xs bg-bg-primary"
                                        value={newSiteData.location}
                                        onChange={e => setNewSiteData({...newSiteData, location: e.target.value})}
                                    />
                                </div>
                             </div>
                             <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border-sub/50">
                                <Button variant="ghost" size="sm" className="h-8 !text-[10px]" onClick={() => setIsAddSiteOpen(false)}>Discard</Button>
                                <Button size="sm" className="h-8 !text-[10px] bg-brand-red" onClick={handleAddSite} disabled={!newSiteData.name || !newSiteData.location}>
                                    <Check size={14} className="mr-1.5"/> Authorize Registry
                                </Button>
                             </div>
                        </div>
                    )}
                </TabsContent>

                {/* CONTACTS */}
                <TabsContent value="contacts" className="m-0 space-y-4">
                    <div className="space-y-2">
                        {companyContacts.map(contact => (
                            <div key={contact.id} className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary hover:bg-bg-tertiary transition-colors">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10 border border-border-sub">
                                        <AvatarImage src={contact.avatarUrl} />
                                        <AvatarFallback>{contact.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{contact.name}</p>
                                        <p className="text-[10px] text-text-muted">{contact.role}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" className="h-8 w-8 text-text-muted"><Mail size={14}/></Button>
                                    <Button variant="outline" size="icon" className="h-8 w-8 text-text-muted"><Phone size={14}/></Button>
                                    <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold">Edit Profile</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* DOCUMENTS */}
                <TabsContent value="documents" className="m-0">
                    <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                        <FolderOpen size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No corporate assets uploaded to registry.</p>
                        <Button variant="outline" className="mt-6 uppercase font-bold text-[10px] tracking-widest">
                            <Plus size={14} className="mr-2"/> Upload MSA / Contract
                        </Button>
                    </div>
                </TabsContent>

                {/* NOTES */}
                <TabsContent value="notes" className="m-0 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Internal Account Intelligence</Label>
                        <Textarea 
                            placeholder="Add strategic account notes, historical context, or stakeholder preferences..." 
                            className="min-h-[200px] bg-bg-primary border-border-sub text-xs leading-relaxed"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                    <div className="p-4 rounded-lg bg-bg-tertiary/50 border border-border-sub flex items-start gap-3">
                        <StickyNote size={16} className="text-accent-gold shrink-0 mt-0.5" />
                        <p className="text-[10px] text-text-secondary leading-normal italic">
                            Terminal Note: Account intelligence is only visible to administrative personnel and project managers. 
                        </p>
                    </div>
                </TabsContent>
            </ScrollArea>

            <DialogFooter className="p-6 border-t border-border-sub bg-bg-tertiary/30">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                <Button className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
                    Commit Updates
                </Button>
            </DialogFooter>
        </Tabs>
      </DialogContent>
      <style jsx global>{`
        .tab-trigger {
            @apply px-0 h-12 bg-transparent text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted rounded-none border-b-2 border-transparent transition-all;
        }
        .tab-trigger[data-state="active"] {
            @apply text-text-primary border-brand-red bg-transparent shadow-none;
        }
      `}</style>
    </Dialog>
  );
}
