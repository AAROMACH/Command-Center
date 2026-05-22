
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { technicians } from "@/lib/data";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { isAdmin, isTech, isClient } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, ShieldAlert, UserCheck, ChevronRight, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const loginSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showBypass, setShowBypass] = useState(false);
  const [demoUser, setDemoUser] = useState<string>("");
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    try {
      // 1. Execute Firebase Auth Handshake
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const firebaseUser = userCredential.user;

      // 2. Cross-reference with Personnel Registry
      const user = technicians.find(
        (t) => t.email.toLowerCase() === firebaseUser.email?.toLowerCase()
      );

      if (typeof window !== "undefined" && user) {
        localStorage.setItem("currentUserId", user.id);
      }

      toast({
        title: "Authorization Successful",
        description: `Terminal access granted for ${user?.name || 'Authorized User'}.`,
      });

      handleRedirect(user);
    } catch (error: any) {
      console.error("Authentication error:", error);
      
      let errorMessage = "An unexpected error occurred during the security handshake.";
      
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = "Invalid operative credentials. Please verify your access key or use the demo bypass.";
        setShowBypass(true);
      } else if (error.code === 'auth/api-key-not-valid') {
        errorMessage = "Mission Blocked: Firebase API Key is missing or invalid.";
        setShowBypass(true);
      }

      toast({
        variant: "destructive",
        title: "Access Denied",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleDemoLogin = () => {
    if (!demoUser) return;
    const user = technicians.find(t => t.id === demoUser);
    if (user) {
      localStorage.setItem("currentUserId", user.id);
      toast({
        title: "Demo Protocol Active",
        description: `Simulated login as ${user.name} established.`,
      });
      handleRedirect(user);
    }
  };

  const handleRedirect = (user: any) => {
    if (isAdmin(user)) {
      router.push("/admin/dashboard");
    } else if (isTech(user)) {
      router.push("/tech/dashboard");
    } else if (isClient(user)) {
      router.push("/client/dashboard");
    } else {
      router.push("/admin/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <Card className="w-full max-w-sm border-border-default bg-bg-secondary shadow-2xl overflow-hidden">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {logo && (
              <Image 
                src={logo.imageUrl} 
                alt="Aaromach Logo" 
                width={300} 
                height={150} 
                className="object-contain"
                data-ai-hint={logo.imageHint}
                priority
                style={{ height: '120px', width: 'auto' }}
              />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold uppercase tracking-wider text-text-primary">
              Command Center
            </CardTitle>
            <CardDescription className="text-text-muted uppercase font-bold text-[10px] tracking-widest">
              Tactical Operational Terminal
            </CardDescription>
          </div>
        </CardHeader>
        
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Registry Email</Label>
              <Input
                id="email"
                type="email"
                disabled={isLoading}
                placeholder="admin@aaromach.com"
                className="bg-bg-primary border-border-sub h-11 text-xs"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-text-muted">Access Key</Label>
                <Link 
                  href="/forgot-password" 
                  className="text-[9px] font-black uppercase text-brand-red hover:underline tracking-tighter"
                >
                  Lost Credentials?
                </Link>
              </div>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  disabled={isLoading}
                  {...register("password")} 
                  placeholder="••••••••" 
                  className="bg-bg-primary border-border-sub pr-10 h-11 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[10px] font-bold text-brand-red uppercase text-left">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-border-sub space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-accent-gold flex items-center gap-2">
                  <Terminal size={12}/> Dev Portal Bypass
                </p>
                <Switch 
                  id="bypass-toggle" 
                  checked={showBypass} 
                  onCheckedChange={setShowBypass}
                  className="scale-75"
                />
              </div>
              
              {showBypass && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[9px] text-text-muted uppercase font-bold text-left leading-relaxed">
                    Select a registered identity to initialize terminal access without Auth credentials.
                  </p>
                  <div className="flex gap-2">
                    <Select value={demoUser} onValueChange={setDemoUser}>
                      <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-[10px] font-bold uppercase">
                        <SelectValue placeholder="Select Identity..." />
                      </SelectTrigger>
                      <SelectContent>
                        {technicians.map(t => (
                          <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">
                            {t.name} ({t.roles?.[0].replace(/_/g, ' ') || t.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleDemoLogin}
                      disabled={!demoUser}
                      className="h-10 px-3 border-accent-gold text-accent-gold hover:bg-accent-gold-dim"
                    >
                      <UserCheck size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full h-12 bg-brand-red hover:bg-brand-red-hover text-white font-bold uppercase tracking-widest text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Synchronizing...
                </>
              ) : (
                "Authorize Terminal Access"
              )}
            </Button>
            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest text-center px-4">
              Authorized personnel only. All access events are logged in the system registry.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
