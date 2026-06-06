"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');
  const { toast } = useToast();
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setIsSent(true);
      toast({
        title: "Transmission Success",
        description: "Recovery instructions sent to the registered address.",
      });
    } catch (error: any) {
      console.error("Reset error:", error);
      toast({
        variant: "destructive",
        title: "Transmission Failure",
        description: error.message || "Unable to process recovery request at this time.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <Card className="w-full max-w-sm border-border-default bg-bg-secondary shadow-2xl">
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
                style={{ height: '150px', width: 'auto' }}
              />
            )}
          </div>
          <div>
            <CardTitle className="text-xl font-bold uppercase tracking-wider text-text-primary">
              Forgot Password
            </CardTitle>
            <CardDescription className="text-text-muted">
              Initiate password reset protocol
            </CardDescription>
          </div>
        </CardHeader>
        
        {isSent ? (
          <CardContent className="space-y-6 py-6 text-center">
            <div className="flex justify-center">
                <div className="p-4 rounded-full bg-green-dim border border-green-border text-text-green animate-in zoom-in duration-300">
                    <CheckCircle2 size={48} />
                </div>
            </div>
            <div className="space-y-2">
                <p className="text-sm font-bold text-text-primary uppercase tracking-wide">Protocol Initialized</p>
                <p className="text-xs text-text-muted leading-relaxed uppercase">
                    A recovery link has been dispatched to: <br/>
                    <span className="text-text-primary font-bold">{email}</span>
                </p>
            </div>
            <Button 
                variant="outline" 
                className="w-full h-11" 
                onClick={() => router.push("/login")}
            >
                <ArrowLeft size={16} className="mr-2"/> Back to Login
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <Input
                        id="email"
                        type="email"
                        required
                        placeholder=" operative@aaromach.com"
                        className="bg-bg-primary border-border-sub pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-tight">
                  Enter the email address associated with your operative or client registry.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-11 bg-brand-red hover:bg-brand-red-hover text-white font-bold uppercase tracking-widest"
              >
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : "Send Reset Email"}
              </Button>
              <Link 
                href="/login" 
                className="text-[10px] font-bold uppercase text-text-muted hover:text-text-primary transition-colors tracking-[0.2em] flex items-center justify-center gap-2"
              >
                <ArrowLeft size={12}/> Back to Login
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
