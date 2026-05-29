import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SideNav } from './SideNav';

export function AppShell() {
  return (
    <div className="h-screen w-screen bg-[var(--color-bg)] flex overflow-hidden">
      {/* Tablet/desktop: sidebar nav */}
      <SideNav />

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <main
          className="flex-1 min-h-0 min-w-0 w-full px-0 pt-2 md:px-6 md:pt-6 md:pb-4 lg:w-[90%] lg:mx-auto xl:w-[80%] 2xl:w-[70%] flex flex-col pb-[calc(56px+env(safe-area-inset-bottom,0px))] lg:pb-4"
        >
          <Outlet />
        </main>

        {/* Mobile: bottom nav (fixed to viewport bottom) */}
        <BottomNav />
      </div>
    </div>
  );
}
