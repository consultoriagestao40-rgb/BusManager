import Sidebar from '@/components/ui/Sidebar';
import Header from '@/components/ui/Header';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-gray-100">
            {/* Hide sidebar on mobile/tablet */}
            <div className="hidden lg:block">
                <Sidebar />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Hide header on mobile/tablet */}
                <div className="hidden lg:block">
                    <Header />
                </div>
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-2 sm:p-4 lg:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
