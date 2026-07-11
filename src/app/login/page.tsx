"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { getPortalAccess, getAvailablePortals } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: "Authorization Successful", description: "Terminal access granted." });
      await handleRedirect(userCredential.user);
    } catch {
      toast({ variant: "destructive", title: "Access Denied", description: "Invalid credentials. Please verify your email and password." });
    } finally {
      setIsLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setIsGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;

      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (!snap.exists()) {
        // First Google sign-in: create a pending-approval record — no roles assigned
        await setDoc(doc(db, "users", firebaseUser.uid), {
          id: firebaseUser.uid,
          userId: firebaseUser.uid,
          authUid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "New User",
          email: firebaseUser.email || "",
          phone: "",
          phoneNumber: firebaseUser.phoneNumber || "",
          avatarUrl: firebaseUser.photoURL || "",
          photoURL: firebaseUser.photoURL || "",
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
          createdVia: "google_sso",
        });
      } else {
        // Sync Google profile fields if they changed
        const existing = snap.data();
        const updates: Record<string, string> = {};
        if (firebaseUser.photoURL && existing.avatarUrl !== firebaseUser.photoURL) updates.avatarUrl = firebaseUser.photoURL;
        if (firebaseUser.displayName && existing.name !== firebaseUser.displayName) updates.name = firebaseUser.displayName;
        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, "users", firebaseUser.uid), updates, { merge: true });
        }
      }

      toast({ title: "Google Sign-In Successful", description: "Terminal access granted." });
      await handleRedirect(firebaseUser);
    } catch (err: any) {
      const code: string = err.code || "";
      console.error("[google-auth] full error:", err);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User dismissed — no toast needed
      } else if (code === "auth/operation-not-allowed") {
        toast({ variant: "destructive", title: "Google Sign-In Not Enabled", description: "Enable Google as a sign-in provider in Firebase Console → Authentication → Sign-in methods." });
      } else if (code === "auth/popup-blocked") {
        toast({ variant: "destructive", title: "Popup Blocked", description: "Allow popups for this site in your browser, then try again." });
      } else if (code.includes("requests-from-referer") || code === "auth/unauthorized-domain") {
        toast({ variant: "destructive", title: "Domain Not Authorized", description: `Add "${window.location.hostname}" to Firebase Console → Authentication → Settings → Authorized Domains.` });
      } else if (code === "auth/internal-error") {
        toast({ variant: "destructive", title: "OAuth Not Configured", description: "Check Google Cloud Console: OAuth consent screen must be published and Google provider enabled in Firebase." });
      } else if (code === "auth/invalid-api-key") {
        toast({ variant: "destructive", title: "Invalid API Key", description: "Update NEXT_PUBLIC_FIREBASE_API_KEY in Firebase App Hosting environment variables." });
      } else {
        toast({ variant: "destructive", title: "Google Sign-In Failed", description: `[${code}] ${err.message || "Could not complete Google authentication."}` });
      }
      console.error("[google-auth]", code, err.message);
    } finally {
      setIsGoogleLoading(false);
    }
  }

  const handleRedirect = async (firebaseUser: any) => {
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      const userData = snap.exists() ? { ...snap.data(), id: snap.id } : null;

      // Gate: no doc, pending, denied, or no roles → do not set cookie, send to pending screen
      const isPending = !userData
        || (userData as any).approvalStatus === 'pending'
        || (userData as any).approvalStatus === 'denied'
        || (!(userData as any).roles?.length && !(userData as any).role);

      if (isPending) {
        router.push("/pending-approval");
        return;
      }

      // Approved user: set session + portals cookie
      const typedUser = userData as any;
      const access = getPortalAccess(typedUser);
      const portals = getAvailablePortals(typedUser);

      // Approved but no portal access — the middleware would bounce every
      // portal route, so hold the user at pending-approval instead of looping.
      if (portals.length === 0) {
        router.push("/pending-approval");
        return;
      }

      sessionStorage.setItem('currentUserId', firebaseUser.uid);
      document.cookie = `aaromach_session=${firebaseUser.uid}; path=/; max-age=86400; SameSite=Strict`;
      document.cookie = `aaromach_portals=${JSON.stringify(access)}; path=/; max-age=86400; SameSite=Strict`;

      if (portals.length > 1 && typedUser.primaryPortal) {
        const primary = portals.find(p => p.id === typedUser.primaryPortal);
        router.push(primary ? primary.path : portals[0].path);
      } else if (portals.length > 1) {
        router.push("/portal-select");
      } else {
        router.push(portals[0].path);
      }
    } catch {
      // Could not load the user profile — pending-approval re-checks via a
      // live listener and routes correctly once the profile is readable.
      router.push("/pending-approval");
    }
  };

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
            <CardTitle className="text-2xl font-bold uppercase tracking-wider text-text-primary">Command Center</CardTitle>
            <CardDescription className="text-text-muted uppercase font-bold text-[10px] tracking-widest">Tactical Operational Terminal</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Email</Label>
              <Input id="email" type="email" disabled={isLoading || isGoogleLoading} placeholder="admin@aaromach.com" className="bg-bg-primary border-border-sub h-11 text-xs" {...register("email")} />
              {errors.email && <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-text-muted">Password</Label>
                <Link href="/forgot-password" className="text-[9px] font-black uppercase text-brand-red hover:underline tracking-tighter">Forgot Password?</Link>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} disabled={isLoading || isGoogleLoading} {...register("password")} placeholder="••••••••" className="bg-bg-primary border-border-sub pr-10 h-11 text-xs" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.password.message}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pb-6">
            <Button type="submit" disabled={isLoading || isGoogleLoading} className="w-full h-12 bg-brand-red hover:bg-brand-red-hover text-white font-bold uppercase tracking-widest text-xs">
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Synchronizing...</> : "Login"}
            </Button>

            <div className="relative w-full flex items-center gap-3">
              <div className="flex-1 h-px bg-border-sub" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">or</span>
              <div className="flex-1 h-px bg-border-sub" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isGoogleLoading}
              onClick={onGoogleSignIn}
              className="w-full h-12 border-border-main bg-bg-primary hover:bg-bg-tertiary font-bold uppercase tracking-widest text-xs flex items-center gap-3"
            >
              {isGoogleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              Continue with Google
            </Button>

            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest text-center px-4 pt-1">Authorized personnel only. All access events are logged.</p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}