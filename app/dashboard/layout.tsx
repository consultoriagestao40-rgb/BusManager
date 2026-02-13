import Sidebar from '@/components/ui/Sidebar';
import Header from '@/components/ui/Header';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-indigo-50/30">
            {/* Show sidebar on all screens except mobile */}
            <div className="hidden md:flex h-full">
                <Sidebar />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Show header on all screens except mobile */}
                <div className="hidden md:block">
                    <Header />
                </div>
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent p-2 sm:p-4 md:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
