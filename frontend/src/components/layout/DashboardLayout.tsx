import { createContext, useContext, useState } from "react";
import { Outlet } from "react-router-dom";
import TopNavBar from "./TopNavBar";
import Footer from "./Footer";

const HideFooterContext = createContext<(hide: boolean) => void>(() => {});
export const useHideFooter = () => useContext(HideFooterContext);

const DashboardLayout = () => {
  const [hideFooter, setHideFooter] = useState(false);

  return (
    <HideFooterContext.Provider value={setHideFooter}>
      <div className="min-h-screen flex flex-col bg-surface">
        <TopNavBar />
        <main className="flex-1 pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-8 md:py-12">
            <Outlet />
          </div>
        </main>
        {!hideFooter && <Footer className="border-t border-slate-200/15" />}
      </div>
    </HideFooterContext.Provider>
  );
};

export default DashboardLayout;
