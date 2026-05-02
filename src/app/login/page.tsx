"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { technicians } from "@/lib/data";
import { PlaceHolderImages } from "@/lib/placeholder-images";

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
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(data: LoginFormValues) {
    const user = technicians.find(
      (t) => t.email.toLowerCase() === data.email.toLowerCase()
    );

    const isTech =
      user &&
      (user.role.toLowerCase().includes("tech") ||
        user.role.toLowerCase().includes("specialist") ||
        user.role.toLowerCase().includes("integrator"));

    if (typeof window !== "undefined") {
      if (isTech && user) {
        localStorage.setItem("currentUserId", user.id);
      } else if (user) {
        localStorage.setItem("currentUserId", user.id);
      } else {
        localStorage.setItem("currentUserId", "staff-002");
      }
    }

    if (isTech) {
      router.push("/tech/dashboard");
    } else {
      router.push("/admin/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <Card className="w-full max-w-sm border-border-default bg-bg-secondary shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {logo && (
              <Image 
                src={logo.imageUrl} 
                alt="Aaromach Logo" 
                width={80} 
                height={80} 
                className="object-contain"
                data-ai-hint={logo.imageHint}
                priority
                style={{ height: '80px', width: 'auto' }}
              />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold uppercase tracking-wider text-text-primary">
              Command Center
            </CardTitle>
            <CardDescription className="text-text-muted">
              Precision, Quality and Connectivity
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted">Secure Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@aaromach.com"
                className="bg-bg-primary border-border-sub"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs font-bold text-brand-red uppercase">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" text-xs font-bold uppercase tracking-widest text-text-muted>Access Key</Label>
              <Input 
                id="password" 
                type="password" 
                {...register("password")} 
                placeholder="••••••••" 
                className="bg-bg-primary border-border-sub"
              />
              {errors.password && (
                <p className="text-xs font-bold text-brand-red uppercase">
                  {errors.password.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full h-11 bg-brand-red hover:bg-brand-red-hover text-white font-bold uppercase tracking-widest">
              Initiate Login
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
