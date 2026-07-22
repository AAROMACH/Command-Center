"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const registerSchema = z.object({
  name: z.string().min(2, { message: "Please enter your full name." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  phone: z.string().optional(),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string().min(6, { message: "Please confirm your password." }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function GetAccessPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterFormValues) {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const firebaseUser = userCredential.user;

      if (data.name) {
        await updateProfile(firebaseUser, { displayName: data.name }).catch(() => {});
      }

      // Create a pending-approval record — no roles assigned until an admin
      // grants access. Mirrors the Google SSO first-login record.
      await setDoc(doc(db, "users", firebaseUser.uid), {
        id: firebaseUser.uid,
        userId: firebaseUser.uid,
        authUid: firebaseUser.uid,
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        phoneNumber: data.phone || "",
        avatarUrl: "",
        photoURL: "",
        roles: [],
        approvalStatus: 'pending',
        accountStatus: 'inactive',
        reliabilityScore: 100,
        currentWorkload: 0,
        skills: [],
        currentLocation: "",
        availability: {},
        workPreferences: { preferredRadius: 25, maxTravelDistance: 50, preferredJobTypes: [], availabilityOverride: false },
        notificationPreferences: { email: true, sms: false, push: true },
        requestedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdVia: "self_registration",
      });

      toast({ title: "Access Requested", description: "Your account is pending admin approval." });
      router.push("/pending-approval");
    } catch (err: any) {
      const code: string = err.code || "";
      if (code === "auth/email-already-in-use") {
        toast({ variant: "destructive", title: "Email Already Registered", description: "An account with this email already exists. Try logging in instead." });
      } else if (code === "auth/weak-password") {
        toast({ variant: "destructive", title: "Weak Password", description: "Choose a stronger password (at least 6 characters)." });
      } else if (code === "auth/invalid-email") {
        toast({ variant: "destructive", title: "Invalid Email", description: "Please enter a valid email address." });
      } else if (code === "auth/operation-not-allowed") {
        toast({ variant: "destructive", title: "Registration Disabled", description: "Enable Email/Password sign-in in Firebase Console → Authentication → Sign-in methods." });
      } else if (code === "auth/invalid-api-key") {
        toast({ variant: "destructive", title: "Invalid API Key", description: "Update NEXT_PUBLIC_FIREBASE_API_KEY in Firebase App Hosting environment variables." });
      } else {
        toast({ variant: "destructive", title: "Registration Failed", description: `[${code}] ${err.message || "Could not create your account."}` });
      }
      console.error("[get-access]", code, err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <Card className="w-full max-w-sm border-border-default bg-bg-secondary shadow-2xl overflow-hidden">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {logo && (
              <Image src={logo.imageUrl} alt="Aaromach Logo" width={300} height={150} className="object-contain" data-ai-hint={logo.imageHint} priority style={{ height: '120px', width: 'auto' }} />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold uppercase tracking-wider text-text-primary">Get Access</CardTitle>
            <CardDescription className="text-text-muted uppercase font-bold text-[10px] tracking-widest">Request Terminal Credentials</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Full Name</Label>
              <Input id="name" type="text" disabled={isLoading} placeholder="Jane Operative" className="bg-bg-primary border-border-sub h-11 text-xs" {...register("name")} />
              {errors.name && <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Email</Label>
              <Input id="email" type="email" disabled={isLoading} placeholder="operative@aaromach.com" className="bg-bg-primary border-border-sub h-11 text-xs" {...register("email")} />
              {errors.email && <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Phone <span className="text-text-muted/60 normal-case tracking-normal">(optional)</span></Label>
              <Input id="phone" type="tel" disabled={isLoading} placeholder="(555) 123-4567" className="bg-bg-primary border-border-sub h-11 text-xs" {...register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} disabled={isLoading} {...register("password")} placeholder="••••••••" className="bg-bg-primary border-border-sub pr-10 h-11 text-xs" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Confirm Password</Label>
              <Input id="confirmPassword" type={showPassword ? "text" : "password"} disabled={isLoading} {...register("confirmPassword")} placeholder="••••••••" className="bg-bg-primary border-border-sub h-11 text-xs" />
              {errors.confirmPassword && <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.confirmPassword.message}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pb-6">
            <Button type="submit" disabled={isLoading} className="w-full h-12 bg-brand-red hover:bg-brand-red-hover text-white font-bold uppercase tracking-widest text-xs flex items-center gap-2">
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Account...</> : <><UserPlus size={15} className="shrink-0" />Create Account</>}
            </Button>

            <Link href="/login" className="text-[10px] font-bold uppercase text-text-muted hover:text-text-primary transition-colors tracking-[0.2em] flex items-center justify-center gap-2 pt-1">
              <ArrowLeft size={12} /> Back to Login
            </Link>

            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest text-center px-4 pt-1">New accounts require admin approval before access is granted.</p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
