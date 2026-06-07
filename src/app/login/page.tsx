"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { isAdmin, isTech, isClient } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const firebaseUser = userCredential.user;

      toast({
        title: "Authorization Successful",
        description: `Terminal access granted.`,
      });

      handleRedirect(firebaseUser);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "Invalid credentials. Please verify your email and password.",
      });
    } finally {
      setIsLoading(false);
    }
  }

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
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted text-left block">Email</Label>
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
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-text-muted">Password</Label>
                <Link href="/forgot-password" className="text-[9px] font-black uppercase text-brand-red hover:underline tracking-tighter">
                  Forgot Password?
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
                <p className="text-[10px] font-bold text-brand-red uppercase text-left">{errors.password.message}</p>
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
                "Login"
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
