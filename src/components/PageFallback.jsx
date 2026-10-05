import React from "react";

export default function PageFallback() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0f]">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-lime-400 rounded-full animate-spin"></div>
        </div>
    );
}