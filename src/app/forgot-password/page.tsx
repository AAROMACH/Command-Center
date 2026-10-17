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
        title: "Sent",
        description: "Recovery instructions sent to the registered address.",
      });
    } catch (error: any) {
      console.error("Reset error:", error);
      toast({
        variant: "destructive",
        title: "Send failed",
        description: error.message || "Unable to process recovery request at this time.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <Card className="w-full max-w-sm rounded-xl border-border-main bg-bg-secondary shadow-sm">
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
            <CardTitle className="text-xl font-semibold text-text-primary">
              Reset your password
            </CardTitle>
            <CardDescription className="text-text-muted">
              We’ll email you a link to set a new password.
            </CardDescription>
          </div>
        </CardHeader>
        
        {isSent ? (
          <CardContent className="space-y-6 py-6 text-center">
            <div className="flex justify-center">
                <div className="p-4 rounded-full bg-text-green/10 border border-text-green/30 text-text-green animate-in zoom-in duration-300">
                    <CheckCircle2 size={48} />
                </div>
            </div>
            <div className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">Check your email</p>
                <p className="text-[13px] text-text-muted leading-relaxed">
                    We sent a password reset link to <br/>
                    <span className="text-text-primary font-semibold">{email}</span>
                </p>
            </div>
            <Button 
                variant="outline" 
                className="w-full h-10" 
                onClick={() => router.push("/login")}
            >
                <ArrowLeft size={16} className="mr-2"/> Back to sign in
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[12px] font-medium text-text-secondary">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <Input
                        id="email"
                        type="email"
                        required
                        placeholder="you@company.com"
                        className="bg-bg-primary border-border-main pl-10 h-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <p className="text-[12px] text-text-muted">
                  Enter the email you use to sign in.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-10"
              >
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
              <Link 
                href="/login" 
                className="text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft size={12}/> Back to sign in
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
