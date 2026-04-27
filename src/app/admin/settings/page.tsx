import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Administration
                    </p>
                    <h1 className="page-title">System Settings</h1>
                    <p className="page-subtitle">Configure global settings for the command center application.</p>
                </div>
            </header>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-4 max-w-2xl">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    <TabsTrigger value="api">API & Integrations</TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                    <TabsContent value="general">
                        <Card>
                            <CardHeader>
                                <CardTitle>General Settings</CardTitle>
                                <CardDescription>Manage basic application settings.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="appName">Application Name</Label>
                                    <Input id="appName" defaultValue="Aaromach Command Center" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="timezone">Timezone</Label>
                                    <Select defaultValue="est">
                                        <SelectTrigger id="timezone">
                                            <SelectValue placeholder="Select a timezone" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
                                            <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
                                            <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t px-6 py-4">
                                <Button>Save Changes</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="security">
                        <Card>
                            <CardHeader>
                                <CardTitle>Security Settings</CardTitle>
                                <CardDescription>Configure password policies and access control.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between rounded-lg border p-4">
                                    <div>
                                        <h4 className="font-semibold">Password Expiration</h4>
                                        <p className="text-sm text-text-muted">Require users to change their password periodically.</p>
                                    </div>
                                    <Switch />
                                </div>
                                <div className="flex items-center justify-between rounded-lg border p-4">
                                    <div>
                                        <h4 className="font-semibold">Enforce Two-Factor Authentication</h4>
                                        <p className="text-sm text-text-muted">Require all users to set up 2FA.</p>
                                    </div>
                                    <Switch defaultChecked />
                                </div>
                            </CardContent>
                            <CardFooter className="border-t px-6 py-4">
                                <Button>Save Security Settings</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="notifications">
                        <Card>
                            <CardHeader>
                                <CardTitle>Global Notification Settings</CardTitle>
                                <CardDescription>Set default notification preferences for all users.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                 <p className="text-sm text-text-muted">These are default settings. Individual users can override them in their personal profiles.</p>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="global-email" className="flex flex-col space-y-1">
                                        <span>Critical Alerts by Email</span>
                                    </Label>
                                    <Switch id="global-email" defaultChecked />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="global-sms" className="flex flex-col space-y-1">
                                        <span>Critical Alerts by SMS</span>
                                    </Label>
                                    <Switch id="global-sms" />
                                </div>
                            </CardContent>
                            <CardFooter className="border-t px-6 py-4">
                                <Button>Save Notification Settings</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="api">
                        <Card>
                            <CardHeader>
                                <CardTitle>API & Integrations</CardTitle>
                                <CardDescription>Manage API keys for third-party integrations.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="google-maps-api">Google Maps API Key</Label>
                                    <Input id="google-maps-api" type="password" defaultValue="AIzaSy...FAKEKEY" />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="twilio-api">Twilio API Key</Label>
                                    <Input id="twilio-api" type="password" defaultValue="SK...FAKEKEY" />
                                </div>
                            </CardContent>
                            <CardFooter className="border-t px-6 py-4 flex justify-between">
                                <Button variant="outline">Generate New Key</Button>
                                <Button>Save API Keys</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
