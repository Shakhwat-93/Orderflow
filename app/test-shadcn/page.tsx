// @ts-nocheck
'use client';

import React from 'react';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/context/AlertContext";
import { useConfirm } from "@/hooks/useConfirm";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Bell, ShieldAlert, Sparkles } from "lucide-react";

export default function TestShadcnPage() {
  const { showAlert, showSuccess, showError, showWarning } = useAlert();

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Shadcn UI Showcase</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verification of Shadcn &apos;Alert&apos; and &apos;Button&apos; components integrated in OrderFlow OMS.
        </p>
      </div>

      {/* ── 1. Static In-Page Alert Components ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">In-Page Callout Alerts</h2>
        
        {/* Basic Default Alert with Action */}
        <Alert>
          <Info />
          <AlertTitle>Heads up!</AlertTitle>
          <AlertDescription>
            You can add components and dependencies to your app using the shadcn CLI.
          </AlertDescription>
          <AlertAction>
            <Button size="xs" variant="outline">Enable</Button>
          </AlertAction>
        </Alert>

        {/* Destructive Alert */}
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Error Encountered</AlertTitle>
          <AlertDescription>
            Your session has timed out or database access was temporarily restricted. Please re-authenticate.
          </AlertDescription>
          <AlertAction>
            <Button size="xs" variant="destructive">Retry</Button>
          </AlertAction>
        </Alert>

        {/* Warning Alert */}
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Pending Reconciliation</AlertTitle>
          <AlertDescription>
            3 parcel disbursements are awaiting settlement confirmation from Steadfast Courier.
          </AlertDescription>
          <AlertAction>
            <Button size="xs" variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-300">
              Inspect
            </Button>
          </AlertAction>
        </Alert>

        {/* Success Alert */}
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>Batch Dispatched</AlertTitle>
          <AlertDescription>
            All 42 queued orders were successfully assigned tracking numbers and dispatched.
          </AlertDescription>
        </Alert>

        {/* Custom Info Alert */}
        <Alert variant="info">
          <Sparkles />
          <AlertTitle>Courier Intelligence Active</AlertTitle>
          <AlertDescription>
            Fraud analysis engine is scanning incoming delivery ratios with 99.8% precision.
          </AlertDescription>
        </Alert>
      </div>

      {/* ── 2. Global Toast Alerts (Replaces browser alert) ── */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground">Global Floating Alerts (Replacing window.alert)</h2>
        <p className="text-xs text-muted-foreground">
          Clicking any button triggers a live, animated Shadcn Alert floating toast notification:
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            onClick={() => alert("Order #317420 has been verified and marked Confirmed.")}
          >
            Trigger Success (via alert())
          </Button>

          <Button
            variant="destructive"
            onClick={() => alert("Failed to connect to Steadfast Courier API. Error: Request timed out.")}
          >
            Trigger Error (via alert())
          </Button>

          <Button
            variant="outline"
            onClick={() => alert("Please enter delivery address before confirming this incomplete order.")}
          >
            Trigger Warning (via alert())
          </Button>

          <Button
            variant="secondary"
            onClick={() => showSuccess("All 500 orders refreshed in memory.", "Inventory Synchronized")}
          >
            Trigger via useAlert()
          </Button>
        </div>
      </div>

      {/* ── 3. Shadcn AlertDialog / useConfirm() Showcase ── */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground">Shadcn Alert Dialog System (Replacing window.confirm)</h2>
        <p className="text-xs text-muted-foreground">
          Click any button below to trigger the accessible, responsive shadcn AlertDialog confirmation modal:
        </p>

        <ConfirmDemoButtons />
      </div>

      {/* ── 4. Button Variants ── */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground">Shadcn Button Variants</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDemoButtons() {
  const confirm = useConfirm();
  const [result, setResult] = React.useState<string | null>(null);

  const testDestructive = async () => {
    const ok = await confirm({
      title: "Permanently Delete Product?",
      description: "Are you sure you want to delete 'Smart Interactive Robot'? This action cannot be undone and will remove all stock history.",
      confirmLabel: "Delete Product",
      variant: "destructive",
      badge: "Irreversible",
    });
    setResult(ok ? "Confirmed Destructive Action (User clicked Delete)" : "Cancelled Destructive Action");
  };

  const testWarning = async () => {
    const ok = await confirm({
      title: "Discard Unsaved Changes?",
      description: "You have unsaved form entries in the batch creator. Leaving this tab now will lose your pending changes.",
      confirmLabel: "Discard Changes",
      variant: "warning",
    });
    setResult(ok ? "Confirmed Warning Action (User clicked Discard)" : "Cancelled Warning Action");
  };

  const testNormal = async () => {
    const ok = await confirm({
      title: "Start Automatic Distribution?",
      description: "The intelligent distribution engine will evaluate warehouse stock and confirm orders based on real-time inventory.",
      confirmLabel: "Start Distribution",
      variant: "default",
    });
    setResult(ok ? "Confirmed Normal Action (Distribution started)" : "Cancelled Normal Action");
  };

  const testBatch = async () => {
    const ok = await confirm({
      title: "Bulk Move to Courier Workflow?",
      description: "Move 48 confirmed orders into the courier ready queue for automated label printing and tracking assignment.",
      confirmLabel: "Distribute Orders",
      variant: "default",
      affectedCount: 48,
      badge: "Batch Action",
    });
    setResult(ok ? "Confirmed Batch Action (48 orders moved)" : "Cancelled Batch Action");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button variant="destructive" onClick={testDestructive}>
          Test Destructive Dialog
        </Button>
        <Button variant="outline" className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10" onClick={testWarning}>
          Test Warning Dialog
        </Button>
        <Button variant="default" onClick={testNormal}>
          Test Normal Dialog
        </Button>
        <Button variant="secondary" onClick={testBatch}>
          Test Batch Dialog (48 items)
        </Button>
      </div>
      {result && (
        <div className="p-3 rounded-lg bg-muted/60 border border-border text-xs font-mono text-foreground">
          Result: <span className="font-semibold text-primary">{result}</span>
        </div>
      )}
    </div>
  );
}
