'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { OrderProvider } from '@/context/OrderContext';
import { CourierRatioProvider } from '@/context/CourierRatioContext';
import { TaskProvider } from '@/context/TaskContext';
import { AuthLoader } from '@/components/AuthLoader';
import { DevPerfForensics } from '@/components/DevPerfForensics';

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthReady && !loading && !user) {
      router.replace('/login');
    }
  }, [user, isAuthReady, loading, router]);

  if (!isAuthReady || loading) {
    return <AuthLoader />;
  }

  if (!user) {
    return <AuthLoader />;
  }

  return (
    <OrderProvider>
      <CourierRatioProvider>
        <TaskProvider>
          <DevPerfForensics />
          <DashboardLayout>{children}</DashboardLayout>
        </TaskProvider>
      </CourierRatioProvider>
    </OrderProvider>
  );
}

export default function DashboardShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
