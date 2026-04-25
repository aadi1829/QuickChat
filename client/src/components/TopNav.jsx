import React from "react";
import RoleTabs from "./RoleTabs";

export const TopNav = ({ role, isLive = false, onNavigate, right }) => (
    <nav
        className="px-4 sm:px-8 py-4 flex items-center gap-4 sticky top-0 z-30"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
    >
        <div className="flex items-center gap-2.5 flex-1">
            <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--gold)" }}
            >
                <span className="font-black text-xs" style={{ color: "#0A0A0A" }}>
                    QC
                </span>
            </div>
            <div>
                <p className="font-black text-sm leading-none" style={{ color: "var(--text)" }}>
                    QuickChat
                </p>
                <p
                    className="text-[9px] tracking-[0.18em] uppercase mt-0.5"
                    style={{ color: "var(--muted)" }}
                >
                    ASTRO · TECH · SESSIONS
                </p>
            </div>
        </div>

        <RoleTabs role={role} onClick={(tab) => onNavigate?.(tab)} />

        {isLive && (
            <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{
                    background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)",
                }}
            >
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--live)" }} />
                <span className="text-xs font-bold tracking-widest" style={{ color: "var(--live)" }}>
                    LIVE
                </span>
            </div>
        )}

        {right}
    </nav>
);

